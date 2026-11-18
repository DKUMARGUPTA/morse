import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { emitToRoom, fail, isResponse, messageInclude, messageToDTO, ok, requireUser, userRoom } from '@/lib/api-helpers'

const userSelect = { id: true, displayName: true, avatarColor: true } as const

async function getMembership(conversationId: string, userId: string) {
  return db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  })
}

/** GET /api/conversations/[id] — conversation detail (1:1 or group) + message history */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const { id } = await ctx.params
  const membership = await getMembership(id, me.id)
  if (!membership) return fail(404, 'NOT_FOUND')

  const conv = await db.conversation.findUnique({
    where: { id },
    include: { members: { include: { user: { select: userSelect } } } },
  })
  if (!conv) return fail(404, 'NOT_FOUND')
  const others = conv.members.filter((m) => m.userId !== me.id)
  if (others.length === 0) return fail(404, 'NOT_FOUND')

  let peer: { id: string; displayName: string; avatarColor: string } | null = null
  let blockedByMe = false
  let blockedMe = false
  if (!conv.isGroup && others[0]) {
    peer = others[0].user
    const blocks = await db.block.findMany({
      where: { OR: [{ blockerId: me.id, blockedId: peer.id }, { blockerId: peer.id, blockedId: me.id }] },
    })
    blockedByMe = blocks.some((b) => b.blockerId === me.id)
    blockedMe = blocks.some((b) => b.blockerId === peer!.id)
  }

  const hidden = await db.messageReceipt.findMany({
    where: { userId: me.id, hidden: true, message: { conversationId: id } },
    select: { messageId: true },
  })
  const hiddenIds = hidden.map((h) => h.messageId)
  // newest 200, returned oldest-first (asc+take would return the OLDEST 200 and
  // hide everything recent in long conversations)
  const messages = await db.message.findMany({
    where: { conversationId: id, id: { notIn: hiddenIds } },
    include: messageInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 200,
  })
  messages.reverse()

  return ok({
    conversation: {
      id,
      peer,
      isGroup: conv.isGroup,
      name: conv.name,
      members: conv.members.map((m) => ({ ...m.user, role: m.role })),
      myRole: membership.role === 'owner' ? 'owner' : 'member',
      e2eeEnabled: conv.e2eeEnabled,
      createdAt: conv.createdAt.toISOString(),
      blockedByMe,
      blockedMe,
    },
    messages: messages.map((m) => messageToDTO(m, me.id)),
  })
}

/** PATCH /api/conversations/[id] — rename group, or toggle E2EE (beta, 1:1 only) */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const { id } = await ctx.params
  const membership = await getMembership(id, me.id)
  if (!membership) return fail(404, 'NOT_FOUND')

  const conv = await db.conversation.findUnique({ where: { id }, include: { members: true } })
  if (!conv) return fail(404, 'NOT_FOUND')

  try {
    const body = await req.json()

    // ---- rename group (owner only) ----
    if (body.name !== undefined) {
      if (!conv.isGroup) return fail(400, 'NOT_A_GROUP')
      if (membership.role !== 'owner') return fail(403, 'OWNER_ONLY', 'Only the group owner can rename.')
      const name = String(body.name).trim()
      if (!name || name.length > 60) return fail(400, 'BAD_GROUP_NAME')
      await db.conversation.update({ where: { id }, data: { name } })
      for (const member of conv.members) {
        emitToRoom(userRoom(member.userId), 'conv:update', { conversationId: id })
      }
      return ok({ success: true, name })
    }

    // ---- toggle E2EE (beta, 1:1 only, both sides must have published keys) ----
    if (body.e2eeEnabled !== undefined) {
      if (conv.isGroup) return fail(400, 'GROUPS_UNSUPPORTED', 'E2EE beta is available in 1:1 chats only.')
      const enabled = !!body.e2eeEnabled
      if (enabled) {
        const users = await db.user.findMany({
          where: { id: { in: conv.members.map((m) => m.userId) } },
          select: { id: true, publicKey: true },
        })
        if (users.some((u) => !u.publicKey)) {
          return fail(409, 'KEYS_MISSING', 'Both people must have opened the app once to publish their encryption keys.')
        }
      }
      await db.conversation.update({ where: { id }, data: { e2eeEnabled: enabled } })
      if (enabled) {
        // system note so both sides see the moment encryption was switched on
        const note = await db.message.create({
          data: {
            conversationId: id,
            senderId: me.id,
            kind: 'system',
            text: 'ENCRYPTION_ON',
            receipts: {
              create: conv.members.filter((m) => m.userId !== me.id).map((m) => ({ userId: m.userId })),
            },
          },
          include: messageInclude,
        })
        const dto = messageToDTO(note, me.id)
        for (const member of conv.members) {
          emitToRoom(userRoom(member.userId), 'message:new', { conversationId: id, message: dto })
        }
      }
      for (const member of conv.members) {
        emitToRoom(userRoom(member.userId), 'conv:update', { conversationId: id })
      }
      return ok({ success: true, e2eeEnabled: enabled })
    }

    return fail(400, 'NOTHING_TO_UPDATE')
  } catch {
    return fail(500, 'SERVER_ERROR')
  }
}

/** DELETE /api/conversations/[id] — remove from my list; in groups this is "leave" */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const { id } = await ctx.params
  const membership = await getMembership(id, me.id)
  if (!membership) return fail(404, 'NOT_FOUND')

  const conv = await db.conversation.findUnique({ where: { id }, include: { members: true } })
  if (!conv) return fail(404, 'NOT_FOUND')

  await db.conversationMember.delete({ where: { id: membership.id } })

  // group niceties: system note for the others, owner handover when needed
  if (conv.isGroup) {
    await db.message.create({
      data: {
        conversationId: id,
        senderId: me.id,
        kind: 'system',
        text: `MEMBER_LEFT:${me.displayName}`,
        receipts: { create: conv.members.filter((m) => m.userId !== me.id).map((m) => ({ userId: m.userId })) },
      },
    })
    const remaining = await db.conversationMember.findMany({ where: { conversationId: id } })
    if (remaining.length > 0 && membership.role === 'owner') {
      await db.conversationMember.update({
        where: { id: remaining[0].id },
        data: { role: 'owner' },
      })
    }
    for (const member of conv.members) {
      if (member.userId === me.id) continue
      emitToRoom(userRoom(member.userId), 'conv:update', { conversationId: id })
    }
  }

  // clean up conversations that no longer have any members
  const remainingCount = await db.conversationMember.count({ where: { conversationId: id } })
  if (remainingCount === 0) {
    await db.conversation.delete({ where: { id } }).catch(() => undefined)
  }
  return ok({ success: true })
}

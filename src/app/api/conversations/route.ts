import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { emitToRoom, fail, isResponse, ok, requireUser, userRoom } from '@/lib/api-helpers'

const userSelect = { id: true, displayName: true, avatarColor: true } as const

/** GET /api/conversations — list with peer/group info, last message, unread count, block state */
export async function GET() {
  const me = await requireUser()
  if (isResponse(me)) return me

  const memberships = await db.conversationMember.findMany({
    where: { userId: me.id },
    include: {
      conversation: { include: { members: { include: { user: { select: userSelect } } } } },
    },
    orderBy: { conversation: { updatedAt: 'desc' } },
  })

  const convIds = memberships.map((m) => m.conversationId)
  const blocks = await db.block.findMany({
    where: { OR: [{ blockerId: me.id }, { blockedId: me.id }] },
  })
  const hidden = await db.messageReceipt.findMany({
    where: { userId: me.id, hidden: true, message: { conversationId: { in: convIds } } },
    select: { messageId: true },
  })
  const hiddenIds = hidden.map((h) => h.messageId)

  const result: Array<{
    id: string
    peer: { id: string; displayName: string; avatarColor: string } | null
    isGroup: boolean
    name: string | null
    members: { id: string; displayName: string; avatarColor: string }[]
    myRole: string
    e2eeEnabled: boolean
    createdAt: string
    updatedAt: string
    lastMessage: { id: string; kind: string; text: string; morse: string | null; encrypted: boolean; senderId: string; createdAt: string } | null
    unreadCount: number
    blockedByMe: boolean
    blockedMe: boolean
    pinned: boolean
    muted: boolean
    myDisplayMode: string
  }> = []
  for (const m of memberships) {
    const conv = m.conversation
    const others = conv.members.filter((x) => x.userId !== me.id)
    if (others.length === 0) continue

    // 1:1 peer + block state (groups are not subject to 1:1 blocks)
    let peer: { id: string; displayName: string; avatarColor: string } | null = null
    let blockedByMe = false
    let blockedMe = false
    if (!conv.isGroup && others[0]) {
      peer = others[0].user
      blockedByMe = blocks.some((b) => b.blockerId === me.id && b.blockedId === peer!.id)
      blockedMe = blocks.some((b) => b.blockerId === peer!.id && b.blockedId === me.id)
    }

    const lastMessage = await db.message.findFirst({
      where: { conversationId: conv.id, id: { notIn: hiddenIds } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, kind: true, text: true, morse: true, encrypted: true, senderId: true, createdAt: true },
    })
    const unreadCount = await db.message.count({
      where: {
        conversationId: conv.id,
        senderId: { not: me.id },
        kind: { not: 'system' },
        id: { notIn: hiddenIds },
        ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
      },
    })

    result.push({
      id: conv.id,
      peer,
      isGroup: conv.isGroup,
      name: conv.name,
      members: conv.members.map((x) => x.user),
      myRole: m.role === 'owner' ? 'owner' : 'member',
      e2eeEnabled: conv.e2eeEnabled,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: (lastMessage?.createdAt ?? conv.updatedAt).toISOString(),
      lastMessage: lastMessage
        ? { ...lastMessage, createdAt: lastMessage.createdAt.toISOString() }
        : null,
      unreadCount,
      blockedByMe,
      blockedMe,
      pinned: m.pinned,
      muted: m.muted,
      myDisplayMode: 'text',
    })
  }
  result.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return a.updatedAt < b.updatedAt ? 1 : -1
  })
  return ok({ conversations: result })
}

/** POST /api/conversations — start a 1:1 chat ({userId}) or create a group ({memberIds, name}) */
export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (isResponse(me)) return me
  try {
    const body = await req.json().catch(() => ({}))

    // ---- group creation ----
    if (Array.isArray(body.memberIds)) {
      const name = String(body.name ?? '').trim()
      if (!name || name.length > 60) return fail(400, 'BAD_GROUP_NAME', 'Group name must be 1-60 characters.')
      const rawIds: string[] = (Array.isArray(body.memberIds) ? body.memberIds : []).map((x: unknown) => String(x))
      const ids = Array.from(new Set(rawIds)).filter((x: string) => x && x !== me.id)
      if (ids.length === 0) return fail(400, 'NO_MEMBERS', 'Pick at least one member.')
      if (ids.length > 49) return fail(400, 'TOO_MANY_MEMBERS', 'Groups are limited to 50 members.')

      const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true } })
      if (users.length !== ids.length) return fail(404, 'USER_NOT_FOUND')

      const conv = await db.conversation.create({
        data: {
          isGroup: true,
          name,
          createdBy: me.id,
          members: {
            create: [
              { userId: me.id, role: 'owner' },
              ...ids.map((uid: string) => ({ userId: uid, role: 'member' })),
            ],
          },
        },
      })
      // let every member (and my other devices) refresh the list
      for (const uid of [me.id, ...ids]) emitToRoom(userRoom(uid), 'conv:new', { conversationId: conv.id })
      return ok({ conversationId: conv.id, reused: false })
    }

    // ---- 1:1 conversation ----
    const userId = String(body.userId ?? '')
    if (!userId || userId === me.id) return fail(400, 'BAD_TARGET')

    const target = await db.user.findUnique({ where: { id: userId } })
    if (!target) return fail(404, 'USER_NOT_FOUND')

    const block = await db.block.findFirst({
      where: {
        OR: [
          { blockerId: me.id, blockedId: userId },
          { blockerId: userId, blockedId: me.id },
        ],
      },
    })
    if (block) return fail(403, 'BLOCKED', 'Blocked users cannot start new conversations.')

    // reuse an existing 1:1 conversation if present (groups never count)
    const mine = await db.conversationMember.findMany({
      where: { userId: me.id },
      include: { conversation: { include: { members: true } } },
    })
    const theirs = await db.conversationMember.findMany({
      where: { userId },
      include: { conversation: { include: { members: true } } },
    })
    const shared = mine.find(
      (m) =>
        !m.conversation.isGroup &&
        m.conversation.members.length === 2 &&
        theirs.some((t) => t.conversationId === m.conversationId && !t.conversation.isGroup && t.conversation.members.length === 2)
    )
    if (shared) return ok({ conversationId: shared.conversationId, reused: true })

    const conv = await db.conversation.create({
      data: {
        members: { create: [{ userId: me.id }, { userId }] },
      },
    })
    emitToRoom(userRoom(userId), 'conv:new', { conversationId: conv.id })
    return ok({ conversationId: conv.id, reused: false })
  } catch {
    return fail(500, 'SERVER_ERROR')
  }
}

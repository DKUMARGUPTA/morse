import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { emitToRoom, fail, isResponse, ok, requireUser, userRoom } from '@/lib/api-helpers'

/** POST /api/conversations/[id]/members — add members to a group (owner only) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const { id } = await ctx.params

  const membership = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: me.id } },
  })
  if (!membership) return fail(404, 'NOT_FOUND')
  if (membership.role !== 'owner') return fail(403, 'OWNER_ONLY', 'Only the group owner can add members.')

  const conv = await db.conversation.findUnique({ where: { id }, include: { members: true } })
  if (!conv || !conv.isGroup) return fail(404, 'NOT_FOUND')

  try {
    const body = await req.json()
    const ids = Array.from(new Set((Array.isArray(body.userIds) ? body.userIds : []).map((x: unknown) => String(x)))).filter(
      (x: string) => x && !conv.members.some((m) => m.userId === x)
    )
    if (ids.length === 0) return fail(400, 'NO_NEW_MEMBERS')
    if (conv.members.length + ids.length > 50) return fail(400, 'TOO_MANY_MEMBERS', 'Groups are limited to 50 members.')

    const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })
    if (users.length !== ids.length) return fail(404, 'USER_NOT_FOUND')

    await db.conversationMember.createMany({
      data: ids.map((uid: string) => ({ conversationId: id, userId: uid, role: 'member' })),
    })
    await db.message.create({
      data: {
        conversationId: id,
        senderId: me.id,
        kind: 'system',
        text: `MEMBER_ADDED:${users.map((u) => u.displayName).join(', ')}`,
        receipts: { create: conv.members.filter((m) => m.userId !== me.id).map((m) => ({ userId: m.userId })) },
      },
    })
    await db.conversation.update({ where: { id }, data: { updatedAt: new Date() } })

    for (const uid of [...ids, ...conv.members.map((m) => m.userId)]) {
      emitToRoom(userRoom(uid), 'conv:update', { conversationId: id })
    }
    return ok({ success: true, added: ids.length })
  } catch {
    return fail(500, 'SERVER_ERROR')
  }
}

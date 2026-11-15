import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { emitToRoom, isResponse, ok, requireUser, userRoom } from '@/lib/api-helpers'

/** POST /api/conversations/[id]/read — mark the conversation as read */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const { id } = await ctx.params

  const membership = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: me.id } },
  })
  if (!membership) return ok({ success: true })

  await db.conversationMember.update({
    where: { id: membership.id },
    data: { lastReadAt: new Date() },
  })

  const settings = await db.userSettings.findUnique({ where: { userId: me.id } })
  const allowReadReceipts = settings?.readReceipts ?? true

  if (allowReadReceipts) {
    const unread = await db.message.findMany({
      where: { conversationId: id, senderId: { not: me.id } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, senderId: true },
    })
    const now = new Date()
    for (const msg of unread) {
      await db.messageReceipt.updateMany({
        where: { messageId: msg.id, userId: me.id, readAt: null },
        data: { readAt: now, deliveredAt: now },
      })
      emitToRoom(userRoom(msg.senderId), 'receipt:update', {
        conversationId: id,
        messageId: msg.id,
        delivered: true,
        read: true,
      })
    }
  }
  return ok({ success: true })
}

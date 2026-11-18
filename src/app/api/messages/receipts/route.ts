import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { emitToRoom, isResponse, ok, requireUser, userRoom } from '@/lib/api-helpers'

/** POST /api/messages/receipts — mark messages as delivered for the current user */
export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (isResponse(me)) return me
  try {
    const body = await req.json()
    const messageIds: string[] = Array.isArray(body.messageIds) ? body.messageIds.slice(0, 100) : []
    if (messageIds.length === 0) return ok({ success: true })

    const now = new Date()
    // membership guard: receipt ids may only reference messages in
    // conversations the caller is actually a member of
    const msgs = await db.message.findMany({
      where: {
        id: { in: messageIds },
        senderId: { not: me.id },
        conversation: { members: { some: { userId: me.id } } },
      },
      select: { id: true, senderId: true, conversationId: true },
    })
    for (const msg of msgs) {
      await db.messageReceipt.updateMany({
        where: { messageId: msg.id, userId: me.id, deliveredAt: null },
        data: { deliveredAt: now },
      })
      emitToRoom(userRoom(msg.senderId), 'receipt:update', {
        conversationId: msg.conversationId,
        messageId: msg.id,
        delivered: true,
        read: false,
      })
    }
    return ok({ success: true })
  } catch {
    return ok({ success: false })
  }
}

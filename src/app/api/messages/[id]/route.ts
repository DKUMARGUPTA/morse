import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { emitToRoom, fail, isResponse, messageInclude, messageToDTO, ok, requireUser, userRoom } from '@/lib/api-helpers'
import { textToMorse } from '@/lib/morse'

const EDIT_WINDOW_MS = 15 * 60 * 1000

/** PATCH /api/messages/[id] — edit own message within the time window */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const { id } = await ctx.params
  try {
    const body = await req.json()
    const text = String(body.text ?? '').trim()
    if (!text) return fail(400, 'EMPTY_MESSAGE')
    if (text.length > 2000) return fail(400, 'MESSAGE_TOO_LONG')

    const msg = await db.message.findUnique({ where: { id }, include: { conversation: { include: { members: true } } } })
    if (!msg) return fail(404, 'NOT_FOUND')
    if (msg.senderId !== me.id) return fail(403, 'FORBIDDEN')
    if (Date.now() - msg.createdAt.getTime() > EDIT_WINDOW_MS) {
      return fail(410, 'EDIT_WINDOW_OVER', 'The edit window has passed.')
    }

    const { morse } = msg.encrypted ? { morse: null } : textToMorse(text)
    const updated = await db.message.update({
      where: { id },
      data: { text, morse: morse || null, editedAt: new Date() },
      include: messageInclude,
    })

    const dto = messageToDTO(updated, me.id)
    for (const member of msg.conversation.members) {
      emitToRoom(userRoom(member.userId), 'message:update', {
        conversationId: msg.conversationId,
        message: dto,
      })
    }
    return ok({ message: dto })
  } catch {
    return fail(500, 'SERVER_ERROR')
  }
}

/** DELETE /api/messages/[id] — delete the message for myself only */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const { id } = await ctx.params
  const msg = await db.message.findUnique({ where: { id } })
  if (!msg) return fail(404, 'NOT_FOUND')

  await db.messageReceipt.upsert({
    where: { messageId_userId: { messageId: id, userId: me.id } },
    update: { hidden: true },
    create: { messageId: id, userId: me.id, hidden: true },
  })
  emitToRoom(userRoom(me.id), 'message:hidden', {
    conversationId: msg.conversationId,
    messageId: id,
  })
  return ok({ success: true })
}

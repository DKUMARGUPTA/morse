import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { emitToRoom, fail, isResponse, messageInclude, messageToDTO, ok, requireUser, userRoom } from '@/lib/api-helpers'
import { notifyPushRecipients } from '@/lib/push-server'
import { textToMorse } from '@/lib/morse'

/** POST /api/conversations/[id]/messages — send a text/morse message */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const { id } = await ctx.params
  try {
    const body = await req.json()
    const text = String(body.text ?? '').trim()
    const sendMode = ['text', 'morse', 'dual'].includes(body.sendMode) ? body.sendMode : 'text'
    const playMode = ['sound', 'light', 'vibration'].includes(body.playMode) ? body.playMode : null
    const replyToId = body.replyToId ? String(body.replyToId) : null

    if (!text) return fail(400, 'EMPTY_MESSAGE')
    if (text.length > 2000) return fail(400, 'MESSAGE_TOO_LONG')

    const membership = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: me.id } },
    })
    if (!membership) return fail(404, 'NOT_FOUND')

    const conv = await db.conversation.findUnique({ where: { id }, include: { members: true } })
    if (!conv) return fail(404, 'NOT_FOUND')

    // E2EE (beta): text is ciphertext, server stores it opaquely
    const encrypted = conv.e2eeEnabled

    // delivery targets: everyone else; 1:1 blocks are enforced, group blocks just skip delivery
    const others = conv.members.filter((m) => m.userId !== me.id)
    if (others.length === 0) return fail(404, 'NOT_FOUND')
    const blocks = await db.block.findMany({
      where: { OR: [{ blockerId: me.id }, { blockedId: me.id }] },
    })
    const recipients = others.filter((m) => {
      const pair = blocks.some(
        (b) => (b.blockerId === me.id && b.blockedId === m.userId) || (b.blockerId === m.userId && b.blockedId === me.id)
      )
      return !pair
    })
    if (!conv.isGroup && recipients.length === 0) {
      return fail(403, 'BLOCKED', 'You cannot send messages in this conversation.')
    }

    const { morse } = encrypted ? { morse: null } : textToMorse(text)
    const kind = sendMode === 'text' ? 'text' : 'morse'

    let replyValid: string | null = null
    if (replyToId) {
      const target = await db.message.findFirst({ where: { id: replyToId, conversationId: id } })
      replyValid = target ? target.id : null
    }

    const message = await db.message.create({
      data: {
        conversationId: id,
        senderId: me.id,
        kind,
        text,
        morse: morse || null,
        encrypted,
        sendMode,
        playMode,
        replyToId: replyValid,
        receipts: { create: recipients.map((m) => ({ userId: m.userId })) },
      },
      include: messageInclude,
    })
    await db.conversation.update({ where: { id }, data: { updatedAt: new Date() } })

    const dto = messageToDTO(message, me.id)
    const payload = { conversationId: id, message: dto }
    for (const recipient of recipients) {
      emitToRoom(userRoom(recipient.userId), 'message:new', payload)
    }
    emitToRoom(userRoom(me.id), 'message:new', payload) // other devices of sender

    // Web Push (ROADMAP P0): metadata-only payload — no message text, so E2EE
    // chats leak nothing. Muted conversations are skipped.
    notifyPushRecipients(
      recipients.filter((m) => !m.muted).map((m) => m.userId),
      { s: me.displayName, c: id },
    )

    return ok({ message: dto })
  } catch {
    return fail(500, 'SERVER_ERROR')
  }
}

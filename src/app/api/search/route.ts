import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isResponse, ok, requireUser } from '@/lib/api-helpers'

/** GET /api/search?q= — full-text-ish message search across my conversations.
 *  E2EE (beta) conversations are skipped server-side (server never sees plaintext);
 *  the client additionally searches decrypted history locally.
 *  Messages deleted for me (hidden receipt) are excluded, and the whole query
 *  is one SQL statement — no per-conversation loop. */
export async function GET(req: NextRequest) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return ok({ results: [] })

  const memberships = await db.conversationMember.findMany({
    where: { userId: me.id },
    select: { conversationId: true, conversation: { select: { e2eeEnabled: true } } },
  })
  const convIds = memberships.filter((m) => !m.conversation.e2eeEnabled).map((m) => m.conversationId)
  if (convIds.length === 0) return ok({ results: [] })

  const messages = await db.message.findMany({
    where: {
      conversationId: { in: convIds },
      encrypted: false,
      kind: { not: 'system' },
      text: { contains: q, mode: 'insensitive' as const },
      // never resurface messages the searcher deleted for themselves
      receipts: { none: { userId: me.id, hidden: true } },
    },
    include: {
      sender: { select: { displayName: true } },
      conversation: {
        select: {
          isGroup: true,
          name: true,
          members: {
            where: { userId: { not: me.id } },
            select: { user: { select: { displayName: true } } },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  const hits = messages.map((msg) => {
    const other = msg.conversation.members[0]?.user.displayName
    return {
      conversationId: msg.conversationId,
      messageId: msg.id,
      text: msg.text,
      senderId: msg.senderId,
      senderName: msg.sender.displayName,
      createdAt: msg.createdAt.toISOString(),
      convTitle: msg.conversation.isGroup ? (msg.conversation.name ?? 'Group') : (other ?? 'Chat'),
    }
  })
  return ok({ results: hits })
}

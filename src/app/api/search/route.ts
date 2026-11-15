import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isResponse, ok, requireUser } from '@/lib/api-helpers'

/** GET /api/search?q= — full-text-ish message search across my conversations.
 *  E2EE (beta) conversations are skipped server-side (server never sees plaintext);
 *  the client additionally searches decrypted history locally. */
export async function GET(req: NextRequest) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return ok({ results: [] })

  const memberships = await db.conversationMember.findMany({
    where: { userId: me.id },
    include: { conversation: { include: { members: { include: { user: { select: { displayName: true } } } } } } },
  })

  const hits = []
  for (const m of memberships) {
    if (m.conversation.e2eeEnabled) continue
    const convTitle = m.conversation.isGroup
      ? (m.conversation.name ?? 'Group')
      : (m.conversation.members.find((x) => x.userId !== me.id)?.user.displayName ?? 'Chat')
    const messages = await db.message.findMany({
      where: {
        conversationId: m.conversationId,
        encrypted: false,
        kind: { not: 'system' },
        text: { contains: q },
      },
      include: { sender: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    for (const msg of messages) {
      hits.push({
        conversationId: m.conversationId,
        messageId: msg.id,
        text: msg.text,
        senderId: msg.senderId,
        senderName: msg.sender.displayName,
        createdAt: msg.createdAt.toISOString(),
        convTitle,
      })
    }
  }
  hits.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return ok({ results: hits.slice(0, 30) })
}

// Morse Messenger — internal membership check for the realtime worker.
// GET /api/internal/conv-members?conversationId=..&userId=..
// Guarded by the shared internal secret; used by the Cloudflare Durable Object
// to enforce that only conversation members join a room (production mode).

import { timingSafeEqual } from 'crypto'
import { fail, ok } from '@/lib/api-helpers'
import { db } from '@/lib/db'

function secretMatches(provided: string, expected: string): boolean {
  if (!expected) return false // no secret configured -> refuse
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: Request) {
  const provided = req.headers.get('x-internal-secret') ?? ''
  if (!secretMatches(provided, process.env.SOCKET_INTERNAL_SECRET ?? '')) {
    return fail(403, 'FORBIDDEN')
  }

  const url = new URL(req.url)
  const conversationId = url.searchParams.get('conversationId') ?? ''
  const userId = url.searchParams.get('userId') ?? ''
  if (!conversationId || !userId) return fail(400, 'BAD_REQUEST')

  try {
    const member = await db.conversationMember.findFirst({
      where: { conversationId, userId },
      select: { userId: true },
    })
    return ok({ member: !!member })
  } catch {
    return fail(500, 'SERVER_ERROR')
  }
}

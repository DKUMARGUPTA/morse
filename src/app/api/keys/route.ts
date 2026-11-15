import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireUser } from '@/lib/api-helpers'

/** GET /api/keys — my E2EE public key + public keys of users I share conversations with */
export async function GET() {
  const me = await requireUser()
  if (isResponse(me)) return me

  const memberships = await db.conversationMember.findMany({
    where: { userId: me.id },
    select: { conversationId: true },
  })
  const convIds = memberships.map((m) => m.conversationId)
  const peers = await db.conversationMember.findMany({
    where: { conversationId: { in: convIds }, userId: { not: me.id } },
    select: { user: { select: { id: true, publicKey: true } } },
    distinct: ['userId'],
  })

  return ok({
    publicKey: me.publicKey ?? null,
    peerKeys: peers.map((p) => ({ userId: p.user.id, publicKey: p.user.publicKey ?? null })),
  })
}

/** POST /api/keys — publish my E2EE public key (JWK JSON string) */
export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (isResponse(me)) return me
  try {
    const body = await req.json()
    const publicKey = String(body.publicKey ?? '')
    if (!publicKey || publicKey.length > 2000) return fail(400, 'BAD_KEY')
    try {
      const jwk = JSON.parse(publicKey)
      if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') return fail(400, 'BAD_KEY')
    } catch {
      return fail(400, 'BAD_KEY')
    }
    await db.user.update({ where: { id: me.id }, data: { publicKey } })
    return ok({ success: true })
  } catch {
    return fail(500, 'SERVER_ERROR')
  }
}

import { randomBytes } from 'crypto'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireUser } from '@/lib/api-helpers'

/** GET /api/invitations — my recent invitations */
export async function GET() {
  const me = await requireUser()
  if (isResponse(me)) return me
  const invitations = await db.invitation.findMany({
    where: { createdById: me.id, status: 'pending', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  return ok({ invitations })
}

/** POST /api/invitations — create a fresh invite link (48h expiry, revocable) */
export async function POST(_req: NextRequest) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const activeCount = await db.invitation.count({
    where: { createdById: me.id, status: 'pending', expiresAt: { gt: new Date() } },
  })
  if (activeCount >= 5) {
    return fail(429, 'TOO_MANY_INVITES', 'You already have 5 active invitations. Revoke one first.')
  }
  const code = randomBytes(6).toString('base64url').replace(/[-_]/g, 'A').slice(0, 8).toUpperCase()
  const invitation = await db.invitation.create({
    data: {
      code,
      createdById: me.id,
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
    },
  })
  return ok({ invitation })
}

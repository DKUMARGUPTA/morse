import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireUser } from '@/lib/api-helpers'

/** GET /api/block — list of users I blocked */
export async function GET() {
  const me = await requireUser()
  if (isResponse(me)) return me
  const blocks = await db.block.findMany({
    where: { blockerId: me.id },
    include: { blocked: { select: { id: true, displayName: true, avatarColor: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return ok({ blocked: blocks.map((b) => b.blocked) })
}

/** POST /api/block — block a user */
export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail(400, 'BAD_JSON')
  const userId = String((body as Record<string, unknown>).userId ?? '')
  if (!userId) return fail(400, 'MISSING_USER')
  if (userId === me.id) return ok({ success: true })
  // a bogus id used to surface as a raw FK-error 500 — validate the target first
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!target) return fail(404, 'USER_NOT_FOUND')
  await db.block.upsert({
    where: { blockerId_blockedId: { blockerId: me.id, blockedId: userId } },
    update: {},
    create: { blockerId: me.id, blockedId: userId },
  })
  return ok({ success: true })
}

/** DELETE /api/block — unblock a user */
export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail(400, 'BAD_JSON')
  const userId = String((body as Record<string, unknown>).userId ?? '')
  if (!userId) return fail(400, 'MISSING_USER')
  await db.block.deleteMany({ where: { blockerId: me.id, blockedId: userId } })
  return ok({ success: true })
}

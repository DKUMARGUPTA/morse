import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isResponse, ok, requireUser } from '@/lib/api-helpers'

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
  const body = await req.json()
  const userId = String(body.userId ?? '')
  if (!userId || userId === me.id) return ok({ success: true })
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
  const body = await req.json()
  const userId = String(body.userId ?? '')
  await db.block.deleteMany({ where: { blockerId: me.id, blockedId: userId } })
  return ok({ success: true })
}

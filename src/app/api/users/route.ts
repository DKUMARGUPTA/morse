import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isResponse, ok, requireUser } from '@/lib/api-helpers'

/** User directory for the "pick a person" flow. Minimal fields only —
 *  email and other private data are never exposed (PRD 5.2). */
export async function GET(req: NextRequest) {
  const user = await requireUser()
  if (isResponse(user)) return user
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase()

  const blocks = await db.block.findMany({
    where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
  })
  const hiddenIds = new Set<string>([user.id])
  for (const b of blocks) {
    hiddenIds.add(b.blockerId)
    hiddenIds.add(b.blockedId)
  }

  const users = await db.user.findMany({
    where: {
      id: { notIn: Array.from(hiddenIds) },
      ...(q ? { displayName: { contains: q } } : {}),
    },
    select: { id: true, displayName: true, avatarColor: true },
    orderBy: { displayName: 'asc' },
    take: 50,
  })
  return ok({ users })
}

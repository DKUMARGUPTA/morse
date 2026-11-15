import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireUser } from '@/lib/api-helpers'

export async function PATCH(req: NextRequest) {
  const user = await requireUser()
  if (isResponse(user)) return user
  try {
    const body = await req.json()
    const displayName = String(body.displayName ?? '').trim()
    if (!displayName) return fail(400, 'MISSING_NAME', 'Display name is required.')
    if (displayName.length > 40) return fail(400, 'NAME_TOO_LONG', 'Display name is too long.')
    const updated = await db.user.update({
      where: { id: user.id },
      data: { displayName },
    })
    return ok({ id: updated.id, displayName: updated.displayName, avatarColor: updated.avatarColor })
  } catch {
    return fail(500, 'SERVER_ERROR')
  }
}

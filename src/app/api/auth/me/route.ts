import { db } from '@/lib/db'
import { clearSessionCookie, getSessionUser } from '@/lib/auth'
import { ok, requireUser, isResponse } from '@/lib/api-helpers'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return ok({ user: null, settings: null })
  const settings = await db.userSettings.findUnique({ where: { userId: user.id } })
  return ok({ user, settings })
}

/** POST: sign out of all devices by bumping tokenVersion. */
export async function POST() {
  const user = await requireUser()
  if (isResponse(user)) return user
  await db.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } })
  await clearSessionCookie()
  return ok({ success: true })
}

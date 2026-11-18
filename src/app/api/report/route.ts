import { db } from '@/lib/db'
import { fail, isResponse, ok, requireUser } from '@/lib/api-helpers'
import { dbRateLimit } from '@/lib/rate-limit'

/** POST /api/report — abuse & safety report */
export async function POST(req: Request) {
  const me = await requireUser()
  if (isResponse(me)) return me
  // abuse guard: 10 reports per hour per account (serverless-safe, DB-backed)
  if (!(await dbRateLimit(`report:${me.id}`, 10, 60 * 60_000))) {
    return fail(429, 'TOO_MANY_REPORTS', 'Too many reports. Try again later.')
  }
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail(400, 'BAD_JSON')
  const reportedId = String((body as Record<string, unknown>).reportedId ?? '')
  const reason = String((body as Record<string, unknown>).reason ?? '').trim().slice(0, 1000)
  if (!reportedId || !reason) return fail(400, 'MISSING_FIELDS')
  // the target must be a real user — a bogus id used to surface as a raw 500
  const target = await db.user.findUnique({ where: { id: reportedId }, select: { id: true } })
  if (!target) return fail(404, 'USER_NOT_FOUND')
  if (reportedId === me.id) return fail(400, 'SELF_REPORT')
  await db.report.create({
    data: { reporterId: me.id, reportedId, reason },
  })
  return ok({ success: true })
}

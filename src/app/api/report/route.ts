import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isResponse, ok, requireUser } from '@/lib/api-helpers'

/** POST /api/report — abuse & safety report */
export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (isResponse(me)) return me
  const body = await req.json()
  const reportedId = String(body.reportedId ?? '')
  const reason = String(body.reason ?? '').trim().slice(0, 1000)
  if (!reportedId || !reason) return ok({ success: false })
  await db.report.create({
    data: { reporterId: me.id, reportedId, reason },
  })
  return ok({ success: true })
}

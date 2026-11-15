import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireUser } from '@/lib/api-helpers'

type SubscriptionJSON = {
  endpoint?: unknown
  keys?: { p256dh?: unknown; auth?: unknown }
}

/** POST /api/push/subscribe — persist a Web Push subscription for this user. */
export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (isResponse(me)) return me

  let sub: SubscriptionJSON
  try {
    sub = (await req.json()).subscription
  } catch {
    return fail(400, 'BAD_JSON')
  }
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : ''
  const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : ''
  const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth : ''
  if (!endpoint.startsWith('https://') || !p256dh || !auth) {
    return fail(400, 'INVALID_SUBSCRIPTION')
  }

  const userAgent = req.headers.get('user-agent')?.slice(0, 255) ?? null
  await db.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: me.id, p256dh, auth, userAgent },
    create: { userId: me.id, endpoint, p256dh, auth, userAgent },
  })
  return ok({ success: true })
}

/** DELETE /api/push/subscribe — remove a subscription (unsubscribed device). */
export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (isResponse(me)) return me

  let endpoint = ''
  try {
    const body = await req.json()
    endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  } catch {
    return fail(400, 'BAD_JSON')
  }
  if (!endpoint) return fail(400, 'INVALID_ENDPOINT')

  await db.pushSubscription.deleteMany({ where: { endpoint, userId: me.id } })
  return ok({ success: true })
}

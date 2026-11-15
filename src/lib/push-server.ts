// Morse Messenger — Web Push server helper (ROADMAP P0)
// Sends RFC 8291 encrypted push messages via the `web-push` library.
// Payloads are metadata-only (sender name + conversation id) — never message
// text — so E2EE ciphertext stays ciphertext and non-E2EE chats stay private.

import { after } from 'next/server'
import { db } from '@/lib/db'

export type PushPayload = {
  /** sender display name (notification title) */
  s?: string
  /** conversation id — used for click-through navigation + tag dedupe */
  c?: string
  /** generic body override */
  b?: string
}

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

async function getWebPush() {
  const webpush = (await import('web-push')).default
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@morse-ashen.vercel.app',
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  )
  return webpush
}

/** Send a push to every subscription of the given users.
 *  Dead endpoints (404/410) are pruned. Muting is decided by the caller. */
async function deliverPush(userIds: string[], payload: PushPayload) {
  if (!pushConfigured() || userIds.length === 0) return
  const webpush = await getWebPush()
  const subs = await db.pushSubscription.findMany({ where: { userId: { in: userIds } } })
  if (subs.length === 0) return

  const body = JSON.stringify(payload)
  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 3600 },
        )
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // subscription expired / uninstalled — prune it
          await db.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } })
          return
        }
        throw err
      }
    }),
  )
  const failed = results.filter((r) => r.status === 'rejected').length
  if (failed > 0) console.warn(`[push] ${failed}/${subs.length} deliveries failed`)
}

/** Fire-and-forget push from a request scope: runs inside after() so the
 *  serverless invocation stays alive until the deliveries flush. */
export function notifyPushRecipients(userIds: string[], payload: PushPayload) {
  try {
    after(() => deliverPush(userIds, payload).catch(() => undefined))
  } catch {
    // outside a request scope (scripts, cron) — plain best-effort
    void deliverPush(userIds, payload).catch(() => undefined)
  }
}

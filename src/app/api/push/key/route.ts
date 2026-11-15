import { fail, isResponse, ok, requireUser } from '@/lib/api-helpers'
import { pushConfigured } from '@/lib/push-server'

/** GET /api/push/key — VAPID public key for pushManager.subscribe().
 *  Runtime (not build-time) so deployments without push configured stay green. */
export async function GET() {
  const me = await requireUser()
  if (isResponse(me)) return me
  if (!pushConfigured()) return fail(503, 'PUSH_NOT_CONFIGURED')
  return ok({ publicKey: process.env.VAPID_PUBLIC_KEY })
}

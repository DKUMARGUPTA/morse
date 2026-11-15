import { fail, isResponse, ok, requireUser } from '@/lib/api-helpers'
import { signSocketToken } from '@/lib/auth'

/** GET /api/socket/token — short-lived signed token for the realtime service handshake.
 *  The chat-service verifies this token (same HS256 secret) before joining any room. */
export async function GET() {
  const me = await requireUser()
  if (isResponse(me)) return me
  try {
    return ok({ token: signSocketToken(me.id, me.tokenVersion) })
  } catch {
    return fail(500, 'SERVER_ERROR')
  }
}

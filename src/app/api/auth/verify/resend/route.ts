import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireUser } from '@/lib/api-helpers'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { newVerificationToken, verificationExpiry } from '@/lib/verification'
import { emailConfigured, sendVerificationEmail } from '@/lib/email'

/** POST /api/auth/verify/resend — send a fresh verification link to the
 *  session user (rate-limited: 3 per 10 minutes per user). */
export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (isResponse(me)) return me
  if (!rateLimit(`verify-resend:${me.id}:${clientIp(req)}`, 3, 10 * 60_000)) {
    return fail(429, 'TOO_MANY_ATTEMPTS', 'Too many emails requested. Try again in a few minutes.')
  }

  const user = await db.user.findUnique({ where: { id: me.id }, select: { email: true, emailVerifiedAt: true } })
  if (!user) return fail(404, 'NOT_FOUND')
  if (user.emailVerifiedAt) return ok({ alreadyVerified: true })
  if (!emailConfigured()) {
    return fail(503, 'EMAIL_NOT_CONFIGURED', 'No email provider is configured on the server yet.')
  }

  // one live token per user — replace any previous one
  await db.verificationToken.deleteMany({ where: { userId: me.id } })
  const { raw, hash } = newVerificationToken()
  await db.verificationToken.create({
    data: { userId: me.id, tokenHash: hash, expiresAt: verificationExpiry() },
  })

  const link = `${req.nextUrl.origin}/api/auth/verify?token=${raw}`
  const result = await sendVerificationEmail(user.email, link)
  if (result === 'failed') return fail(502, 'EMAIL_SEND_FAILED', 'The email could not be sent. Try again shortly.')
  return ok({ sent: result })
}

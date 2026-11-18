import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { setSessionCookie, verifyPassword } from '@/lib/auth'
import { fail } from '@/lib/api-helpers'
import { clientIp, dbRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    if (!email || !password) return fail(400, 'MISSING_FIELDS', 'Email and password are required.')

    // brute-force guard: 10/min per IP and 5/min per IP+email
    // (DB-backed — the in-memory map resets on every serverless cold start)
    const ip = clientIp(req)
    if (!(await dbRateLimit(`login:${ip}`, 10, 60_000)) || !(await dbRateLimit(`login:${ip}:${email}`, 5, 60_000))) {
      return fail(429, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Try again in a minute.')
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return fail(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.')
    }

    await setSessionCookie(user.id, user.tokenVersion)
    return NextResponse.json({ id: user.id, email: user.email, displayName: user.displayName, avatarColor: user.avatarColor, emailVerified: !!user.emailVerifiedAt })
  } catch {
    return fail(500, 'SERVER_ERROR')
  }
}

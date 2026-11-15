import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { setSessionCookie, verifyPassword } from '@/lib/auth'
import { fail } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    if (!email || !password) return fail(400, 'MISSING_FIELDS', 'Email and password are required.')

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return fail(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.')
    }

    await setSessionCookie(user.id, user.tokenVersion)
    return NextResponse.json({ id: user.id, email: user.email, displayName: user.displayName, avatarColor: user.avatarColor })
  } catch {
    return fail(500, 'SERVER_ERROR')
  }
}

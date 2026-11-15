import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, setSessionCookie } from '@/lib/auth'
import { fail } from '@/lib/api-helpers'

const AVATAR_COLORS = ['#22D3EE', '#F472B6', '#34D399', '#FBBF24', '#A78BFA', '#FB7185', '#4ADE80', '#38BDF8']

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const displayName = String(body.displayName ?? '').trim()

    if (!email || !password) return fail(400, 'MISSING_FIELDS', 'Email and password are required.')
    if (!displayName) return fail(400, 'MISSING_NAME', 'Display name is required.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'BAD_EMAIL', 'Enter a valid email address.')
    if (password.length < 6) return fail(400, 'WEAK_PASSWORD', 'Password must be at least 6 characters.')

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) return fail(409, 'EMAIL_TAKEN', 'An account with this email already exists.')

    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
    const user = await db.user.create({
      data: {
        email,
        passwordHash: hashPassword(password),
        displayName,
        avatarColor: color,
        settings: { create: {} },
      },
    })

    await setSessionCookie(user.id, user.tokenVersion)
    return NextResponse.json({ id: user.id, email: user.email, displayName: user.displayName, avatarColor: user.avatarColor })
  } catch {
    return fail(500, 'SERVER_ERROR')
  }
}

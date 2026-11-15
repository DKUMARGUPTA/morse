// Morse Messenger — authentication helpers
// Email + password (scrypt) with signed JWT session in an httpOnly cookie.
// Deliberately dependency-free (node:crypto) so the sandbox build stays lean.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

const SECRET = process.env.AUTH_SECRET || 'morse-messenger-dev-secret-do-not-use-in-prod'
export const SESSION_COOKIE = 'mm_session'
const SESSION_DAYS = 30

// ---------- password ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

// ---------- minimal JWT (HS256) ----------

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export interface SessionPayload {
  sub: string
  tv: number // tokenVersion — bump to invalidate all sessions
  exp: number
}

export function signSession(userId: string, tokenVersion: number): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({
      sub: userId,
      tv: tokenVersion,
      exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400,
    } satisfies SessionPayload)
  )
  const sig = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

export function verifySession(token: string): SessionPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts
  const expected = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionPayload
    if (!data.sub || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null
    return data
  } catch {
    return null
  }
}

// ---------- session user ----------

export interface SessionUser {
  id: string
  email: string
  displayName: string
  avatarColor: string
  tokenVersion: number
  // E2EE (beta): own public key JWK (null until published)
  publicKey: string | null
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const payload = verifySession(token)
  if (!payload) return null
  const user = await db.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, displayName: true, avatarColor: true, tokenVersion: true, publicKey: true },
  })
  if (!user) return null
  if (user.tokenVersion !== payload.tv) return null // signed out everywhere
  return user
}

export async function setSessionCookie(userId: string, tokenVersion: number) {
  const store = await cookies()
  store.set(SESSION_COOKIE, signSession(userId, tokenVersion), {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // sandbox preview runs behind a proxy without user HTTPS origin
    maxAge: SESSION_DAYS * 86400,
    path: '/',
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.set(SESSION_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' })
}

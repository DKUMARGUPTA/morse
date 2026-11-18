// Morse Messenger — rate limiters.
// 1. In-memory sliding window: per-instance, fine for low-frequency guards.
// 2. dbRateLimit: fixed-window counter in Postgres — survives serverless
//    instance churn, so auth endpoints are actually protected in production
//    (the in-memory map resets on every cold start and every instance has
//    its own, which live testing proved ineffective for register/login).

import { db } from '@/lib/db'

const buckets = new Map<string, number[]>()

/** Returns true when the action is allowed, false when the limit is hit. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    buckets.set(key, recent)
    return false
  }
  recent.push(now)
  buckets.set(key, recent)
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k)
    }
  }
  return true
}

/** Serverless-safe fixed-window limiter backed by the RateLimit table.
 *  Approximate under high concurrency (read-then-increment) — plenty for
 *  auth-abuse guarding. Fails OPEN on DB errors so an outage never locks
 *  users out of their own accounts. */
export async function dbRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const now = new Date()
    const row = await db.rateLimit.findUnique({ where: { key } })
    if (!row || now.getTime() - row.windowStart.getTime() >= windowMs) {
      await db.rateLimit.upsert({
        where: { key },
        update: { count: 1, windowStart: now },
        create: { key, count: 1, windowStart: now },
      })
      // opportunistic cleanup of stale windows (indexed, cheap at this scale)
      await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } } })
      return true
    }
    if (row.count >= limit) return false
    await db.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } })
    return true
  } catch {
    return true
  }
}

/** Best-effort client IP (Vercel and the sandbox gateway both set x-forwarded-for). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

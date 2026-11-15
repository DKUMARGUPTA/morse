// Morse Messenger — minimal in-memory sliding-window rate limiter.
// Per-instance by design (single-region MVP). If this app ever runs
// multi-region or at scale, swap for a shared store (e.g. Upstash Redis).

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

/** Best-effort client IP (Vercel and the sandbox gateway both set x-forwarded-for). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

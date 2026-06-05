// Simple in-memory fixed-window rate limiter.
// Good enough for a single Next.js instance. For multi-instance production
// you'd back this with Redis/Upstash — the API shape stays the same.

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
let lastSweep = 0

function sweep(now: number) {
  // Opportunistically prune expired buckets so the map doesn't grow forever.
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key)
  }
}

export type RateLimitResult = { allowed: boolean; retryAfter: number; remaining: number }

/**
 * @param key    unique caller id (IP, user id, ...)
 * @param max    max requests allowed per window
 * @param windowMs  window length in ms
 */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0, remaining: max - 1 }
  }

  if (bucket.count >= max) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000), remaining: 0 }
  }

  bucket.count++
  return { allowed: true, retryAfter: 0, remaining: max - bucket.count }
}

/** Best-effort caller identity from a request — user IP, falling back to a constant. */
export function callerKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  return req.headers.get("x-real-ip") ?? "local"
}

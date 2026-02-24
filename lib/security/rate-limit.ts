export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; retryAfter: number; resetAt: number }

type Bucket = { remaining: number; resetAt: number }

const globalForRateLimit = globalThis as unknown as {
  rateLimitBuckets?: Map<string, Bucket>
}

const buckets = globalForRateLimit.rateLimitBuckets ?? new Map<string, Bucket>()
if (!globalForRateLimit.rateLimitBuckets) {
  globalForRateLimit.rateLimitBuckets = buckets
}

const MAX_BUCKETS = 10_000

export function getClientIp(req: Request): string | null {
  const cfIp = req.headers.get('cf-connecting-ip')
  if (cfIp) return cfIp.trim()
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || null
  return null
}

export function buildRateLimitKey(req: Request, userId?: string | null): string {
  const ip = getClientIp(req)
  if (userId) return `user:${userId}`
  if (ip) return `ip:${ip}`
  return 'anon'
}

export function rateLimit(opts: {
  key: string
  bucket: string
  limit: number
  windowMs: number
}): RateLimitResult {
  if (process.env.SECURITY_DISABLE_RATE_LIMIT === 'true') {
    return { ok: true, remaining: opts.limit, resetAt: Date.now() + opts.windowMs }
  }

  const now = Date.now()
  const bucketKey = `${opts.bucket}:${opts.key}`
  let bucket = buckets.get(bucketKey)

  if (!bucket || now >= bucket.resetAt) {
    bucket = { remaining: opts.limit, resetAt: now + opts.windowMs }
  }

  if (bucket.remaining <= 0) {
    buckets.set(bucketKey, bucket)
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)), resetAt: bucket.resetAt }
  }

  bucket.remaining -= 1
  buckets.set(bucketKey, bucket)

  if (buckets.size > MAX_BUCKETS) {
    buckets.clear()
  }

  return { ok: true, remaining: bucket.remaining, resetAt: bucket.resetAt }
}

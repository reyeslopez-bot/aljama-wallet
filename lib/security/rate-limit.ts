import { getErrorMessage } from '@/lib/security/errors'
import { logError } from '@/lib/security/logging'

export type RateLimitSuccessResult = { ok: true; remaining: number; resetAt: number }

export type RateLimitFailureKind = 'limit_exceeded' | 'backend_unavailable'

export type RateLimitFailureResult = {
  ok: false
  retryAfter: number
  resetAt: number
  failureKind: RateLimitFailureKind
}

export type RateLimitResult = RateLimitSuccessResult | RateLimitFailureResult

export type RateLimitOptions = {
  key: string
  bucket: string
  limit: number
  windowMs: number
  requireDistributed?: boolean
}

type Bucket = { remaining: number; resetAt: number }

type RedisCommandClient = {
  sendCommand(args: string[]): Promise<unknown>
  connect?: () => Promise<void>
  quit?: () => Promise<void>
  on?: (event: string, listener: (error: unknown) => void) => void
}

export type RateLimitBackendHealth = {
  requestedBackend: 'memory' | 'redis'
  activeBackend: 'memory' | 'redis'
  degraded: boolean
  reason: string | null
  lastFailureAt: number | null
  requireDistributed: boolean
}

const globalForRateLimit = globalThis as unknown as {
  rateLimitBuckets?: Map<string, Bucket>
  rateLimitRedisClientPromise?: Promise<RedisCommandClient | null>
  rateLimitRedisClientOverride?: RedisCommandClient | null
  rateLimitHealth?: RateLimitBackendHealth
}

const buckets = globalForRateLimit.rateLimitBuckets ?? new Map<string, Bucket>()
if (!globalForRateLimit.rateLimitBuckets) {
  globalForRateLimit.rateLimitBuckets = buckets
}

function defaultRateLimitHealth(): RateLimitBackendHealth {
  return {
    requestedBackend: 'memory',
    activeBackend: 'memory',
    degraded: false,
    reason: null,
    lastFailureAt: null,
    requireDistributed: false,
  }
}

const rateLimitHealth = globalForRateLimit.rateLimitHealth ?? defaultRateLimitHealth()
if (!globalForRateLimit.rateLimitHealth) {
  globalForRateLimit.rateLimitHealth = rateLimitHealth
}

const MAX_BUCKETS = 10_000

function envBool(name: string, fallback = false): boolean {
  const raw = process.env[name]
  if (!raw) return fallback
  const normalized = raw.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return fallback
}

function configuredBackend(): 'memory' | 'redis' {
  const raw = (process.env.SECURITY_RATE_LIMIT_BACKEND ?? 'memory').trim().toLowerCase()
  if (raw === 'redis') return 'redis'
  return 'memory'
}

function requireDistributedBackend(): boolean {
  return envBool('SECURITY_RATE_LIMIT_REQUIRE_DISTRIBUTED', false)
}

function redisUrl(): string {
  return process.env.SECURITY_RATE_LIMIT_REDIS_URL?.trim() ?? process.env.REDIS_URL?.trim() ?? ''
}

function redisPrefix(): string {
  return process.env.SECURITY_RATE_LIMIT_PREFIX?.trim() || 'security:rate-limit'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

async function loadRedisModule(): Promise<{ createClient: (options: { url: string }) => RedisCommandClient }> {
  const importedModule = await import('redis')
  const record = asRecord(importedModule)
  const createClient = record?.createClient
  if (typeof createClient !== 'function') {
    throw new Error('redis module missing createClient export')
  }
  return { createClient: createClient as (options: { url: string }) => RedisCommandClient }
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'bigint') {
    const cast = Number(value)
    return Number.isFinite(cast) ? cast : null
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeWindowMs(value: number): number {
  if (!Number.isFinite(value)) return 1_000
  return Math.max(1, Math.floor(value))
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

function setRateLimitHealth(input: RateLimitBackendHealth) {
  rateLimitHealth.requestedBackend = input.requestedBackend
  rateLimitHealth.activeBackend = input.activeBackend
  rateLimitHealth.degraded = input.degraded
  rateLimitHealth.reason = input.reason
  rateLimitHealth.lastFailureAt = input.lastFailureAt
  rateLimitHealth.requireDistributed = input.requireDistributed
}

function limitExceededResult(retryAfter: number, resetAt: number): RateLimitFailureResult {
  return {
    ok: false,
    retryAfter,
    resetAt,
    failureKind: 'limit_exceeded',
  }
}

function defaultBlockedResult(windowMs: number): RateLimitFailureResult {
  const now = Date.now()
  return {
    ok: false,
    retryAfter: Math.max(1, Math.ceil(windowMs / 1_000)),
    resetAt: now + windowMs,
    failureKind: 'backend_unavailable',
  }
}

export function getRateLimitBackendHealth(): RateLimitBackendHealth {
  return { ...rateLimitHealth }
}

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

async function resolveRedisClient(): Promise<RedisCommandClient | null> {
  if (globalForRateLimit.rateLimitRedisClientOverride !== undefined) {
    return globalForRateLimit.rateLimitRedisClientOverride
  }

  const url = redisUrl()
  if (!url) return null

  if (!globalForRateLimit.rateLimitRedisClientPromise) {
    globalForRateLimit.rateLimitRedisClientPromise = (async () => {
      const redisModule = await loadRedisModule()
      const client = redisModule.createClient({ url })
      client.on?.('error', (error) => {
        logError('security:rate-limit:redis', error)
      })
      if (client.connect) {
        await client.connect()
      }
      return client
    })().catch((error) => {
      logError('security:rate-limit:redis', error)
      return null
    })
  }

  return globalForRateLimit.rateLimitRedisClientPromise
}

async function redisRateLimit(
  client: RedisCommandClient,
  opts: { key: string; bucket: string; limit: number; windowMs: number },
): Promise<RateLimitResult> {
  const now = Date.now()
  const redisKey = `${redisPrefix()}:${opts.bucket}:${opts.key}`

  const countRaw = await client.sendCommand(['INCR', redisKey])
  const count = parseNumber(countRaw)
  if (count === null) {
    throw new Error('redis_incr_invalid_response')
  }

  if (count <= 1) {
    await client.sendCommand(['PEXPIRE', redisKey, String(opts.windowMs)])
  }

  let ttl = parseNumber(await client.sendCommand(['PTTL', redisKey]))
  if (ttl === null || ttl < 0) {
    ttl = opts.windowMs
    await client.sendCommand(['PEXPIRE', redisKey, String(opts.windowMs)])
  }

  const resetAt = now + ttl
  if (count > opts.limit) {
    return limitExceededResult(Math.max(1, Math.ceil(ttl / 1_000)), resetAt)
  }

  return {
    ok: true,
    remaining: Math.max(0, opts.limit - count),
    resetAt,
  }
}

function memoryRateLimit(opts: { key: string; bucket: string; limit: number; windowMs: number }): RateLimitResult {
  const now = Date.now()
  const bucketKey = `${opts.bucket}:${opts.key}`
  let bucket = buckets.get(bucketKey)

  if (!bucket || now >= bucket.resetAt) {
    bucket = { remaining: opts.limit, resetAt: now + opts.windowMs }
  }

  if (bucket.remaining <= 0) {
    buckets.set(bucketKey, bucket)
    return limitExceededResult(Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)), bucket.resetAt)
  }

  bucket.remaining -= 1
  buckets.set(bucketKey, bucket)

  if (buckets.size > MAX_BUCKETS) {
    buckets.clear()
  }

  return { ok: true, remaining: bucket.remaining, resetAt: bucket.resetAt }
}

export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const windowMs = normalizeWindowMs(opts.windowMs)
  const limit = normalizeLimit(opts.limit)

  if (process.env.SECURITY_DISABLE_RATE_LIMIT === 'true') {
    return { ok: true, remaining: limit, resetAt: Date.now() + windowMs }
  }

  if (limit <= 0) {
    return defaultBlockedResult(windowMs)
  }

  const requested = configuredBackend()
  const requireDistributed = opts.requireDistributed === true || requireDistributedBackend()
  const shouldUseRedis = requested === 'redis' || requireDistributed

  if (!shouldUseRedis) {
    setRateLimitHealth({
      requestedBackend: requested,
      activeBackend: 'memory',
      degraded: false,
      reason: null,
      lastFailureAt: null,
      requireDistributed,
    })
    return memoryRateLimit({ ...opts, windowMs, limit })
  }

  const client = await resolveRedisClient()
  if (!client) {
    const failureAt = Date.now()
    if (requireDistributed) {
      setRateLimitHealth({
        requestedBackend: requested,
        activeBackend: 'redis',
        degraded: true,
        reason: 'redis_unavailable_fail_closed',
        lastFailureAt: failureAt,
        requireDistributed,
      })
      return defaultBlockedResult(windowMs)
    }

    setRateLimitHealth({
      requestedBackend: requested,
      activeBackend: 'memory',
      degraded: true,
      reason: 'redis_unavailable_fallback_memory',
      lastFailureAt: failureAt,
      requireDistributed,
    })
    return memoryRateLimit({ ...opts, windowMs, limit })
  }

  try {
    const result = await redisRateLimit(client, { ...opts, windowMs, limit })
    setRateLimitHealth({
      requestedBackend: requested,
      activeBackend: 'redis',
      degraded: false,
      reason: null,
      lastFailureAt: null,
      requireDistributed,
    })
    return result
  } catch (error) {
    const failureAt = Date.now()
    logError('security:rate-limit:execute', error, {
      bucket: opts.bucket,
      reason: getErrorMessage(error, 'redis_rate_limit_failed'),
    })
    globalForRateLimit.rateLimitRedisClientPromise = undefined

    if (requireDistributed) {
      setRateLimitHealth({
        requestedBackend: requested,
        activeBackend: 'redis',
        degraded: true,
        reason: 'redis_error_fail_closed',
        lastFailureAt: failureAt,
        requireDistributed,
      })
      return defaultBlockedResult(windowMs)
    }

    setRateLimitHealth({
      requestedBackend: requested,
      activeBackend: 'memory',
      degraded: true,
      reason: 'redis_error_fallback_memory',
      lastFailureAt: failureAt,
      requireDistributed,
    })
    return memoryRateLimit({ ...opts, windowMs, limit })
  }
}

export function setRateLimitRedisClientForTests(client: RedisCommandClient | null) {
  globalForRateLimit.rateLimitRedisClientOverride = client
  globalForRateLimit.rateLimitRedisClientPromise = undefined
}

export async function closeRateLimitRedisClientForTests() {
  const override = globalForRateLimit.rateLimitRedisClientOverride
  const promised = globalForRateLimit.rateLimitRedisClientPromise

  globalForRateLimit.rateLimitRedisClientOverride = undefined
  globalForRateLimit.rateLimitRedisClientPromise = undefined

  const seen = new Set<RedisCommandClient>()
  if (override) {
    seen.add(override)
    await override.quit?.().catch(() => {})
  }

  const resolved = await promised?.catch(() => null)
  if (resolved && !seen.has(resolved)) {
    await resolved.quit?.().catch(() => {})
  }
}

export function clearRateLimitStateForTests() {
  buckets.clear()
  globalForRateLimit.rateLimitRedisClientPromise = undefined
  globalForRateLimit.rateLimitRedisClientOverride = undefined
  setRateLimitHealth(defaultRateLimitHealth())
}

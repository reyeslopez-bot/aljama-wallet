import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildRateLimitKey,
  clearRateLimitStateForTests,
  getClientIp,
  getRateLimitBackendHealth,
  rateLimit,
  setRateLimitRedisClientForTests,
} from '@/lib/security/rate-limit'

type CounterState = {
  count: number
  expiresAt: number | null
}

class FakeRedisRateLimitClient {
  private counters = new Map<string, CounterState>()

  private getLiveCounter(key: string): CounterState | null {
    const current = this.counters.get(key)
    if (!current) return null
    if (current.expiresAt !== null && current.expiresAt <= Date.now()) {
      this.counters.delete(key)
      return null
    }
    return current
  }

  async sendCommand(args: string[]): Promise<unknown> {
    const command = args[0]?.toUpperCase()
    if (!command) throw new Error('missing redis command')

    if (command === 'INCR') {
      const key = args[1]
      if (!key) throw new Error('missing key for INCR')

      const current = this.getLiveCounter(key) ?? { count: 0, expiresAt: null }
      const next = { ...current, count: current.count + 1 }
      this.counters.set(key, next)
      return next.count
    }

    if (command === 'PEXPIRE') {
      const key = args[1]
      const ttlMs = Number(args[2] ?? '')
      if (!key || !Number.isFinite(ttlMs)) return 0

      const current = this.getLiveCounter(key)
      if (!current) return 0
      this.counters.set(key, { ...current, expiresAt: Date.now() + Math.max(0, Math.floor(ttlMs)) })
      return 1
    }

    if (command === 'PTTL') {
      const key = args[1]
      if (!key) return -2
      const current = this.getLiveCounter(key)
      if (!current) return -2
      if (current.expiresAt === null) return -1
      return Math.max(0, current.expiresAt - Date.now())
    }

    throw new Error(`unsupported redis command: ${command}`)
  }
}

describe('rate-limit', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    clearRateLimitStateForTests()
  })

  it('extracts client ip and builds a stable key', () => {
    const req = new Request('https://example.com', {
      headers: {
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
      },
    })

    expect(getClientIp(req)).toBe('203.0.113.10')
    expect(buildRateLimitKey(req, null)).toBe('ip:203.0.113.10')
    expect(buildRateLimitKey(req, 'user_123')).toBe('user:user_123')
  })

  it('enforces limits with in-memory backend', async () => {
    const first = await rateLimit({
      bucket: 'auth',
      key: 'ip:198.51.100.10',
      limit: 2,
      windowMs: 60_000,
    })
    const second = await rateLimit({
      bucket: 'auth',
      key: 'ip:198.51.100.10',
      limit: 2,
      windowMs: 60_000,
    })
    const third = await rateLimit({
      bucket: 'auth',
      key: 'ip:198.51.100.10',
      limit: 2,
      windowMs: 60_000,
    })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(third.ok).toBe(false)

    const health = getRateLimitBackendHealth()
    expect(health.activeBackend).toBe('memory')
    expect(health.degraded).toBe(false)
  })

  it('uses redis counters when redis backend is configured', async () => {
    vi.stubEnv('SECURITY_RATE_LIMIT_BACKEND', 'redis')
    setRateLimitRedisClientForTests(new FakeRedisRateLimitClient())

    const first = await rateLimit({
      bucket: 'security-signals',
      key: 'ip:198.51.100.11',
      limit: 1,
      windowMs: 60_000,
    })
    const second = await rateLimit({
      bucket: 'security-signals',
      key: 'ip:198.51.100.11',
      limit: 1,
      windowMs: 60_000,
    })

    expect(first).toMatchObject({ ok: true, remaining: 0 })
    expect(second.ok).toBe(false)

    const health = getRateLimitBackendHealth()
    expect(health.activeBackend).toBe('redis')
    expect(health.degraded).toBe(false)
  })

  it('falls back to in-memory when redis backend is unavailable and distributed mode is optional', async () => {
    vi.stubEnv('SECURITY_RATE_LIMIT_BACKEND', 'redis')
    setRateLimitRedisClientForTests(null)

    const first = await rateLimit({
      bucket: 'telemetry',
      key: 'ip:198.51.100.12',
      limit: 1,
      windowMs: 60_000,
    })
    const second = await rateLimit({
      bucket: 'telemetry',
      key: 'ip:198.51.100.12',
      limit: 1,
      windowMs: 60_000,
    })

    expect(first).toMatchObject({ ok: true, remaining: 0 })
    expect(second.ok).toBe(false)

    const health = getRateLimitBackendHealth()
    expect(health.activeBackend).toBe('memory')
    expect(health.degraded).toBe(true)
    expect(health.reason).toBe('redis_unavailable_fallback_memory')
  })

  it('fails closed when distributed mode is required and redis backend is unavailable', async () => {
    vi.stubEnv('SECURITY_RATE_LIMIT_BACKEND', 'memory')
    vi.stubEnv('SECURITY_RATE_LIMIT_REQUIRE_DISTRIBUTED', 'true')
    setRateLimitRedisClientForTests(null)

    const result = await rateLimit({
      bucket: 'wallet-send',
      key: 'user:abc',
      limit: 10,
      windowMs: 20_000,
    })

    expect(result.ok).toBe(false)

    const health = getRateLimitBackendHealth()
    expect(health.activeBackend).toBe('redis')
    expect(health.degraded).toBe(true)
    expect(health.reason).toBe('redis_unavailable_fail_closed')
    expect(health.requireDistributed).toBe(true)
  })
})

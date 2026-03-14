import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, type RedisClientType } from 'redis'
import {
  clearRateLimitStateForTests,
  closeRateLimitRedisClientForTests,
  getRateLimitBackendHealth,
  rateLimit,
  setRateLimitRedisClientForTests,
} from '@/lib/security/rate-limit'
import {
  createQueueAdapterFromEnv,
  getSecuritySignalQueueAdapterHealth,
  resetSecuritySignalQueueAdapterHealthForTests,
  RedisQueueAdapter,
  type QueueSignalPayload,
} from '@/services/security-signal-queue.adapter'

const RUN_INFRA_REDIS_TESTS = process.env.RUN_INFRA_REDIS_INTEGRATION_TESTS === 'true'
const describeInfra = RUN_INFRA_REDIS_TESTS ? describe : describe.skip
const REDIS_URL =
  process.env.TEST_REDIS_URL?.trim() ||
  process.env.REDIS_URL?.trim() ||
  process.env.SECURITY_SIGNAL_REDIS_URL?.trim() ||
  process.env.SECURITY_RATE_LIMIT_REDIS_URL?.trim() ||
  ''

type RedisCommandClientLike = {
  sendCommand(args: string[]): Promise<unknown>
  quit?: () => Promise<void>
}

function uniqueId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${process.pid}`
  return `${prefix}-${suffix}`
}

function sampleSignal(overrides?: Partial<QueueSignalPayload>): QueueSignalPayload {
  return {
    source: 'auth.register',
    outcome: 'failure',
    ...overrides,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describeInfra('Redis infrastructure integration', () => {
  let redisClient: RedisClientType | null = null

  beforeAll(async () => {
    if (!REDIS_URL) {
      throw new Error('REDIS_URL or TEST_REDIS_URL is required for RUN_INFRA_REDIS_INTEGRATION_TESTS=true')
    }

    redisClient = createClient({ url: REDIS_URL })
    redisClient.on('error', () => {})
    await redisClient.connect()
  })

  afterAll(async () => {
    clearRateLimitStateForTests()
    resetSecuritySignalQueueAdapterHealthForTests()
    await closeRateLimitRedisClientForTests()
    await redisClient?.quit().catch(() => {})
  })

  beforeEach(() => {
    vi.unstubAllEnvs()
    clearRateLimitStateForTests()
    resetSecuritySignalQueueAdapterHealthForTests()
  })

  it('enforces shared rate limits atomically through real Redis', async () => {
    const client = redisClient as unknown as RedisCommandClientLike
    const limit = 5
    const attempts = 12

    vi.stubEnv('SECURITY_RATE_LIMIT_BACKEND', 'redis')
    vi.stubEnv('SECURITY_RATE_LIMIT_PREFIX', uniqueId('infra-rate-limit'))
    setRateLimitRedisClientForTests(client)

    const results = await Promise.all(
      Array.from({ length: attempts }, () =>
        rateLimit({
          bucket: 'wallet-send',
          key: 'user:integration-test',
          limit,
          windowMs: 60_000,
        }),
      ),
    )

    expect(results.filter((result) => result.ok).length).toBe(limit)
    expect(results.filter((result) => !result.ok).length).toBe(attempts - limit)

    const health = getRateLimitBackendHealth()
    expect(health.activeBackend).toBe('redis')
    expect(health.degraded).toBe(false)
  })

  it('fails closed when distributed rate limiting loses its Redis client', async () => {
    const failingClient = createClient({ url: REDIS_URL })
    failingClient.on('error', () => {})
    await failingClient.connect()

    vi.stubEnv('SECURITY_RATE_LIMIT_BACKEND', 'redis')
    vi.stubEnv('SECURITY_RATE_LIMIT_REQUIRE_DISTRIBUTED', 'true')
    vi.stubEnv('SECURITY_RATE_LIMIT_PREFIX', uniqueId('infra-rate-limit-fail-closed'))
    setRateLimitRedisClientForTests(failingClient as unknown as RedisCommandClientLike)

    await failingClient.quit()

    const result = await rateLimit({
      bucket: 'security-signals',
      key: 'ip:203.0.113.55',
      limit: 10,
      windowMs: 20_000,
    })

    expect(result).toMatchObject({ ok: false, failureKind: 'backend_unavailable' })

    const health = getRateLimitBackendHealth()
    expect(health.activeBackend).toBe('redis')
    expect(health.degraded).toBe(true)
    expect(health.reason).toBe('redis_error_fail_closed')
  })

  it('creates an env-backed Redis queue adapter and drains messages with acks', async () => {
    const streamKey = uniqueId('security-signals')
    const group = uniqueId('detection-group')
    const adapterEnv = {
      SECURITY_SIGNAL_QUEUE_BACKEND: 'redis',
      SECURITY_SIGNAL_QUEUE_REQUIRE_DURABLE: 'true',
      SECURITY_SIGNAL_REDIS_URL: REDIS_URL,
      SECURITY_SIGNAL_REDIS_STREAM: streamKey,
      SECURITY_SIGNAL_REDIS_GROUP: group,
      SECURITY_SIGNAL_REDIS_CONSUMER: 'integration-consumer',
      SECURITY_SIGNAL_REDIS_BLOCK_MS: '15',
      SECURITY_SIGNAL_REDIS_MIN_IDLE_MS: '25',
    }

    Object.entries(adapterEnv).forEach(([key, value]) => vi.stubEnv(key, value))

    const adapter = await createQueueAdapterFromEnv()

    expect(adapter).toBeInstanceOf(RedisQueueAdapter)

    try {
      await adapter.resetForTests?.()

      await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          adapter.enqueue(sampleSignal({ source: `wallet.send.${index}` }), {
            transport: 'event_bus',
            retryCount: index % 2,
          }),
        ),
      )

      const dequeued = await adapter.dequeue(10)
      expect(dequeued).toHaveLength(8)
      expect(dequeued.every((message) => message.signal.source.startsWith('wallet.send.'))).toBe(true)

      await Promise.all(dequeued.map((message) => adapter.ack(message)))

      const stats = await adapter.getStats()
      expect(stats.backend).toBe('redis')
      expect(stats.pending).toBe(0)

      const health = getSecuritySignalQueueAdapterHealth()
      expect(health.activeBackend).toBe('redis')
      expect(health.degraded).toBe(false)
    } finally {
      await adapter.resetForTests?.()
      await adapter.closeForTests?.()
    }
  })

  it('redelivers pending Redis queue entries after the idle timeout', async () => {
    const streamKey = uniqueId('security-signals-retry')
    const group = uniqueId('detection-group-retry')

    const firstConsumer = RedisQueueAdapter.fromClient(redisClient as unknown as RedisCommandClientLike, {
      streamKey,
      group,
      consumer: 'integration-retry-a',
      blockMs: 15,
      minIdleMs: 20,
    })
    const secondConsumer = RedisQueueAdapter.fromClient(redisClient as unknown as RedisCommandClientLike, {
      streamKey,
      group,
      consumer: 'integration-retry-b',
      blockMs: 15,
      minIdleMs: 20,
    })

    try {
      await firstConsumer.resetForTests?.()
      await firstConsumer.enqueue(sampleSignal({ source: 'wallet.send.retry' }))

      const first = await firstConsumer.dequeue(1)
      expect(first).toHaveLength(1)

      await sleep(35)

      const second = await secondConsumer.dequeue(1)
      expect(second).toHaveLength(1)
      expect(second[0]?.id).toBe(first[0]?.id)

      await secondConsumer.ack(second[0]!)
    } finally {
      await firstConsumer.resetForTests?.()
    }
  })

  it('fails closed when durable queue mode is enabled without Redis configuration', async () => {
    vi.stubEnv('SECURITY_SIGNAL_QUEUE_BACKEND', 'redis')
    vi.stubEnv('SECURITY_SIGNAL_QUEUE_REQUIRE_DURABLE', 'true')
    vi.stubEnv('SECURITY_SIGNAL_REDIS_URL', '')
    vi.stubEnv('SECURITY_SIGNAL_REDIS_STREAM', uniqueId('security-signals-unavailable'))

    await expect(createQueueAdapterFromEnv()).rejects.toThrow(/durable_queue_required:/)

    const health = getSecuritySignalQueueAdapterHealth()
    expect(health.activeBackend).toBe('redis')
    expect(health.degraded).toBe(true)
    expect(health.requireDurable).toBe(true)
  })
})

import process from 'node:process'
import { createClient } from 'redis'
import {
  clearRateLimitStateForTests,
  closeRateLimitRedisClientForTests,
  getRateLimitBackendHealth,
  rateLimit,
  setRateLimitRedisClientForTests,
} from '../../lib/security/rate-limit'
import { RedisQueueAdapter } from '../../services/security-signal-queue.adapter'

type RedisCommandClientLike = {
  sendCommand(args: string[]): Promise<unknown>
  quit?: () => Promise<void>
}

type RedisClientInstance = ReturnType<typeof createClient>

type QueueSignalPayload = {
  source: string
  outcome: 'success' | 'failure' | 'blocked'
}

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(raw)) return fallback
  return Math.max(1, Math.floor(raw))
}

function uniqueId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${process.pid}`
  return `${prefix}-${suffix}`
}

function sampleSignal(index: number): QueueSignalPayload {
  return {
    source: `load.smoke.${index}`,
    outcome: 'failure',
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runRateLimitScenario(client: RedisCommandClientLike) {
  const totalRequests = envInt('INFRA_LOAD_RATE_LIMIT_REQUESTS', 120)
  const limit = envInt('INFRA_LOAD_RATE_LIMIT_ALLOW', 60)

  process.env.SECURITY_RATE_LIMIT_BACKEND = 'redis'
  process.env.SECURITY_RATE_LIMIT_PREFIX = uniqueId('infra-load-rate-limit')
  delete process.env.SECURITY_RATE_LIMIT_REQUIRE_DISTRIBUTED

  clearRateLimitStateForTests()
  setRateLimitRedisClientForTests(client)

  const startedAt = performance.now()
  const results = await Promise.all(
    Array.from({ length: totalRequests }, () =>
      rateLimit({
        bucket: 'load-smoke',
        key: 'user:load-smoke',
        limit,
        windowMs: 60_000,
      }),
    ),
  )
  const durationMs = Math.round(performance.now() - startedAt)

  const okCount = results.filter((result) => result.ok).length
  const blockedCount = results.filter((result) => !result.ok).length
  const health = getRateLimitBackendHealth()

  assert(okCount === limit, `Expected ${limit} allowed requests, received ${okCount}`)
  assert(blockedCount === totalRequests - limit, 'Redis rate limit did not block the expected remainder')
  assert(health.activeBackend === 'redis' && !health.degraded, 'Rate limit backend did not stay healthy on Redis')

  return {
    scenario: 'rate-limit',
    totalRequests,
    limit,
    okCount,
    blockedCount,
    durationMs,
  }
}

async function runQueueScenario(client: RedisClientInstance) {
  const totalMessages = envInt('INFRA_LOAD_QUEUE_MESSAGES', 200)
  const batchSize = envInt('INFRA_LOAD_QUEUE_BATCH', 25)

  const adapter = RedisQueueAdapter.fromClient(client as unknown as RedisCommandClientLike, {
    streamKey: uniqueId('infra-load-signals'),
    group: uniqueId('infra-load-group'),
    consumer: 'infra-load-consumer',
    blockMs: 20,
    minIdleMs: 25,
    maxDepth: Math.max(totalMessages * 2, 1_000),
  })

  try {
    await adapter.resetForTests()

    const enqueueStartedAt = performance.now()
    await Promise.all(
      Array.from({ length: totalMessages }, (_, index) =>
        adapter.enqueue(sampleSignal(index), {
          transport: 'event_bus',
          retryCount: index % 3,
        }),
      ),
    )
    const enqueueDurationMs = Math.round(performance.now() - enqueueStartedAt)

    let acked = 0
    const drainStartedAt = performance.now()
    while (acked < totalMessages) {
      const batch = await adapter.dequeue(batchSize)
      if (batch.length === 0) {
        await sleep(10)
        continue
      }

      await Promise.all(batch.map((message) => adapter.ack(message)))
      acked += batch.length
    }

    const drainDurationMs = Math.round(performance.now() - drainStartedAt)
    const stats = await adapter.getStats()

    assert(acked === totalMessages, `Expected to ack ${totalMessages} queue messages, received ${acked}`)
    assert(stats.pending === 0, 'Redis queue still had pending messages after drain')

    return {
      scenario: 'queue',
      totalMessages,
      batchSize,
      acked,
      enqueueDurationMs,
      drainDurationMs,
      streamDepth: stats.depth,
      pending: stats.pending,
    }
  } finally {
    await adapter.resetForTests()
  }
}

async function main() {
  const redisUrl =
    process.env.TEST_REDIS_URL?.trim() ||
    process.env.REDIS_URL?.trim() ||
    process.env.SECURITY_SIGNAL_REDIS_URL?.trim() ||
    process.env.SECURITY_RATE_LIMIT_REDIS_URL?.trim() ||
    ''

  if (!redisUrl) {
    throw new Error('REDIS_URL or TEST_REDIS_URL is required for infra load smoke')
  }

  const client = createClient({ url: redisUrl })
  client.on('error', (error) => {
    console.error('redis-smoke:error', error)
  })

  await client.connect()

  try {
    const rateLimitResult = await runRateLimitScenario(client as unknown as RedisCommandClientLike)
    const queueResult = await runQueueScenario(client)

    console.log(JSON.stringify({ ok: true, rateLimitResult, queueResult }, null, 2))
  } finally {
    clearRateLimitStateForTests()
    await closeRateLimitRedisClientForTests()
    await client.quit().catch(() => {})
  }
}

await main()

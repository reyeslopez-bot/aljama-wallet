import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSecurityAnomalyStateForTests,
  getRecentSecuritySignals,
  getSecuritySignalQueueState,
  ingestSecuritySignal,
  registerSecurityAnomalyRule,
  recordSecuritySignal,
} from '@/services/security-anomaly.service'
import {
  clearSecurityAlertsForTests,
  getSecurityAlerts,
} from '@/services/security-alert.service'

describe('security-anomaly.service', () => {
  beforeEach(() => {
    clearSecurityAnomalyStateForTests()
    clearSecurityAlertsForTests()
    vi.unstubAllEnvs()
  })

  it('detects repetitive failure bursts from one IP/source', async () => {
    vi.stubEnv('SECURITY_ANOMALY_FAILURE_BURST_THRESHOLD', '3')
    vi.stubEnv('SECURITY_ANOMALY_VELOCITY_THRESHOLD', '999')

    await recordSecuritySignal({
      source: 'auth.register',
      route: '/api/auth/register',
      outcome: 'failure',
      statusCode: 401,
      ipHash: 'ip-hash-1',
      principal: 'a@example.com',
    })
    await recordSecuritySignal({
      source: 'auth.register',
      route: '/api/auth/register',
      outcome: 'failure',
      statusCode: 401,
      ipHash: 'ip-hash-1',
      principal: 'b@example.com',
    })
    const result = await recordSecuritySignal({
      source: 'auth.register',
      route: '/api/auth/register',
      outcome: 'failure',
      statusCode: 401,
      ipHash: 'ip-hash-1',
      principal: 'c@example.com',
    })

    const burst = result.anomalies.find((item) => item.ruleId === 'failure.burst')
    expect(burst).toBeDefined()
    expect(burst?.repetitive).toBe(true)
    expect(burst?.severity).toBe('high')

    const alerts = getSecurityAlerts()
    expect(alerts.some((item) => item.ruleId === 'failure.burst')).toBe(true)
  })

  it('detects non-repetitive impossible travel anomalies', async () => {
    vi.stubEnv('SECURITY_ANOMALY_IMPOSSIBLE_TRAVEL_DISTANCE_KM', '1000')
    vi.stubEnv('SECURITY_ANOMALY_IMPOSSIBLE_TRAVEL_WINDOW_MS', '3600000')

    await recordSecuritySignal({
      source: 'wallet.track',
      route: '/api/track-wallet',
      outcome: 'success',
      statusCode: 200,
      sessionId: 'session-1',
      country: 'US',
      latitude: 37.7749,
      longitude: -122.4194,
      ipHash: 'ip-hash-2',
    })
    await new Promise((resolve) => setTimeout(resolve, 2))

    const result = await recordSecuritySignal({
      source: 'wallet.track',
      route: '/api/track-wallet',
      outcome: 'success',
      statusCode: 200,
      sessionId: 'session-1',
      country: 'JP',
      latitude: 35.6762,
      longitude: 139.6503,
      ipHash: 'ip-hash-2',
    })

    const anomaly = result.anomalies.find((item) => item.ruleId === 'geo.impossible_travel')
    expect(anomaly).toBeDefined()
    expect(anomaly?.repetitive).toBe(false)
    expect(anomaly?.severity).toBe('high')
  })

  it('detects one-off probes on internal routes and emits critical alerts', async () => {
    const result = await recordSecuritySignal({
      source: 'internal.test-db',
      route: '/api/test-db',
      outcome: 'failure',
      statusCode: 401,
      ipHash: 'ip-hash-3',
    })

    const anomaly = result.anomalies.find((item) => item.ruleId === 'probe.internal_route')
    expect(anomaly).toBeDefined()
    expect(anomaly?.repetitive).toBe(false)
    expect(anomaly?.severity).toBe('critical')

    const alerts = getSecurityAlerts()
    expect(alerts.some((item) => item.ruleId === 'probe.internal_route')).toBe(true)
  })

  it('normalizes inbound signals and ingests through queue transport', async () => {
    const result = await ingestSecuritySignal(
      {
        source: 'auth.register',
        status: 401,
        ip: '203.0.113.9',
        principal: 'foo@example.com',
      },
      {
        transport: 'api',
        enqueue: true,
        drain: true,
      },
    )

    expect(result.accepted).toBe(true)
    expect(result.rejected).toBe(false)

    const signals = getRecentSecuritySignals(1)
    expect(signals.length).toBe(1)
    expect(signals[0]?.source).toBe('auth.register')
    expect(signals[0]?.outcome).toBe('blocked')
    expect(signals[0]?.ipHash).toMatch(/^[a-f0-9]{64}$/)
    expect(signals[0]?.transport).toBe('api')
  })

  it('applies queue backpressure strategy by dropping the oldest signal', async () => {
    vi.stubEnv('SECURITY_SIGNAL_QUEUE_MAX_DEPTH', '1')
    vi.stubEnv('SECURITY_SIGNAL_QUEUE_HIGH_WATER', '10')
    vi.stubEnv('SECURITY_SIGNAL_QUEUE_LOW_WATER', '5')
    vi.stubEnv('SECURITY_SIGNAL_QUEUE_OVERFLOW_STRATEGY', 'drop_oldest')

    const first = await ingestSecuritySignal(
      {
        source: 'telemetry',
        outcome: 'success',
      },
      {
        transport: 'queue',
        enqueue: true,
        drain: false,
      },
    )
    expect(first.accepted).toBe(true)

    const second = await ingestSecuritySignal(
      {
        source: 'telemetry',
        outcome: 'failure',
      },
      {
        transport: 'queue',
        enqueue: true,
        drain: false,
      },
    )
    expect(second.accepted).toBe(true)

    const queueState = await getSecuritySignalQueueState()
    expect(queueState.depth).toBe(1)
    expect(queueState.stats.dropped).toBe(1)
  })

  it('throttles ingestion when queue load crosses high-water threshold and emits alert', async () => {
    vi.stubEnv('SECURITY_SIGNAL_QUEUE_HIGH_WATER', '1')
    vi.stubEnv('SECURITY_SIGNAL_QUEUE_LOW_WATER', '0')

    const first = await ingestSecuritySignal(
      {
        source: 'telemetry',
        outcome: 'success',
      },
      {
        transport: 'queue',
        enqueue: true,
        drain: false,
      },
    )
    expect(first.accepted).toBe(true)

    const second = await ingestSecuritySignal(
      {
        source: 'telemetry',
        outcome: 'success',
      },
      {
        transport: 'queue',
        enqueue: true,
        drain: false,
      },
    )

    expect(second.accepted).toBe(false)
    expect(second.rejected).toBe(true)
    expect(second.error).toBe('queue_throttled')

    const queueState = await getSecuritySignalQueueState()
    expect(queueState.throttled).toBe(true)

    const alerts = getSecurityAlerts()
    expect(alerts.some((item) => item.ruleId === 'queue.backpressure.high_water')).toBe(true)
  })

  it('rejects queued ingestion when durable backend is required but unavailable', async () => {
    vi.stubEnv('SECURITY_SIGNAL_QUEUE_BACKEND', 'redis')
    vi.stubEnv('SECURITY_SIGNAL_QUEUE_REQUIRE_DURABLE', 'true')
    vi.stubEnv('SECURITY_SIGNAL_REDIS_URL', '')
    vi.stubEnv('REDIS_URL', '')

    const result = await ingestSecuritySignal(
      {
        source: 'telemetry',
        outcome: 'success',
      },
      {
        transport: 'queue',
        enqueue: true,
        drain: false,
      },
    )

    expect(result.accepted).toBe(false)
    expect(result.rejected).toBe(true)
    expect(result.error).toContain('durable_queue_required')

    const queueState = await getSecuritySignalQueueState()
    expect(queueState.adapterHealth.degraded).toBe(true)
    expect(queueState.adapterHealth.requireDurable).toBe(true)
    expect(queueState.adapterError).toContain('durable_queue_required')
  })

  it('supports pluggable anomaly rules', async () => {
    registerSecurityAnomalyRule({
      id: 'custom.always',
      type: 'non_repetitive',
      description: 'Test rule',
      evaluate: () => ({
        severity: 'low',
        score: 45,
        summary: 'custom-rule-hit',
      }),
    })

    const result = await recordSecuritySignal({
      source: 'wallet.track',
      outcome: 'success',
    })

    expect(result.anomalies.some((item) => item.ruleId === 'custom.always')).toBe(true)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockHasValidInternalToken,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetClientIp,
  mockIngestSecuritySignalsBatch,
  mockRecordSecuritySignal,
} = vi.hoisted(() => ({
  mockHasValidInternalToken: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetClientIp: vi.fn(),
  mockIngestSecuritySignalsBatch: vi.fn(),
  mockRecordSecuritySignal: vi.fn(),
}))

vi.mock('@/lib/security/internal-token', () => ({
  hasValidInternalToken: mockHasValidInternalToken,
}))

vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
  getClientIp: mockGetClientIp,
}))

vi.mock('@/services/security-anomaly.service', () => ({
  ingestSecuritySignalsBatch: mockIngestSecuritySignalsBatch,
  recordSecuritySignal: mockRecordSecuritySignal,
}))

describe('app/api/security/signals route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    vi.stubEnv('SECURITY_SIGNAL_INGEST_TOKEN', 'ingest-token')
    mockHasValidInternalToken.mockReturnValue(true)
    mockGetClientIp.mockReturnValue('127.0.0.1')
    mockBuildRateLimitKey.mockReturnValue('ip:127.0.0.1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 59, resetAt: Date.now() + 60_000 })
    mockRecordSecuritySignal.mockResolvedValue({ signal: {}, anomalies: [] })
    mockIngestSecuritySignalsBatch.mockResolvedValue([
      {
        accepted: true,
        rejected: false,
        dropped: false,
        queued: true,
        processed: true,
        queueId: 'queue_1',
        queueLength: 0,
      },
    ])
  })

  it('returns 404 when signal ingest token is not configured', async () => {
    vi.stubEnv('SECURITY_SIGNAL_INGEST_TOKEN', '')
    vi.stubEnv('SECURITY_ALERTS_API_TOKEN', '')
    vi.stubEnv('INTERNAL_API_TOKEN', '')

    const { POST } = await import('@/app/api/security/signals/route')
    const res = await POST(
      new Request('http://localhost/api/security/signals', {
        method: 'POST',
        body: JSON.stringify({ source: 'auth.register', outcome: 'success' }),
        headers: { 'content-type': 'application/json' },
      }),
    )

    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.code).toBe('disabled')
  })

  it('returns 401 when token validation fails', async () => {
    mockHasValidInternalToken.mockReturnValue(false)

    const { POST } = await import('@/app/api/security/signals/route')
    const res = await POST(
      new Request('http://localhost/api/security/signals', {
        method: 'POST',
        body: JSON.stringify({ source: 'auth.register', outcome: 'success' }),
        headers: { 'content-type': 'application/json' },
      }),
    )

    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.code).toBe('unauthorized')
  })

  it('accepts and processes batched security signals', async () => {
    const { POST } = await import('@/app/api/security/signals/route')

    const res = await POST(
      new Request('http://localhost/api/security/signals', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ingest-token',
        },
        body: JSON.stringify({
          transport: 'event_bus',
          enqueue: true,
          signals: [
            { source: 'auth.register', status: 401, ip: '203.0.113.1' },
            { source: 'wallet.send', statusCode: 200, outcome: 'success' },
          ],
        }),
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.transport).toBe('event_bus')
    expect(body.queued).toBe(true)
    expect(body.accepted).toBe(1)

    expect(mockIngestSecuritySignalsBatch).toHaveBeenCalledWith(
      [
        { source: 'auth.register', status: 401, ip: '203.0.113.1' },
        { source: 'wallet.send', statusCode: 200, outcome: 'success' },
      ],
      expect.objectContaining({
        enqueue: true,
        transport: 'event_bus',
        drain: true,
        fallbackSource: 'external.ingest',
      }),
    )
  })

  it('returns 503 when the distributed rate limit backend is unavailable', async () => {
    mockRateLimit.mockReturnValue({
      ok: false,
      retryAfter: 15,
      resetAt: Date.now() + 15_000,
      failureKind: 'backend_unavailable',
    })

    const { POST } = await import('@/app/api/security/signals/route')
    const res = await POST(
      new Request('http://localhost/api/security/signals', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ingest-token',
        },
        body: JSON.stringify({ source: 'auth.register', outcome: 'success' }),
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.code).toBe('rate_limit_backend_unavailable')
    expect(res.headers.get('retry-after')).toBe('15')
  })

  it('returns 429 when queue backpressure throttles all ingested signals', async () => {
    mockIngestSecuritySignalsBatch.mockResolvedValue([
      {
        accepted: false,
        rejected: true,
        dropped: false,
        queued: false,
        processed: false,
        queueId: null,
        queueLength: 5000,
        error: 'queue_throttled',
      },
      {
        accepted: false,
        rejected: true,
        dropped: false,
        queued: false,
        processed: false,
        queueId: null,
        queueLength: 5001,
        error: 'queue_throttled',
      },
    ])

    const { POST } = await import('@/app/api/security/signals/route')
    const res = await POST(
      new Request('http://localhost/api/security/signals', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ingest-token',
        },
        body: JSON.stringify({
          signals: [
            { source: 'auth.register', status: 401 },
            { source: 'wallet.send', statusCode: 500 },
          ],
        }),
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.code).toBe('queue_throttled')
    expect(body.details.throttled).toBe(2)
  })
})

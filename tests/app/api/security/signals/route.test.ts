import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSecuritySignalIngestSignature } from '@/lib/security/signal-ingest-auth'

const {
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetClientIp,
  mockIngestSecuritySignalsBatch,
  mockRecordSecuritySignal,
} = vi.hoisted(() => ({
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetClientIp: vi.fn(),
  mockIngestSecuritySignalsBatch: vi.fn(),
  mockRecordSecuritySignal: vi.fn(),
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

const PRODUCER_ID = 'event-bus'
const PRODUCER_SECRET = 'ingest-secret'
const REQUEST_TRACE_ID = 'trace-security-signals-1'

function createSignedRequest(body: unknown, init?: { signature?: string; producerId?: string }) {
  const rawBody = JSON.stringify(body)
  const signature = init?.signature ?? createSecuritySignalIngestSignature(rawBody, PRODUCER_SECRET)

  return new Request('http://localhost/api/security/signals', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-trace-id': REQUEST_TRACE_ID,
      'x-security-producer-id': init?.producerId ?? PRODUCER_ID,
      'x-security-signature': signature,
    },
    body: rawBody,
  })
}

function buildSignalEnvelope(
  signals: Array<Record<string, unknown>>,
  overrides?: Record<string, unknown>,
) {
  return {
    schemaVersion: '1',
    signals,
    ...(overrides ?? {}),
  }
}

describe('app/api/security/signals route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    vi.stubEnv(
      'SECURITY_SIGNAL_INGEST_HMAC_PRODUCERS',
      JSON.stringify({
        [PRODUCER_ID]: {
          secret: PRODUCER_SECRET,
          type: 'event_bus',
        },
      }),
    )

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

  it('returns 404 when HMAC producers are not configured', async () => {
    vi.stubEnv('SECURITY_SIGNAL_INGEST_HMAC_PRODUCERS', '')
    vi.stubEnv('SECURITY_SIGNAL_INGEST_PRODUCERS', '')

    const { POST } = await import('@/app/api/security/signals/route')
    const res = await POST(
      new Request('http://localhost/api/security/signals', {
        method: 'POST',
        body: JSON.stringify(buildSignalEnvelope([{ source: 'auth.register', outcome: 'success' }])),
        headers: { 'content-type': 'application/json' },
      }),
    )

    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.code).toBe('disabled')
  })

  it('returns 401 when signature validation fails', async () => {
    const { POST } = await import('@/app/api/security/signals/route')
    const res = await POST(
      createSignedRequest(
        buildSignalEnvelope([{ source: 'auth.register', outcome: 'success' }]),
        { signature: '0'.repeat(64) },
      ),
    )

    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.code).toBe('unauthorized')
  })

  it('returns 503 when the producer config is malformed', async () => {
    vi.stubEnv('SECURITY_SIGNAL_INGEST_HMAC_PRODUCERS', '{bad-json')

    const { POST } = await import('@/app/api/security/signals/route')
    const res = await POST(
      new Request('http://localhost/api/security/signals', {
        method: 'POST',
        body: JSON.stringify(buildSignalEnvelope([{ source: 'auth.register', outcome: 'success' }])),
        headers: { 'content-type': 'application/json' },
      }),
    )

    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.code).toBe('ingest_auth_unavailable')
  })

  it('accepts and processes batched security signals with verified producer metadata', async () => {
    const { POST } = await import('@/app/api/security/signals/route')

    const res = await POST(
      createSignedRequest(
        buildSignalEnvelope(
          [
            {
              source: 'auth.register',
              statusCode: 401,
              ip: '203.0.113.1',
            },
            { source: 'wallet.send', statusCode: 200, outcome: 'success' },
          ],
          {
            transport: 'event_bus',
            enqueue: true,
          },
        ),
      ),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.transport).toBe('event_bus')
    expect(body.queued).toBe(true)
    expect(body.accepted).toBe(1)
    expect(body.producerId).toBe(PRODUCER_ID)
    expect(body.producerType).toBe('event_bus')
    expect(body.ingestVersion).toBe('hmac-sha256-v1')

    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'security-signals',
        key: `producer:${PRODUCER_ID}`,
      }),
    )

    expect(mockIngestSecuritySignalsBatch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          source: 'auth.register',
          statusCode: 401,
          ip: '203.0.113.1',
          producerId: PRODUCER_ID,
          producerType: 'event_bus',
          signatureVerified: true,
          ingestVersion: 'hmac-sha256-v1',
          traceId: REQUEST_TRACE_ID,
        }),
        expect.objectContaining({
          source: 'wallet.send',
          statusCode: 200,
          outcome: 'success',
          producerId: PRODUCER_ID,
          producerType: 'event_bus',
          signatureVerified: true,
          ingestVersion: 'hmac-sha256-v1',
          traceId: REQUEST_TRACE_ID,
        }),
      ],
      expect.objectContaining({
        enqueue: true,
        transport: 'event_bus',
        drain: true,
        fallbackSource: 'external.ingest',
      }),
    )
    expect(mockRecordSecuritySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: REQUEST_TRACE_ID,
      }),
    )
  })

  it('rejects producer-reserved metadata inside signals', async () => {
    const { POST } = await import('@/app/api/security/signals/route')

    const res = await POST(
      createSignedRequest(
        buildSignalEnvelope([
          {
            source: 'auth.register',
            statusCode: 401,
            producerId: 'attacker',
          },
        ]),
      ),
    )

    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_SECURITY_SIGNAL_SCHEMA')
  })

  it('rejects sensitive free-form signal details', async () => {
    const { POST } = await import('@/app/api/security/signals/route')

    const res = await POST(
      createSignedRequest(
        buildSignalEnvelope([
          {
            source: 'auth.register',
            statusCode: 401,
            details: {
              password: 'secret',
            },
          },
        ]),
      ),
    )

    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_SECURITY_SIGNAL_SCHEMA')
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
      createSignedRequest(buildSignalEnvelope([{ source: 'auth.register', outcome: 'success' }])),
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
      createSignedRequest(
        buildSignalEnvelope([
          { source: 'auth.register', statusCode: 401 },
          { source: 'wallet.send', statusCode: 500 },
        ]),
      ),
    )
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.code).toBe('queue_throttled')
    expect(body.details.throttled).toBe(2)
  })
})

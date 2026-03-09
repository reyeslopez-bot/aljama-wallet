import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockRecordTelemetryEvent = vi.fn()

vi.mock('@/services/telemetry.service', () => ({
  recordTelemetryEvent: mockRecordTelemetryEvent,
}))

function buildRequest(body: string, headers?: Record<string, string>) {
  return new Request('http://localhost/api/telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    body,
  })
}

describe('app/api/telemetry route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('rejects invalid JSON', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { POST } = await import('@/app/api/telemetry/route')
    const res = await POST(buildRequest('not-json'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('invalid_json')
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('[telemetry:invalid_json]')
    expect(errorSpy.mock.calls[0]?.[1]).toMatchObject({
      path: '/api/telemetry',
      method: 'POST',
      reason: 'invalid_json',
      rawPreview: 'not-json',
      error: {
        name: 'SyntaxError',
      },
    })
  })

  it('rejects invalid payload', async () => {
    const { POST } = await import('@/app/api/telemetry/route')
    const res = await POST(buildRequest(JSON.stringify({})))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('invalid_payload')
  })

  it('accepts a valid payload and records telemetry', async () => {
    mockRecordTelemetryEvent.mockResolvedValue({ stored: 'memory' })

    const { POST } = await import('@/app/api/telemetry/route')
    const res = await POST(
      buildRequest(
        JSON.stringify({
          event: 'page_view',
          ts: new Date('2026-02-10T12:00:00Z').toISOString(),
          sessionId: 'session-1234',
          deviceId: 'device-1234',
          path: '/connect',
          context: { foo: 'bar' },
          payload: { a: 1 },
        }),
        { 'x-forwarded-for': '127.0.0.1' },
      ),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(res.headers.get('x-request-id')).toBeTruthy()
    expect(res.headers.get('x-response-time-ms')).toBeTruthy()
    await vi.runOnlyPendingTimersAsync()
    expect(mockRecordTelemetryEvent).toHaveBeenCalledTimes(1)

    const call = mockRecordTelemetryEvent.mock.calls[0]?.[0]
    expect(call).toMatchObject({
      event: 'page_view',
      sessionId: 'session-1234',
      deviceId: 'device-1234',
      path: '/connect',
    })
    expect(call.context?.server).toBeDefined()
  })

  it('does not block the response on slow telemetry persistence', async () => {
    mockRecordTelemetryEvent.mockImplementation(() => new Promise(() => {}))

    const { POST } = await import('@/app/api/telemetry/route')
    const startedAt = Date.now()
    const res = await POST(
      buildRequest(
        JSON.stringify({
          event: 'page_view',
          ts: new Date('2026-02-10T12:00:00Z').toISOString(),
          sessionId: 'session-slow',
          deviceId: 'device-slow',
          path: '/login',
        }),
        { 'x-forwarded-for': '127.0.0.1' },
      ),
    )

    expect(res.status).toBe(200)
    expect(Date.now() - startedAt).toBeLessThan(250)

    await vi.runOnlyPendingTimersAsync()
    expect(mockRecordTelemetryEvent).toHaveBeenCalledTimes(1)
  })

  it('logs deferred persistence failures with request context', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRecordTelemetryEvent.mockRejectedValue(new Error('persist failed'))

    const { POST } = await import('@/app/api/telemetry/route')
    const res = await POST(
      buildRequest(
        JSON.stringify({
          event: 'wallet_sync',
          ts: new Date('2026-02-10T12:00:00Z').toISOString(),
          sessionId: 'session-persist',
          deviceId: 'device-persist',
          path: '/wallet',
        }),
        { 'x-forwarded-for': '127.0.0.1' },
      ),
    )

    expect(res.status).toBe(200)

    await vi.runOnlyPendingTimersAsync()

    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('[telemetry:persist] persist failed')
    expect(errorSpy.mock.calls[0]?.[1]).toMatchObject({
      path: '/wallet',
      event: 'wallet_sync',
      sessionId: 'session-persist',
      deviceId: 'device-persist',
      method: 'POST',
      error: {
        message: 'persist failed',
      },
    })
  })
})

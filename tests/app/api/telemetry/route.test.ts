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
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects invalid JSON', async () => {
    const { POST } = await import('@/app/api/telemetry/route')
    const res = await POST(buildRequest('not-json'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error?.code).toBe('invalid_json')
  })

  it('rejects invalid payload', async () => {
    const { POST } = await import('@/app/api/telemetry/route')
    const res = await POST(buildRequest(JSON.stringify({})))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error?.code).toBe('invalid_payload')
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
})

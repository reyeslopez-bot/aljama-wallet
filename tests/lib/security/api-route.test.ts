import { describe, expect, it, vi } from 'vitest'
import { withApiRoute } from '@/lib/security/api-route'

describe('withApiRoute', () => {
  it('adds request metadata headers to successful responses', async () => {
    const handler = withApiRoute({ scope: 'test:success', timeoutMs: 50 }, async (_req, context) => {
      context.metrics.upstreamDurationMs = 12
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const res = await handler(
      new Request('http://localhost/test', {
        headers: { 'x-request-id': 'req-123', 'x-correlation-id': 'corr-456' },
      }),
    )

    expect(res.headers.get('x-request-id')).toBe('req-123')
    expect(res.headers.get('x-trace-id')).toBe('corr-456')
    expect(res.headers.get('x-correlation-id')).toBe('corr-456')
    expect(Number(res.headers.get('x-response-time-ms'))).toBeGreaterThanOrEqual(0)
    expect(Number(res.headers.get('x-total-duration-ms'))).toBeGreaterThanOrEqual(0)
    expect(res.headers.get('x-upstream-duration-ms')).toBe('12')
    await expect(res.json()).resolves.toEqual({ ok: true })
  })

  it('generates a request id while preserving inbound correlation ids', async () => {
    const handler = withApiRoute({ scope: 'test:correlation', timeoutMs: 50 }, async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const res = await handler(
      new Request('http://localhost/test', { headers: { 'x-correlation-id': 'corr-only-789' } }),
    )

    expect(res.headers.get('x-request-id')).toBeTruthy()
    expect(res.headers.get('x-request-id')).not.toBe('corr-only-789')
    expect(res.headers.get('x-trace-id')).toBe('corr-only-789')
    expect(res.headers.get('x-correlation-id')).toBe('corr-only-789')
  })

  it('prefers x-trace-id when both trace headers are present', async () => {
    const handler = withApiRoute({ scope: 'test:trace-header', timeoutMs: 50 }, async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const res = await handler(
      new Request('http://localhost/test', {
        headers: {
          'x-trace-id': 'trace-123',
          'x-correlation-id': 'corr-456',
        },
      }),
    )

    expect(res.headers.get('x-trace-id')).toBe('trace-123')
    expect(res.headers.get('x-correlation-id')).toBe('trace-123')
  })

  it('returns a standardized timeout response when the handler exceeds the budget', async () => {
    vi.useFakeTimers()

    const handler = withApiRoute({ scope: 'test:timeout', timeoutMs: 10 }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const pending = handler(new Request('http://localhost/test'))
    await vi.advanceTimersByTimeAsync(10)
    const res = await pending

    expect(res.status).toBe(504)
    expect(res.headers.get('x-request-id')).toBeTruthy()
    expect(res.headers.get('x-trace-id')).toBeTruthy()
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: 'request_timeout',
      error: 'REQUEST_TIMEOUT',
    })

    vi.useRealTimers()
  })
})

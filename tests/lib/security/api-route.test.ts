import { describe, expect, it, vi } from 'vitest'
import { withApiRoute } from '@/lib/security/api-route'

describe('withApiRoute', () => {
  it('adds request metadata headers to successful responses', async () => {
    const handler = withApiRoute({ scope: 'test:success', timeoutMs: 50 }, async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const res = await handler(new Request('http://localhost/test', { headers: { 'x-request-id': 'req-123' } }))

    expect(res.headers.get('x-request-id')).toBe('req-123')
    expect(Number(res.headers.get('x-response-time-ms'))).toBeGreaterThanOrEqual(0)
    await expect(res.json()).resolves.toEqual({ ok: true })
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
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: 'request_timeout',
      error: 'REQUEST_TIMEOUT',
    })

    vi.useRealTimers()
  })
})

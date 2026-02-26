import { describe, expect, it } from 'vitest'
import { errorJson, okJson } from '@/lib/security/api-response'

describe('api-response security headers', () => {
  it('adds secure default headers to success responses', async () => {
    const response = okJson({ foo: 'bar' })
    const payload = await response.json() as { ok: boolean; foo: string }

    expect(payload).toEqual({ ok: true, foo: 'bar' })
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('preserves caller-provided headers and status while applying defaults', () => {
    const response = errorJson(
      429,
      'rate_limited',
      'Rate limited',
      undefined,
      { headers: { 'retry-after': '42' } },
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('42')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
  })

  it('allows explicit overrides for security headers when needed', () => {
    const response = okJson(
      { okOverride: true },
      {
        headers: {
          'cache-control': 'public, max-age=60',
        },
      },
    )

    expect(response.headers.get('cache-control')).toBe('public, max-age=60')
  })
})

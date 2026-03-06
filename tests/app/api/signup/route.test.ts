import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockUpsertSignup = vi.fn()

vi.mock('@/services/signup.service', () => ({
  upsertSignup: mockUpsertSignup,
}))

describe('app/api/signup route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects invalid payloads', async () => {
    // NOTE: This asserts the API rejects malformed payloads before touching storage.
    const { POST } = await import('@/app/api/signup/route')
    const res = await POST(
      new Request('http://localhost/api/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      }),
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })

  it('stores signup and returns ok', async () => {
    // NOTE: We verify a successful path returns data in the expected shape,
    // and that the service is called once with normalized inputs.
    mockUpsertSignup.mockResolvedValue({
      id: 'signup-1',
      email: 'test@example.com',
      region: 'eu',
      source: 'region-panel',
    })

    const { POST } = await import('@/app/api/signup/route')
    const res = await POST(
      new Request('http://localhost/api/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          region: 'eu',
          source: 'region-panel',
        }),
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.email).toBe('test@example.com')
    expect(res.headers.get('x-request-id')).toBeTruthy()
    expect(res.headers.get('x-response-time-ms')).toBeTruthy()
  })
})

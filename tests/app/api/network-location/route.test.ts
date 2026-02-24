import { afterEach, describe, expect, it, vi } from 'vitest'

function buildRequest(headers?: Record<string, string>) {
  return new Request('http://localhost/api/network-location', {
    method: 'GET',
    headers: headers ?? {},
  })
}

describe('app/api/network-location route', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns network location from request headers when available', async () => {
    const { GET } = await import('@/app/api/network-location/route')
    const res = await GET(
      buildRequest({
        'x-vercel-ip-latitude': '31.7683',
        'x-vercel-ip-longitude': '35.2137',
        'x-vercel-ip-country': 'IL',
        'x-vercel-ip-country-region': 'JM',
        'x-vercel-ip-city': 'Jerusalem',
        'x-vercel-ip-timezone': 'Asia/Jerusalem',
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.location).toMatchObject({
      source: 'network',
      latitude: 31.7683,
      longitude: 35.2137,
      country: 'IL',
      region: 'JM',
      city: 'Jerusalem',
      timezone: 'Asia/Jerusalem',
    })
  })

  it('falls back to Dubai when location headers are missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { GET } = await import('@/app/api/network-location/route')
    const res = await GET(buildRequest())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.location).toMatchObject({
      source: 'default',
      latitude: 25.204849,
      longitude: 55.270783,
      city: 'Dubai',
      timezone: 'Asia/Dubai',
    })
  })
})

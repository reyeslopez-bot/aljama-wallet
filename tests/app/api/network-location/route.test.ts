import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function buildRequest(headers?: Record<string, string>) {
  return new Request('http://localhost/api/network-location', {
    method: 'GET',
    headers: headers ?? {},
  })
}

describe('app/api/network-location route', () => {
  beforeEach(() => {
    vi.resetModules()
    delete (globalThis as { __aljamaNetworkLocationCache?: unknown }).__aljamaNetworkLocationCache
    delete (globalThis as { __aljamaNetworkLocationInflight?: unknown }).__aljamaNetworkLocationInflight
  })

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
    expect(res.headers.get('x-request-id')).toBeTruthy()
    expect(res.headers.get('x-response-time-ms')).toBeTruthy()
  })

  it('prefers explicit request IP geolocation when headers are missing', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (url === 'https://ipwho.is/176.229.151.144') {
        return {
          ok: true,
          json: async () => ({
            success: true,
            latitude: 32.0852999,
            longitude: 34.7817676,
            country_code: 'IL',
            region: 'Tel Aviv District',
            city: 'Tel Aviv-Yafo',
            timezone: 'Asia/Jerusalem',
          }),
        }
      }

      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { GET } = await import('@/app/api/network-location/route')
    const res = await GET(buildRequest({ 'x-forwarded-for': '176.229.151.144' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.location).toMatchObject({
      source: 'network',
      latitude: 32.0852999,
      longitude: 34.7817676,
      country: 'IL',
      region: 'Tel Aviv District',
      city: 'Tel Aviv-Yafo',
      timezone: 'Asia/Jerusalem',
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
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

  it('reuses cached network location results for repeated request IP lookups', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (url === 'https://ipwho.is/176.229.151.144') {
        return {
          ok: true,
          json: async () => ({
            success: true,
            latitude: 32.0852999,
            longitude: 34.7817676,
            country_code: 'IL',
            region: 'Tel Aviv District',
            city: 'Tel Aviv-Yafo',
            timezone: 'Asia/Jerusalem',
          }),
        }
      }

      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { GET } = await import('@/app/api/network-location/route')

    const first = await GET(buildRequest({ 'x-forwarded-for': '176.229.151.144' }))
    const second = await GET(buildRequest({ 'x-forwarded-for': '176.229.151.144' }))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

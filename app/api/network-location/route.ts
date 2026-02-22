import { okJson } from '@/lib/security/api-response'

type NetworkLocation = {
  source: 'network' | 'default'
  latitude: number
  longitude: number
  country: string | null
  region: string | null
  city: string | null
  timezone: string
}

type IpApiFallbackResponse = {
  latitude?: number | string
  longitude?: number | string
  country_code?: string | null
  region?: string | null
  city?: string | null
  timezone?: string | null
}

type IpWhoIsResponse = {
  success?: boolean
  latitude?: number | string
  longitude?: number | string
  country_code?: string | null
  region?: string | null
  city?: string | null
  timezone?: string | null
}

type IpInfoResponse = {
  loc?: string | null
  country?: string | null
  region?: string | null
  city?: string | null
  timezone?: string | null
}

const DUBAI_FALLBACK: NetworkLocation = {
  source: 'default',
  latitude: 25.204849,
  longitude: 55.270783,
  country: 'AE',
  region: null,
  city: 'Dubai',
  timezone: 'Asia/Dubai',
}

function parseCoordinate(value: string | null, min: number, max: number) {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  if (parsed < min || parsed > max) return null
  return parsed
}

function parseUnknownCoordinate(value: unknown, min: number, max: number) {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  if (parsed < min || parsed > max) return null
  return parsed
}

async function fetchVpnNetworkLocation(): Promise<NetworkLocation | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const providers: Array<() => Promise<NetworkLocation | null>> = [
      async () => {
        const res = await fetch('https://ipwho.is/', {
          method: 'GET',
          cache: 'no-store',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        })
        if (!res.ok) return null
        const body = (await res.json()) as IpWhoIsResponse
        if (body.success === false) return null
        const latitude = parseUnknownCoordinate(body.latitude, -90, 90)
        const longitude = parseUnknownCoordinate(body.longitude, -180, 180)
        if (latitude === null || longitude === null) return null
        return {
          source: 'network',
          latitude,
          longitude,
          country: body.country_code ?? null,
          region: body.region ?? null,
          city: body.city ?? null,
          timezone: body.timezone ?? 'UTC',
        }
      },
      async () => {
        const res = await fetch('https://ipinfo.io/json', {
          method: 'GET',
          cache: 'no-store',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        })
        if (!res.ok) return null
        const body = (await res.json()) as IpInfoResponse
        const [latString, lngString] = (body.loc ?? '').split(',')
        const latitude = parseUnknownCoordinate(latString, -90, 90)
        const longitude = parseUnknownCoordinate(lngString, -180, 180)
        if (latitude === null || longitude === null) return null
        return {
          source: 'network',
          latitude,
          longitude,
          country: body.country ?? null,
          region: body.region ?? null,
          city: body.city ?? null,
          timezone: body.timezone ?? 'UTC',
        }
      },
      async () => {
        const res = await fetch('https://ipapi.co/json/', {
          method: 'GET',
          cache: 'no-store',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        })
        if (!res.ok) return null
        const body = (await res.json()) as IpApiFallbackResponse
        const latitude = parseUnknownCoordinate(body.latitude, -90, 90)
        const longitude = parseUnknownCoordinate(body.longitude, -180, 180)
        if (latitude === null || longitude === null) return null
        return {
          source: 'network',
          latitude,
          longitude,
          country: body.country_code ?? null,
          region: body.region ?? null,
          city: body.city ?? null,
          timezone: body.timezone ?? 'UTC',
        }
      },
    ]

    for (const provider of providers) {
      const location = await provider()
      if (location) return location
    }

    return null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(req: Request) {
  const latitude = parseCoordinate(req.headers.get('x-vercel-ip-latitude'), -90, 90)
  const longitude = parseCoordinate(req.headers.get('x-vercel-ip-longitude'), -180, 180)

  if (latitude !== null && longitude !== null) {
    return okJson({
      location: {
        source: 'network',
        latitude,
        longitude,
        country: req.headers.get('x-vercel-ip-country') ?? null,
        region: req.headers.get('x-vercel-ip-country-region') ?? null,
        city: req.headers.get('x-vercel-ip-city') ?? null,
        timezone: req.headers.get('x-vercel-ip-timezone') ?? 'UTC',
      } satisfies NetworkLocation,
    })
  }

  const vpnLocation = await fetchVpnNetworkLocation()
  if (vpnLocation) {
    return okJson({
      location: vpnLocation,
    })
  }

  return okJson({
    location: DUBAI_FALLBACK,
  })
}

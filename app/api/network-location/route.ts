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

export async function GET(req: Request) {
  const latitude = parseCoordinate(req.headers.get('x-vercel-ip-latitude'), -90, 90)
  const longitude = parseCoordinate(req.headers.get('x-vercel-ip-longitude'), -180, 180)

  if (latitude === null || longitude === null) {
    return okJson({
      location: DUBAI_FALLBACK,
    })
  }

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

import { okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { getClientIp } from '@/lib/security/rate-limit'

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

type IpifyResponse = {
  ip?: string | null
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

const NETWORK_LOCATION_LOOKUP_TIMEOUT_MS = 2_500
const NETWORK_LOCATION_CACHE_TTL_MS = 5 * 60 * 1_000

const globalForNetworkLocation = globalThis as typeof globalThis & {
  __aljamaNetworkLocationCache?: Map<string, { location: NetworkLocation; expiresAt: number }>
  __aljamaNetworkLocationInflight?: Map<string, Promise<NetworkLocation | null>>
}

const networkLocationCache =
  globalForNetworkLocation.__aljamaNetworkLocationCache ??
  new Map<string, { location: NetworkLocation; expiresAt: number }>()

if (!globalForNetworkLocation.__aljamaNetworkLocationCache) {
  globalForNetworkLocation.__aljamaNetworkLocationCache = networkLocationCache
}

const networkLocationInflight =
  globalForNetworkLocation.__aljamaNetworkLocationInflight ?? new Map<string, Promise<NetworkLocation | null>>()

if (!globalForNetworkLocation.__aljamaNetworkLocationInflight) {
  globalForNetworkLocation.__aljamaNetworkLocationInflight = networkLocationInflight
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

function parseIpv4(value: string | null | undefined) {
  if (!value) return null
  const trimmed = value.trim()
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(trimmed)) return null
  const octets = trimmed.split('.').map(Number)
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null
  return trimmed
}

async function fetchPublicIpv4(signal: AbortSignal): Promise<string | null> {
  const providers = [
    async () => {
      const res = await fetch('https://api.ipify.org?format=json', {
        method: 'GET',
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal,
      })
      if (!res.ok) return null
      const body = (await res.json()) as IpifyResponse
      return parseIpv4(body.ip)
    },
    async () => {
      const res = await fetch('https://ipv4.icanhazip.com', {
        method: 'GET',
        cache: 'no-store',
        signal,
      })
      if (!res.ok) return null
      const body = await res.text()
      return parseIpv4(body)
    },
  ]

  for (const provider of providers) {
    try {
      const ip = await provider()
      if (ip) return ip
    } catch {
      continue
    }
  }

  return null
}

function buildIpWhoIsProvider(ip?: string) {
  return async (signal: AbortSignal): Promise<NetworkLocation | null> => {
    const suffix = ip ? `/${ip}` : '/'
    const res = await fetch(`https://ipwho.is${suffix}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal,
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
  }
}

function buildIpInfoProvider(ip?: string) {
  return async (signal: AbortSignal): Promise<NetworkLocation | null> => {
    const suffix = ip ? `/${ip}/json` : '/json'
    const res = await fetch(`https://ipinfo.io${suffix}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal,
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
  }
}

function buildIpApiProvider(ip?: string) {
  return async (signal: AbortSignal): Promise<NetworkLocation | null> => {
    const suffix = ip ? `/${ip}/json/` : '/json/'
    const res = await fetch(`https://ipapi.co${suffix}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal,
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
  }
}

async function resolveNetworkLocation(
  providers: Array<(signal: AbortSignal) => Promise<NetworkLocation | null>>,
  timeoutMs = NETWORK_LOCATION_LOOKUP_TIMEOUT_MS,
): Promise<NetworkLocation | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const attempts = providers.map(async (provider) => {
      const location = await provider(controller.signal)
      if (!location) {
        throw new Error('network_location_provider_empty')
      }
      return location
    })

    return await Promise.any(attempts)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
    controller.abort()
  }
}

function readCachedNetworkLocation(cacheKey: string): NetworkLocation | null {
  const cached = networkLocationCache.get(cacheKey)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    networkLocationCache.delete(cacheKey)
    return null
  }
  return cached.location
}

function writeCachedNetworkLocation(cacheKey: string, location: NetworkLocation) {
  networkLocationCache.set(cacheKey, {
    location,
    expiresAt: Date.now() + NETWORK_LOCATION_CACHE_TTL_MS,
  })
}

async function fetchVpnNetworkLocation(ip: string | null): Promise<NetworkLocation | null> {
  const directIp = parseIpv4(ip)
  if (directIp) {
    const directLocation = await resolveNetworkLocation([
      buildIpWhoIsProvider(directIp),
      buildIpInfoProvider(directIp),
      buildIpApiProvider(directIp),
    ])
    if (directLocation) return directLocation
  }

  const publicIpController = new AbortController()
  const publicIpTimeout = setTimeout(() => publicIpController.abort(), 1_200)

  try {
    const publicIpv4 = await fetchPublicIpv4(publicIpController.signal)
    if (publicIpv4) {
      const publicLocation = await resolveNetworkLocation([
        buildIpWhoIsProvider(publicIpv4),
        buildIpInfoProvider(publicIpv4),
        buildIpApiProvider(publicIpv4),
      ])
      if (publicLocation) return publicLocation
    }
  } catch {
    // fall through to implicit provider resolution
  } finally {
    clearTimeout(publicIpTimeout)
  }

  return await resolveNetworkLocation([
    buildIpWhoIsProvider(),
    buildIpInfoProvider(),
    buildIpApiProvider(),
  ])
}

async function getNetworkLocation(req: Request) {
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

  const clientIp = parseIpv4(getClientIp(req))
  const cacheKey = clientIp ? `ip:${clientIp}` : 'public'
  const cachedLocation = readCachedNetworkLocation(cacheKey)
  if (cachedLocation) {
    return okJson({
      location: cachedLocation,
    })
  }

  let inflightLookup = networkLocationInflight.get(cacheKey)
  if (!inflightLookup) {
    inflightLookup = fetchVpnNetworkLocation(clientIp).finally(() => {
      networkLocationInflight.delete(cacheKey)
    })
    networkLocationInflight.set(cacheKey, inflightLookup)
  }

  const vpnLocation = await inflightLookup
  if (vpnLocation) {
    writeCachedNetworkLocation(cacheKey, vpnLocation)
    return okJson({
      location: vpnLocation,
    })
  }

  return okJson({
    location: DUBAI_FALLBACK,
  })
}

export const GET = withApiRoute({ scope: 'api:network-location', timeoutMs: 6_000 }, getNetworkLocation)

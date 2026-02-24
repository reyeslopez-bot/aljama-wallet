import crypto from 'node:crypto'
import { getClientIp } from '@/lib/security/rate-limit'

export type RequestSignalContext = {
  ip: string | null
  ipHash: string | null
  country: string | null
  region: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  timezone: string | null
  userAgent: string | null
  origin: string | null
  referer: string | null
}

function parseHeaderNumber(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null
  return crypto.createHash('sha256').update(ip).digest('hex')
}

export function extractRequestSignalContext(req: Request): RequestSignalContext {
  const ip = getClientIp(req)
  return {
    ip,
    ipHash: hashIp(ip),
    country: req.headers.get('x-vercel-ip-country') ?? null,
    region: req.headers.get('x-vercel-ip-country-region') ?? null,
    city: req.headers.get('x-vercel-ip-city') ?? null,
    latitude: parseHeaderNumber(req.headers.get('x-vercel-ip-latitude')),
    longitude: parseHeaderNumber(req.headers.get('x-vercel-ip-longitude')),
    timezone: req.headers.get('x-vercel-ip-timezone') ?? null,
    userAgent: req.headers.get('user-agent'),
    origin: req.headers.get('origin'),
    referer: req.headers.get('referer'),
  }
}

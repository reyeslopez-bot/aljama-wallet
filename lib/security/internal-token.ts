import crypto from 'node:crypto'

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function extractToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('x-internal-token')
  if (!header) return null
  if (header.startsWith('Bearer ')) return header.slice(7).trim()
  return header.trim()
}

function normalizeIp(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('[') && trimmed.includes(']')) {
    return trimmed.slice(1, trimmed.indexOf(']'))
  }

  const ipv4PortMatch = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
  if (ipv4PortMatch?.[1]) return ipv4PortMatch[1]

  return trimmed
}

function extractClientIp(req: Request): string | null {
  const cfIp = req.headers.get('cf-connecting-ip')
  if (cfIp) {
    const normalized = normalizeIp(cfIp)
    if (normalized) return normalized
  }

  const realIp = req.headers.get('x-real-ip')
  if (realIp) {
    const normalized = normalizeIp(realIp)
    if (normalized) return normalized
  }

  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]
    if (first) {
      const normalized = normalizeIp(first)
      if (normalized) return normalized
    }
  }

  return null
}

function getAllowedInternalIps(): Set<string> {
  const raw = process.env.SECURITY_INTERNAL_ALLOWED_IPS?.trim()
  if (!raw) return new Set()

  const ips = new Set<string>()
  for (const entry of raw.split(',')) {
    const normalized = normalizeIp(entry)
    if (normalized) ips.add(normalized)
  }
  return ips
}

export function hasValidInternalToken(req: Request, expected?: string | null): boolean {
  if (!expected) return false
  const token = extractToken(req)
  if (!token) return false
  if (!safeEqual(token, expected)) return false

  const allowedIps = getAllowedInternalIps()
  if (allowedIps.size === 0) return true

  const clientIp = extractClientIp(req)
  if (!clientIp) return false
  return allowedIps.has(clientIp)
}

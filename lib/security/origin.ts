import { isStrictMode } from './runtime'

function normalizeOrigin(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return new URL(trimmed).origin
    }
    // Allow hostnames without scheme in env
    return new URL(`https://${trimmed}`).origin
  } catch {
    return null
  }
}

export function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>()

  const fromEnv = process.env.SECURITY_ALLOWED_ORIGINS
  if (fromEnv) {
    for (const entry of fromEnv.split(',')) {
      const normalized = normalizeOrigin(entry)
      if (normalized) origins.add(normalized)
    }
  }

  const nextAuthUrl = normalizeOrigin(process.env.NEXTAUTH_URL ?? '')
  if (nextAuthUrl) origins.add(nextAuthUrl)

  const publicSiteUrl = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL ?? '')
  if (publicSiteUrl) origins.add(publicSiteUrl)

  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) {
    const normalized = normalizeOrigin(`https://${vercelUrl}`)
    if (normalized) origins.add(normalized)
  }

  return origins
}

export function isAllowedOrigin(req: Request, allowedOrigins: Set<string> = getAllowedOrigins()): boolean {
  const originHeader = req.headers.get('origin')
  const refererHeader = req.headers.get('referer')

  if (originHeader) {
    const normalized = normalizeOrigin(originHeader)
    if (!normalized) return false
    if (allowedOrigins.size === 0) return !isStrictMode
    return allowedOrigins.has(normalized)
  }

  if (refererHeader) {
    const normalized = normalizeOrigin(refererHeader)
    if (!normalized) return false
    if (allowedOrigins.size === 0) return !isStrictMode
    return allowedOrigins.has(normalized)
  }

  return !isStrictMode
}

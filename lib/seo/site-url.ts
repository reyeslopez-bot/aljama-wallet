function normalizeSiteUrl(value: string | null | undefined): URL | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return new URL(trimmed)
    }
    return new URL(`https://${trimmed}`)
  } catch {
    return null
  }
}

export function getSiteUrl(): URL {
  const fromPublicSite = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)
  if (fromPublicSite) return fromPublicSite

  const fromPublicApp = normalizeSiteUrl(process.env.NEXT_PUBLIC_APP_URL)
  if (fromPublicApp) return fromPublicApp

  const fromNextAuth = normalizeSiteUrl(process.env.NEXTAUTH_URL)
  if (fromNextAuth) return fromNextAuth

  const fromVercel = process.env.VERCEL_URL ? normalizeSiteUrl(`https://${process.env.VERCEL_URL}`) : null
  if (fromVercel) return fromVercel

  return new URL('http://localhost:3000')
}

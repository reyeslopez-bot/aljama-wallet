export function resolveConsentReturnPath(
  locale: string,
  nextPath: string | null | undefined,
): string {
  const fallbackPath = `/${locale}`
  if (!nextPath) return fallbackPath
  if (!nextPath.startsWith('/')) return fallbackPath
  if (nextPath.startsWith('//')) return fallbackPath

  try {
    const url = new URL(nextPath, 'https://aljama.local')
    const segments = url.pathname.split('/')
    if (segments.length === 3 && segments[2] === 'consent') {
      return fallbackPath
    }

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallbackPath
  }
}

export function buildConsentHref(locale: string, nextPath: string): string {
  const params = new URLSearchParams({
    next: resolveConsentReturnPath(locale, nextPath),
  })

  return `/${locale}/consent?${params.toString()}`
}

import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'he', 'ar'],
  defaultLocale: 'en',
  localePrefix: 'always',
})

export const locales = routing.locales
export const defaultLocale = routing.defaultLocale

export function isRtlLocale(locale: string): boolean {
  return locale === 'ar' || locale === 'he'
}

export function replacePathLocale(path: string, locale: string): string {
  try {
    const url = new URL(path, 'https://aljama.local')
    const segments = url.pathname.split('/')

    if (segments.length > 1 && locales.includes(segments[1] as (typeof locales)[number])) {
      segments[1] = locale
    } else {
      segments.splice(1, 0, locale)
    }

    url.pathname = segments.join('/') || `/${locale}`
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return `/${locale}`
  }
}

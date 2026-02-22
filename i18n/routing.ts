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

import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'he', 'ar'],
  defaultLocale: 'en',
  localePrefix: 'always',
})

export type Locale = (typeof routing.locales)[number]

export const locales = routing.locales
export const defaultLocale = routing.defaultLocale

export function isRtlLocale(locale: string): boolean {
  return locale === 'ar' || locale === 'he'
}

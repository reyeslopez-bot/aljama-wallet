import { describe, expect, it } from 'vitest'
import { replacePathLocale } from '@/i18n/routing'

describe('replacePathLocale', () => {
  it('changes the locale while preserving the route, query, and hash', () => {
    expect(replacePathLocale('/en/wallet?tab=activity#history', 'ar')).toBe(
      '/ar/wallet?tab=activity#history',
    )
  })

  it('adds a locale to a path without a locale prefix', () => {
    expect(replacePathLocale('/wallet?tab=activity', 'he')).toBe('/he/wallet?tab=activity')
  })
})

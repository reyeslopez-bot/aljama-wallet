import type { MetadataRoute } from 'next'
import { locales } from '@/i18n/routing'
import { getSiteUrl } from '@/lib/seo/site-url'

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl()
  const lastModified = new Date()

  return [
    {
      url: new URL('/', siteUrl).toString(),
      lastModified,
      changeFrequency: 'daily',
      priority: 1,
    },
    ...locales.map((locale) => ({
      url: new URL(`/${locale}`, siteUrl).toString(),
      lastModified,
      changeFrequency: 'daily' as const,
      priority: 0.9,
    })),
    ...locales.map((locale) => ({
      url: new URL(`/${locale}/compliance`, siteUrl).toString(),
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...locales.map((locale) => ({
      url: new URL(`/${locale}/login`, siteUrl).toString(),
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    })),
  ]
}

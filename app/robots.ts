import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/seo/site-url'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()
  const isProduction = process.env.NODE_ENV === 'production'

  return {
    rules: isProduction
      ? {
          userAgent: '*',
          allow: '/',
        }
      : {
          userAgent: '*',
          disallow: '/',
        },
    sitemap: new URL('/sitemap.xml', siteUrl).toString(),
    host: siteUrl.origin,
  }
}

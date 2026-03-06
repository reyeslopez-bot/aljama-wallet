// app/[locale]/(site)/page.tsx
import type { Metadata } from 'next'
import HomeContent from '@/components/home/HomeContent'
import { getTranslations } from 'next-intl/server'
import { BRAND } from '@/constants/brand'
import { locales } from '@/i18n/routing'
import { getSiteUrl } from '@/lib/seo/site-url'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const tHome = await getTranslations({ locale, namespace: 'home.hero' })
  const siteUrl = getSiteUrl()
  const canonicalPath = `/${locale}`
  const canonicalUrl = new URL(canonicalPath, siteUrl).toString()

  return {
    metadataBase: siteUrl,
    title: BRAND.name,
    description: tHome('subtitle'),
    alternates: {
      canonical: canonicalPath,
      languages: Object.fromEntries(locales.map((availableLocale) => [availableLocale, `/${availableLocale}`])),
    },
    openGraph: {
      type: 'website',
      url: canonicalUrl,
      siteName: BRAND.name,
      locale,
      title: BRAND.name,
      description: tHome('subtitle'),
    },
    twitter: {
      card: 'summary',
      title: BRAND.name,
      description: tHome('subtitle'),
    },
  }
}

export default function HomePage() {
  return (
    <main className="px-6">
      <HomeContent />
    </main>
  )
}

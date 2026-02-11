// components/ui/Header.tsx
'use client'

import Link from 'next/link'
import { BRAND } from '@/constants/brand'
import { useLocale, useTranslations } from 'next-intl'

export default function Header() {
  const t = useTranslations('navbar')
  const locale = useLocale()
  return (
    <header className="w-full border-b border-saffron/20 bg-black/60 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <h1 className="font-display text-2xl font-semibold tracking-[0.16em] text-ivory">
          {BRAND.name}
        </h1>

        <nav className="space-x-4">
          <Link href={`/${locale}`} className="text-sm uppercase tracking-[0.18em] text-ivory/70 transition hover:text-sand">{t('overview')}</Link>
          <Link href={`/${locale}/about`} className="text-sm uppercase tracking-[0.18em] text-ivory/70 transition hover:text-sand">{t('about')}</Link>
          <Link href={`/${locale}/contact`} className="text-sm uppercase tracking-[0.18em] text-ivory/70 transition hover:text-sand">{t('contact')}</Link>
        </nav>
      </div>
    </header>
  )
}

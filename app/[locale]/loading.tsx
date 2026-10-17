'use client'

import { useLocale, useTranslations } from 'next-intl'
import { isRtlLocale } from '@/i18n/routing'

export default function LocaleLoading() {
  const locale = useLocale()
  const t = useTranslations('home.interactive')

  return (
    <main
      data-testid="route-loading-screen"
      role="status"
      aria-busy="true"
      lang={locale}
      dir={isRtlLocale(locale) ? 'rtl' : 'ltr'}
      className="flex min-h-[60vh] items-center justify-center px-6 py-16"
    >
      <div className="surface-panel panel-glow-saffron flex max-w-lg items-start gap-4 rounded-[1.5rem] p-6 shadow-2xl shadow-black/30">
        <span
          aria-hidden="true"
          className="mt-1 h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-white/15 border-t-saffron"
        />
        <div>
          <h1 className="font-display text-lg font-semibold text-ivory">{t('title')}</h1>
          <p className="mt-2 text-sm leading-6 text-ivory/72">{t('body')}</p>
        </div>
      </div>
    </main>
  )
}

import { getTranslations } from 'next-intl/server'
import { defaultLocale, isRtlLocale, locales } from '@/i18n/routing'

export default async function LocaleLoading({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const supportedLocale = locales.find((availableLocale) => availableLocale === locale) ?? defaultLocale
  const t = await getTranslations({ locale: supportedLocale, namespace: 'home.interactive' })

  return (
    <main
      data-testid="route-loading-screen"
      role="status"
      aria-busy="true"
      lang={supportedLocale}
      dir={isRtlLocale(supportedLocale) ? 'rtl' : 'ltr'}
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

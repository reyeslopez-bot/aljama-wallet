'use client'

import { useEffect, useState } from 'react'
import { getTelemetryConsent, setTelemetryConsent, type TelemetryConsent } from '@/infra/telemetry/client'
import { useTranslations } from 'next-intl'

export default function ConsentBanner() {
  const t = useTranslations('consent')
  const [consent, setConsent] = useState<TelemetryConsent>('unset')

  useEffect(() => {
    setConsent(getTelemetryConsent())
  }, [])

  if (consent !== 'unset') return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 rounded-2xl border border-white/10 bg-black/80 px-4 py-3 text-xs text-white/80 shadow-2xl shadow-black/40 backdrop-blur-xl md:left-8 md:right-auto md:max-w-xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 text-sm text-white/70">
          {t('text')}
          </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTelemetryConsent('denied')
              setConsent('denied')
            }}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70 transition hover:bg-white/10"
          >
            {t('decline')}
          </button>
          <button
            type="button"
            onClick={() => {
              setTelemetryConsent('granted')
              setConsent('granted')
            }}
            className="rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
          >
            {t('accept')}
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { getTelemetryConsent, setTelemetryConsent, type TelemetryConsent } from '@/infra/telemetry/client'
import { getLocationConsent, setLocationConsent, type LocationConsent } from '@/infra/location/client'
import { useTranslations } from 'next-intl'

export default function ConsentBanner() {
  const t = useTranslations('consent')
  const [telemetryConsent, setTelemetry] = useState<TelemetryConsent>('unset')
  const [locationConsent, setLocation] = useState<LocationConsent>('unset')
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    setTelemetry(getTelemetryConsent())
    setLocation(getLocationConsent())
  }, [])

  if (telemetryConsent !== 'unset' && locationConsent !== 'unset') return null

  function rejectAll() {
    setTelemetryConsent('denied')
    setLocationConsent('denied')
    setTelemetry('denied')
    setLocation('denied')
  }

  function allowAll() {
    setTelemetryConsent('granted')
    setTelemetry('granted')
    setRequesting(true)

    if (!('geolocation' in navigator)) {
      setLocationConsent('denied')
      setLocation('denied')
      setRequesting(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationConsent('granted')
        setLocation('granted')
        setRequesting(false)
      },
      () => {
        setLocationConsent('denied')
        setLocation('denied')
        setRequesting(false)
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-black/85 p-5 text-xs text-white/80 shadow-2xl shadow-black/50 backdrop-blur-xl"
      >
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-saffron/70">{t('title')}</p>
          <div className="text-sm text-white/70">{t('text')}</div>
          <ul className="space-y-1 text-xs text-white/60">
            <li>{t('locationDetail')}</li>
            <li>{t('telemetryDetail')}</li>
          </ul>
          {requesting ? <p className="text-[11px] text-white/50">{t('requesting')}</p> : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={rejectAll}
            disabled={requesting}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('rejectAll')}
          </button>
          <button
            type="button"
            onClick={allowAll}
            disabled={requesting}
            className="rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('allowAll')}
          </button>
        </div>
      </div>
    </div>
  )
}

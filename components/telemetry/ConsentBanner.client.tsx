'use client'

import { useEffect, useState } from 'react'
import { getTelemetryConsent, setTelemetryConsent, type TelemetryConsent } from '@/infra/telemetry/client'
import { getLocationConsent, setLocationConsent, type LocationConsent } from '@/infra/location/client'
import { useTranslations } from 'next-intl'
import TextScramble from '@/components/ui/TextScramble.client'

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

  function essentialOnly() {
    // "Essential" keeps only required app functionality and disables optional location + telemetry.
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
        className="relative w-full max-w-3xl rounded-[2rem] border border-white/10 bg-black/85 p-7 text-white/80 shadow-2xl shadow-black/50 backdrop-blur-xl md:p-10"
      >
        <div className="space-y-5">
          <p className="text-sm uppercase tracking-[0.22em] text-saffron/70">{t('eyebrow')}</p>
          <TextScramble text={t('title')} ariaLabel={t('title')} className="font-display tracking-tight" />
          <div className="max-w-2xl text-lg text-white/75">{t('text')}</div>
          <ul className="space-y-2 text-base text-white/70">
            <li>{t('essentialDetail')}</li>
            <li>{t('locationDetail')}</li>
            <li>{t('telemetryDetail')}</li>
          </ul>
          {requesting ? <p className="text-sm text-white/55">{t('requesting')}</p> : null}
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={rejectAll}
            disabled={requesting}
            className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('rejectAll')}
          </button>
          <button
            type="button"
            onClick={essentialOnly}
            disabled={requesting}
            className="rounded-full border border-lapis/40 bg-lapis/20 px-5 py-2.5 text-sm font-semibold text-lapis transition hover:bg-lapis/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('essentialOnly')}
          </button>
          <button
            type="button"
            onClick={allowAll}
            disabled={requesting}
            className="rounded-full bg-emerald-500/90 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('allowAll')}
          </button>
        </div>
      </div>
    </div>
  )
}

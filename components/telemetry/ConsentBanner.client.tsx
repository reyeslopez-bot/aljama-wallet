'use client'

import { useEffect, useState } from 'react'
import { getTelemetryConsent, setTelemetryConsent } from '@/infra/telemetry/client'
import {
  canUseGeolocation,
  getLocationConsent,
  setLocationConsent,
} from '@/infra/location/client'
import { useTranslations } from 'next-intl'
import TextScramble from '@/components/ui/TextScramble.client'

const CONSENT_PROMPT_VERSION = '2026-02'
const CONSENT_PROMPT_KEY = 'aljama.consent.prompt.version'

export default function ConsentBanner() {
  const t = useTranslations('consent')
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    const nextTelemetry = getTelemetryConsent()
    const nextLocation = getLocationConsent()

    if (typeof window !== 'undefined') {
      const seenPromptVersion = window.localStorage.getItem(CONSENT_PROMPT_KEY)
      const shouldPrompt =
        seenPromptVersion !== CONSENT_PROMPT_VERSION ||
        nextTelemetry === 'unset' ||
        nextLocation === 'unset'
      setOpen(shouldPrompt)
    }
    setReady(true)
  }, [])

  if (!ready || !open) return null

  function closePrompt() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CONSENT_PROMPT_KEY, CONSENT_PROMPT_VERSION)
    }
    setOpen(false)
  }

  function rejectAll() {
    setTelemetryConsent('denied')
    setLocationConsent('denied')
    closePrompt()
  }

  function essentialOnly() {
    // "Essential" keeps only required app functionality and disables optional location + telemetry.
    setTelemetryConsent('denied')
    setLocationConsent('denied')
    closePrompt()
  }

  function allowAll() {
    setTelemetryConsent('granted')
    setRequesting(true)

    if (!canUseGeolocation() || !('geolocation' in navigator)) {
      setLocationConsent('denied')
      setRequesting(false)
      closePrompt()
      return
    }

    try {
      navigator.geolocation.getCurrentPosition(
        () => {
          setLocationConsent('granted')
          setRequesting(false)
          closePrompt()
        },
        () => {
          setLocationConsent('denied')
          setRequesting(false)
          closePrompt()
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
      )
    } catch {
      setLocationConsent('denied')
      setRequesting(false)
      closePrompt()
    }
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
          <TextScramble
            text={t('title')}
            ariaLabel={t('title')}
            className="font-display tracking-tight"
            color="rgb(240, 215, 160)"
            fontWeight={600}
          />
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
            className="rounded-full border border-white/25 bg-white/15 px-5 py-2.5 text-sm font-semibold text-ivory transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('rejectAll')}
          </button>
          <button
            type="button"
            onClick={essentialOnly}
            disabled={requesting}
            className="rounded-full border border-[#7fa3c1]/70 bg-gradient-to-r from-[#8fbfe3]/80 via-[#6e9fc5]/80 to-[#5a8d88]/80 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#5c8db4]/30 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
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

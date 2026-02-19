'use client'

import { useEffect, useState } from 'react'
import { getTelemetryConsent, setTelemetryConsent } from '@/infra/telemetry/client'
import {
  canUseGeolocation,
  getLocationConsent,
  setLocationConsent,
} from '@/infra/location/client'
import { CONSENT_PROMPT_SESSION_KEY } from '@/infra/consent/constants'
import { useTranslations } from 'next-intl'
import TextScramble from '@/components/ui/TextScramble.client'
import { useSession } from 'next-auth/react'

type ConsentDialogHeaderProps = {
  eyebrow: string
  title: string
  body: string
}

function ConsentDialogHeader({ eyebrow, title, body }: ConsentDialogHeaderProps) {
  return (
    <header data-testid="consent-dialog-header" className="space-y-4">
      <p className="text-sm uppercase tracking-[0.22em] text-saffron/70">{eyebrow}</p>
      <TextScramble
        text={title}
        ariaLabel={title}
        className="font-display text-ivory tracking-tight"
        fontWeight={600}
      />
      <p className="max-w-2xl text-base leading-relaxed text-ivory/88 md:text-lg">{body}</p>
    </header>
  )
}

type ConsentPermissionListProps = {
  essentialDetail: string
  locationDetail: string
  telemetryDetail: string
}

function ConsentPermissionList({
  essentialDetail,
  locationDetail,
  telemetryDetail,
}: ConsentPermissionListProps) {
  return (
    <ul
      data-testid="consent-dialog-permissions"
      className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-ivory/80 marker:text-saffron md:text-base"
    >
      <li>{essentialDetail}</li>
      <li>{locationDetail}</li>
      <li>{telemetryDetail}</li>
    </ul>
  )
}

type ConsentDialogActionsProps = {
  requesting: boolean
  rejectAllLabel: string
  essentialOnlyLabel: string
  allowAllLabel: string
  onRejectAll: () => void
  onEssentialOnly: () => void
  onAllowAll: () => void
}

function ConsentDialogActions({
  requesting,
  rejectAllLabel,
  essentialOnlyLabel,
  allowAllLabel,
  onRejectAll,
  onEssentialOnly,
  onAllowAll,
}: ConsentDialogActionsProps) {
  return (
    <div data-testid="consent-dialog-actions" className="mt-7 flex flex-wrap items-center justify-end gap-3">
      <button
        type="button"
        onClick={onRejectAll}
        disabled={requesting}
        className="rounded-full border border-[#6e7b90]/65 bg-gradient-to-r from-[#7d8aa0]/85 via-[#5e6b82]/85 to-[#465267]/85 px-5 py-2.5 text-sm font-semibold text-ivory shadow-lg shadow-[#425065]/30 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {rejectAllLabel}
      </button>
      <button
        type="button"
        onClick={onEssentialOnly}
        disabled={requesting}
        className="rounded-full border border-[#7fa3c1]/70 bg-gradient-to-r from-[#8fbfe3]/85 via-[#6e9fc5]/85 to-[#5a8d88]/85 px-5 py-2.5 text-sm font-semibold text-ivory shadow-lg shadow-[#5c8db4]/30 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {essentialOnlyLabel}
      </button>
      <button
        type="button"
        onClick={onAllowAll}
        disabled={requesting}
        className="rounded-full border border-emerald-300/55 bg-gradient-to-r from-emerald-400/90 via-emerald-500/88 to-teal-500/88 px-6 py-2.5 text-sm font-semibold text-ivory shadow-lg shadow-emerald-500/30 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {allowAllLabel}
      </button>
    </div>
  )
}

export default function ConsentBanner() {
  const t = useTranslations('consent')
  const { status: sessionStatus } = useSession()
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [isLoginRoute, setIsLoginRoute] = useState(false)

  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (typeof window !== 'undefined') {
      if (sessionStatus !== 'authenticated') {
        setOpen(false)
        setReady(true)
        return
      }
      setIsLoginRoute(/^\/(?:[^/]+\/)?login\/?$/.test(window.location.pathname))
      const seenPromptInSession = window.sessionStorage.getItem(CONSENT_PROMPT_SESSION_KEY)
      const nextTelemetry = getTelemetryConsent()
      const nextLocation = getLocationConsent()
      const shouldPrompt =
        seenPromptInSession !== 'seen' ||
        nextTelemetry === 'unset' ||
        nextLocation === 'unset'
      setOpen(shouldPrompt)
    }
    setReady(true)
  }, [sessionStatus])

  if (!ready || !open || isLoginRoute) return null

  function closePrompt() {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(CONSENT_PROMPT_SESSION_KEY, 'seen')
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
        className="relative w-full max-w-3xl rounded-[2rem] border border-white/10 bg-black/85 p-7 text-ivory/80 shadow-2xl shadow-black/50 backdrop-blur-xl md:p-10"
      >
        <div className="space-y-5">
          <ConsentDialogHeader eyebrow={t('eyebrow')} title={t('title')} body={t('text')} />
          <ConsentPermissionList
            essentialDetail={t('essentialDetail')}
            locationDetail={t('locationDetail')}
            telemetryDetail={t('telemetryDetail')}
          />
          {requesting ? <p className="text-sm text-saffron/80">{t('requesting')}</p> : null}
        </div>
        <ConsentDialogActions
          requesting={requesting}
          rejectAllLabel={t('rejectAll')}
          essentialOnlyLabel={t('essentialOnly')}
          allowAllLabel={t('allowAll')}
          onRejectAll={rejectAll}
          onEssentialOnly={essentialOnly}
          onAllowAll={allowAll}
        />
      </div>
    </div>
  )
}

'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import LoginGate from '@/components/home/LoginGate'
import ConsentEntryGate from '@/components/home/ConsentEntryGate.client'
import {
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from '@/infra/consent/constants'
import {
  getTelemetryConsent,
  onTelemetryConsentChange,
} from '@/infra/telemetry/client'
import {
  getLocationConsent,
  onLocationConsentChange,
} from '@/infra/location/client'

export type AppStage = 'locked' | 'consent-required' | 'wallet-ready'

type HomeStageShellProps = {
  children: ReactNode
}

function hasSeenConsentSession() {
  if (typeof window === 'undefined') return false
  return (
    window.sessionStorage.getItem(CONSENT_PROMPT_SESSION_KEY) === 'seen' &&
    window.sessionStorage.getItem(CONSENT_SITE_ENTRY_SESSION_KEY) === 'seen'
  )
}

function hasAnsweredConsent() {
  const telemetryConsent = getTelemetryConsent()
  const locationConsent = getLocationConsent()
  return telemetryConsent !== 'unset' && locationConsent !== 'unset' && hasSeenConsentSession()
}

export default function HomeStageShell({ children }: HomeStageShellProps) {
  const { status } = useSession()
  const [answeredConsent, setAnsweredConsent] = useState(false)

  useEffect(() => {
    const sync = () => setAnsweredConsent(hasAnsweredConsent())

    sync()
    const unsubscribeTelemetry = onTelemetryConsentChange(sync)
    const unsubscribeLocation = onLocationConsentChange(sync)
    window.addEventListener('focus', sync)
    window.addEventListener('storage', sync)

    return () => {
      unsubscribeTelemetry()
      unsubscribeLocation()
      window.removeEventListener('focus', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const stage = useMemo<AppStage>(() => {
    if (status !== 'authenticated') return 'locked'
    if (!answeredConsent) return 'consent-required'
    return 'wallet-ready'
  }, [answeredConsent, status])

  return (
    <>
      <section data-testid="home-stage-progress" className="surface-soft sticky top-4 z-40 mb-6 flex items-center gap-2 rounded-full px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-ivory/70">
        <span className={stage === 'locked' ? 'text-saffron' : ''}>Secure</span>
        <span>→</span>
        <span className={stage === 'consent-required' ? 'text-saffron' : ''}>Consent</span>
        <span>→</span>
        <span className={stage === 'wallet-ready' ? 'text-saffron' : ''}>Wallet</span>
      </section>

      {stage === 'locked' ? <LoginGate showBackLink={false} showCloseButton={false} /> : null}
      {stage === 'consent-required' ? <ConsentEntryGate /> : null}

      <div
        data-testid="home-stage-workspace"
        data-stage={stage}
        className={stage === 'wallet-ready' ? '' : 'pointer-events-none opacity-60'}
      >
        {children}
      </div>
    </>
  )
}

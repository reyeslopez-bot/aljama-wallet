'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import ConsentEntryGate from '@/components/home/ConsentEntryGate.client'
import {
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from '@/infra/consent/constants'
import {
  getTelemetryConsent,
  onTelemetryConsentChange,
} from '@/infra/telemetry/client'
import { getLocationConsent, onLocationConsentChange } from '@/infra/location/client'

type HomeConsentGateProps = {
  children: ReactNode
}

export default function HomeConsentGate({ children }: HomeConsentGateProps) {
  const [hasAnsweredPermissions, setHasAnsweredPermissions] = useState(false)

  useEffect(() => {
    const hasSeenPromptThisSession = () => {
      if (typeof window === 'undefined') return false
      return window.sessionStorage.getItem(CONSENT_PROMPT_SESSION_KEY) === 'seen'
    }
    const hasEnteredSiteThisSession = () => {
      if (typeof window === 'undefined') return false
      return window.sessionStorage.getItem(CONSENT_SITE_ENTRY_SESSION_KEY) === 'seen'
    }

    const sync = () => {
      const telemetryConsent = getTelemetryConsent()
      const locationConsent = getLocationConsent()
      const answered =
        telemetryConsent !== 'unset' &&
        locationConsent !== 'unset' &&
        hasSeenPromptThisSession() &&
        hasEnteredSiteThisSession()
      setHasAnsweredPermissions(answered)
    }

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

  if (!hasAnsweredPermissions) {
    return <ConsentEntryGate />
  }

  return <>{children}</>
}

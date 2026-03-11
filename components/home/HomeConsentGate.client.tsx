'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useLocale } from 'next-intl'
import {
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from '@/infra/consent/constants'
import { buildConsentHref } from '@/infra/consent/routing'
import {
  getTelemetryConsent,
  onTelemetryConsentChange,
} from '@/infra/telemetry/client'
import { getLocationConsent, onLocationConsentChange } from '@/infra/location/client'

type HomeConsentGateProps = {
  children: ReactNode
}

export default function HomeConsentGate({ children }: HomeConsentGateProps) {
  const locale = useLocale()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [hasAnsweredPermissions, setHasAnsweredPermissions] = useState(false)
  const [isCheckingConsent, setIsCheckingConsent] = useState(true)

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
      setIsCheckingConsent(false)

      if (!answered) {
        const search = searchParams.toString()
        const nextPath = search ? `${pathname}?${search}` : pathname
        router.replace(buildConsentHref(locale, nextPath))
      }
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
  }, [locale, pathname, router, searchParams])

  if (isCheckingConsent) {
    return <>{children}</>
  }

  if (!hasAnsweredPermissions) {
    return null
  }

  return <>{children}</>
}

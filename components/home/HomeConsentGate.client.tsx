'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { getTelemetryConsent, hasRecognizedDevice } from '@/infra/telemetry/client'
import { getLocationConsent } from '@/infra/location/client'

type HomeConsentGateProps = {
  children: ReactNode
}

export default function HomeConsentGate({ children }: HomeConsentGateProps) {
  const locale = useLocale()
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const telemetryConsent = getTelemetryConsent()
    const locationConsent = getLocationConsent()
    const hasAnsweredPermissions =
      telemetryConsent !== 'unset' && locationConsent !== 'unset'

    if (!hasAnsweredPermissions) {
      const loginRoute = hasRecognizedDevice()
        ? `/${locale}/login?mode=login`
        : `/${locale}/login?mode=register`
      router.replace(loginRoute)
      return
    }

    setReady(true)
  }, [locale, router])

  if (!ready) return null

  return <>{children}</>
}

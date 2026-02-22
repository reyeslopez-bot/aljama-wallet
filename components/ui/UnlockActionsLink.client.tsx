'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { hasRecognizedDevice, onTelemetryConsentChange } from '@/infra/telemetry/client'

type UnlockActionsLinkProps = {
  className?: string
  mode?: 'auto' | 'signin' | 'signup'
  label?: string
}

export default function UnlockActionsLink({
  className = '',
  mode = 'auto',
  label,
}: UnlockActionsLinkProps) {
  const tAuth = useTranslations('auth')
  const locale = useLocale()
  const [recognized, setRecognized] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const sync = () => setRecognized(hasRecognizedDevice())
    sync()

    const unsubscribe = onTelemetryConsentChange(sync)
    window.addEventListener('storage', sync)
    window.addEventListener('focus', sync)
    return () => {
      unsubscribe()
      window.removeEventListener('storage', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  const resolvedMode = useMemo(() => {
    if (mode !== 'auto') return mode
    return recognized ? 'signin' : 'signup'
  }, [mode, recognized])

  const ctaLabel = label ?? (
    resolvedMode === 'signup' ? tAuth('unlockActionsSignUp') : tAuth('unlockActions')
  )
  const query = resolvedMode === 'signup' ? '?mode=register' : '?mode=login'

  return (
    <Link
      href={`/${locale}/login${query}`}
      className={`${className} cursor-pointer transition hover:text-saffron focus:outline-none focus:ring-2 focus:ring-saffron/40`}
    >
      {ctaLabel}
    </Link>
  )
}

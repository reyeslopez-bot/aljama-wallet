'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { hasRecognizedDevice, onTelemetryConsentChange } from '@/infra/telemetry/client'

type UnlockActionsLinkProps = {
  className?: string
  mode?: 'auto' | 'signin' | 'signup'
  label?: string
  variant?: 'text' | 'button'
}

export default function UnlockActionsLink({
  className = '',
  mode = 'auto',
  label,
  variant = 'text',
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

  const ctaLabel =
    label ??
    (variant === 'button'
      ? resolvedMode === 'signup'
        ? tAuth('unlockActionsSignUpButton')
        : tAuth('unlockActionsSignInButton')
      : resolvedMode === 'signup'
        ? tAuth('unlockActionsSignUp')
        : tAuth('unlockActions'))
  const query = resolvedMode === 'signup' ? '?mode=register#secure-gate' : '?mode=login#secure-gate'
  const baseClassName =
    variant === 'button'
      ? 'inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold transition hover:border-saffron/35 hover:bg-saffron/10 hover:text-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron/35'
      : 'transition hover:text-saffron focus:outline-none focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-saffron/40'

  return (
    <Link
      href={`/${locale}/login${query}`}
      className={`${baseClassName} ${className}`.trim()}
    >
      {ctaLabel}
    </Link>
  )
}

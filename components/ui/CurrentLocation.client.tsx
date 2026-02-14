// components/ui/CurrentLocation.client.tsx
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { canUseGeolocation } from '@/infra/location/client'
import { formatTime24 } from '@/lib/time-format'

type GeoState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; lat: number; lng: number; accuracy?: number; timestamp: number }
  | { status: 'error'; message: string }

function format(n: number) {
  return n.toFixed(6)
}

export default function CurrentLocation() {
  const t = useTranslations('location')
  const tAuth = useTranslations('auth')
  const { status: sessionStatus } = useSession()
  const locked = sessionStatus === 'unauthenticated'
  const [state, setState] = React.useState<GeoState>({ status: 'idle' })

  const request = React.useCallback(() => {
    if (locked) return
    if (!canUseGeolocation() || !('geolocation' in navigator)) {
      setState({ status: 'error', message: 'Geolocation is blocked by browser policy or not supported.' })
      return
    }

    setState({ status: 'loading' })

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setState({
            status: 'ready',
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          })
        },
        (err) => {
          // Common cases:
          // 1 PERMISSION_DENIED
          // 2 POSITION_UNAVAILABLE
          // 3 TIMEOUT
          const msg =
            err.code === 1
              ? 'Permission denied. Allow location for this site in browser settings.'
              : err.code === 2
                ? 'Position unavailable.'
                : err.code === 3
                  ? 'Location request timed out.'
                  : err.message

          setState({ status: 'error', message: msg })
        },
        {
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 15_000,
        },
      )
    } catch {
      setState({ status: 'error', message: 'Geolocation is blocked by browser policy or not supported.' })
    }
  }, [locked])

  const copy = React.useCallback(async () => {
    if (locked) return
    if (state.status !== 'ready') return
    const text = `${format(state.lat)}, ${format(state.lng)}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // ignore (clipboard can be blocked)
    }
  }, [locked, state])

  const mapsHref =
    state.status === 'ready'
      ? `https://www.google.com/maps?q=${state.lat},${state.lng}`
      : undefined

  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-[0.18em] text-saffron/70">{t('label')}</p>

      <div className="surface-inner p-6">
        {state.status === 'idle' && (
          <p className="text-sm text-ivory/70">{t('idle')}</p>
        )}

        {state.status === 'loading' && (
          <p className="text-sm text-ivory/70">{t('loading')}</p>
        )}

        {state.status === 'error' && (
          <p className="text-sm text-red-200/80">{state.message}</p>
        )}

        {state.status === 'ready' && (
          <div className="space-y-2">
            <div className="text-ivory">
              <div className="text-2xl font-medium">
                {format(state.lat)}, {format(state.lng)}
              </div>
              <div className="mt-1 text-xs text-ivory/60">
                {t('accuracy')}: {state.accuracy ? `${Math.round(state.accuracy)}m` : '—'} · {t('updated')}{' '}
                {formatTime24(state.timestamp)}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={copy}
                disabled={locked}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-ivory backdrop-blur hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t('copy')}
              </button>

              {mapsHref && (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  className={`rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-ivory backdrop-blur hover:bg-white/10 ${
                    locked ? 'pointer-events-none opacity-60' : ''
                  }`}
                >
                  {t('openMaps')}
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={request}
        disabled={locked}
        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-ivory backdrop-blur hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {t('useLocation')}
      </button>
      {locked && (
        <p className="text-xs uppercase tracking-[0.18em] text-ivory/50">
          {tAuth('unlockActions')}
        </p>
      )}
    </div>
  )
}

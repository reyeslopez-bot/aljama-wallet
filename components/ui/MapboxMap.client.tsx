'use client'

import * as React from 'react'
import mapboxgl from 'mapbox-gl'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'

type Coords = {
  lat: number
  lng: number
  accuracy?: number
  timestamp: number
}

const DEFAULT_CENTER = { lat: 32.0853, lng: 34.7818 } // Tel Aviv fallback

export default function MapboxMap() {
  const t = useTranslations('map')
  const tAuth = useTranslations('auth')
  const { status: sessionStatus } = useSession()
  const locked = sessionStatus !== 'authenticated'
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const mapRef = React.useRef<mapboxgl.Map | null>(null)
  const markerRef = React.useRef<mapboxgl.Marker | null>(null)

  const [coords, setCoords] = React.useState<Coords | null>(null)
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [mapReady, setMapReady] = React.useState(false)

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  React.useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('Missing NEXT_PUBLIC_MAPBOX_TOKEN in .env.local')
      return
    }
    if (!containerRef.current) return
    if (mapRef.current) return // prevent re-init

    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: 10.5,
      attributionControl: true,
      pitchWithRotate: false,
      dragRotate: false,
      interactive: false,
    })

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.on('load', () => {
      setMapReady(true)
      map.resize()
    })
    map.on('error', (event) => {
      console.warn('mapbox error', event?.error)
      setStatus('error')
      setError('Map tiles unavailable. Check Mapbox token or network.')
    })

    mapRef.current = map

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [token])

  React.useEffect(() => {
    if (!coords) return
    const map = mapRef.current
    if (!map) return

    const lngLat: [number, number] = [coords.lng, coords.lat]

    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: '#d2a762' }).setLngLat(lngLat).addTo(map)
    } else {
      markerRef.current.setLngLat(lngLat)
    }

    map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 14), essential: true })
  }, [coords])

  const requestLocation = React.useCallback(() => {
    if (locked) {
      setStatus('idle')
      setError(null)
      return
    }
    setError(null)

    if (!('geolocation' in navigator)) {
      setStatus('error')
      setError('Geolocation not supported in this browser.')
      return
    }

    setStatus('loading')

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        })
        setStatus('ready')
      },
      (err) => {
        const msg =
          err.code === 1
            ? 'Permission denied. Allow location for this site.'
            : err.code === 2
              ? 'Position unavailable.'
              : err.code === 3
                ? 'Location request timed out.'
                : err.message

        setStatus('error')
        setError(msg)
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 15_000 },
    )
  }, [locked])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-saffron/70">{t('label')}</p>

          <p className="text-sm text-ivory/70">
            {status === 'idle' && t('idle')}
            {status === 'loading' && t('loading')}
            {status === 'ready' && coords && (
              <>
                {t('centered')}{' '}
                <span className="text-ivory">
                  {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                </span>
                {coords.accuracy ? ` · ±${Math.round(coords.accuracy)}m` : null}
              </>
            )}
            {status === 'error' && (error ?? t('error'))}
          </p>
        </div>

        <button
          type="button"
          onClick={requestLocation}
          disabled={locked}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-ivory backdrop-blur hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('useLocation')}
        </button>
      </div>

      <div className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black/60 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div ref={containerRef} className="h-[260px] w-full md:h-[320px]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />
        {!mapReady && !error ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-ivory/60">
            {t('loadingTiles')}
          </div>
        ) : null}
        {error ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-red-200">
            {t('offline')}
          </div>
        ) : null}
      </div>
      {locked && (
        <p className="text-xs uppercase tracking-[0.18em] text-ivory/50">
          {tAuth('unlockActions')}
        </p>
      )}
    </div>
  )
}

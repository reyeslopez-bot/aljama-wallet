'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  canUseGeolocation,
  getLocationConsent,
  onLocationConsentChange,
  setLocationConsent,
  type LocationConsent,
} from '@/infra/location/client'

type Coords = {
  lat: number
  lng: number
  accuracy?: number
  timestamp: number
  source: 'default' | 'device'
}

type RegulatoryRegion = 'uae' | 'israel' | 'eu' | 'us' | 'global'
type UiRegion = 'us' | 'eu' | 'mena' | 'apac' | 'latam'
type MapboxModule = typeof import('mapbox-gl')
type MapboxMapInstance = import('mapbox-gl').Map
type MapboxMarkerInstance = import('mapbox-gl').Marker
type GovSource = { label: string; href: string }

const DEFAULT_CENTER = { lat: 25.204849, lng: 55.270783 } // Dubai fallback
const REGION_KEY = 'aljama.region'
const REGION_SYNC_EVENT = 'aljama:region-sync'
const GOV_SOURCES: Record<RegulatoryRegion, GovSource[]> = {
  uae: [
    { label: 'Dubai Virtual Assets Regulatory Authority (VARA)', href: 'https://www.vara.ae/' },
  ],
  israel: [
    { label: 'Israel Securities Authority (ISA)', href: 'https://www.isa.gov.il/' },
  ],
  eu: [
    { label: 'European Securities and Markets Authority (ESMA)', href: 'https://www.esma.europa.eu/' },
    { label: 'EUR-Lex MiCA Regulation (EU) 2023/1114', href: 'https://eur-lex.europa.eu/eli/reg/2023/1114/oj' },
  ],
  us: [
    { label: 'Financial Crimes Enforcement Network (FinCEN)', href: 'https://www.fincen.gov/' },
    { label: 'U.S. Securities and Exchange Commission (SEC)', href: 'https://www.sec.gov/' },
  ],
  global: [
    { label: 'Financial Action Task Force (FATF)', href: 'https://www.fatf-gafi.org/' },
  ],
}

function resolveRegulatoryRegion(lat: number, lng: number): RegulatoryRegion {
  if (lat >= 22 && lat <= 27.5 && lng >= 51 && lng <= 57) return 'uae'
  if (lat >= 29 && lat <= 34.9 && lng >= 34 && lng <= 36) return 'israel'
  if (lat >= 35 && lat <= 72 && lng >= -11 && lng <= 40) return 'eu'
  if (lat >= 24 && lat <= 49.5 && lng >= -125 && lng <= -66) return 'us'
  return 'global'
}

function resolveUiRegion(lat: number, lng: number, regulatoryRegion: RegulatoryRegion): UiRegion {
  if (regulatoryRegion === 'us') return 'us'
  if (regulatoryRegion === 'eu') return 'eu'
  if (regulatoryRegion === 'uae' || regulatoryRegion === 'israel') return 'mena'
  if (lat >= -56 && lat <= 33 && lng >= -118 && lng <= -34) return 'latam'
  return 'apac'
}

export default function MapboxMap() {
  const t = useTranslations('map')
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const mapRef = React.useRef<MapboxMapInstance | null>(null)
  const markerRef = React.useRef<MapboxMarkerInstance | null>(null)
  const mapboxModuleRef = React.useRef<MapboxModule | null>(null)
  const autoRequestedRef = React.useRef(false)

  const [coords, setCoords] = React.useState<Coords>({
    lat: DEFAULT_CENTER.lat,
    lng: DEFAULT_CENTER.lng,
    timestamp: Date.now(),
    source: 'default',
  })
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [mapReady, setMapReady] = React.useState(false)
  const [mapError, setMapError] = React.useState<string | null>(null)
  const [locationConsent, setLocationConsentState] = React.useState<LocationConsent>('unset')
  const [isLightTheme, setIsLightTheme] = React.useState(false)
  const [showRegulations, setShowRegulations] = React.useState(false)

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const mapStyle = isLightTheme ? 'mapbox://styles/mapbox/light-v11' : 'mapbox://styles/mapbox/dark-v11'

  React.useEffect(() => {
    return onLocationConsentChange(() => {
      setLocationConsentState(getLocationConsent())
    })
  }, [])

  React.useEffect(() => {
    if (typeof document === 'undefined') return
    const syncTheme = () => setIsLightTheme(document.body.classList.contains('light'))
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('Missing NEXT_PUBLIC_MAPBOX_TOKEN in .env.local')
      setMapError('Missing NEXT_PUBLIC_MAPBOX_TOKEN in .env.local')
      return
    }
    if (!containerRef.current) return
    if (mapRef.current) return // prevent re-init

    let cancelled = false
    const initMap = async () => {
      try {
        const loaded = mapboxModuleRef.current ?? (await import('mapbox-gl'))
        if (cancelled) return
        mapboxModuleRef.current = loaded

        const mapboxgl = loaded.default
        mapboxgl.accessToken = token

        const map = new mapboxgl.Map({
          container: containerRef.current!,
          style: mapStyle,
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
          setMapError('Map tiles unavailable. Check Mapbox token or network.')
        })

        mapRef.current = map
      } catch (initError) {
        console.warn('mapbox init error', initError)
        setStatus('error')
        setError('Map tiles unavailable. Check Mapbox token or network.')
        setMapError('Map tiles unavailable. Check Mapbox token or network.')
      }
    }
    void initMap()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [token])

  React.useEffect(() => {
    const map = mapRef.current
    if (!map?.setStyle) return
    map.setStyle(mapStyle)
  }, [mapStyle])

  React.useEffect(() => {
    const map = mapRef.current
    const mapboxgl = mapboxModuleRef.current?.default
    if (!map || !mapboxgl) return

    const lngLat: [number, number] = [coords.lng, coords.lat]

    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: '#d2a762' }).setLngLat(lngLat).addTo(map)
    } else {
      markerRef.current.setLngLat(lngLat)
    }

    const targetZoom = coords.source === 'device' ? Math.max(map.getZoom(), 14) : Math.max(map.getZoom(), 11.5)
    map.flyTo({ center: lngLat, zoom: targetZoom, essential: true })
  }, [coords])

  const requestLocation = React.useCallback(() => {
    if (locationConsent !== 'granted') return
    setError(null)

    if (!canUseGeolocation() || !('geolocation' in navigator)) {
      setStatus('error')
      setError('Geolocation is blocked by browser policy or not supported.')
      setLocationConsent('denied')
      return
    }

    setStatus('loading')

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
            source: 'device',
          })
          setLocationConsent('granted')
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

          if (err.code === 1) setLocationConsent('denied')
          setStatus('error')
          setError(msg)
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 15_000 },
      )
    } catch {
      setLocationConsent('denied')
      setStatus('error')
      setError('Geolocation is blocked by browser policy or not supported.')
    }
  }, [locationConsent])

  React.useEffect(() => {
    if (autoRequestedRef.current) return
    if (locationConsent !== 'granted') return
    autoRequestedRef.current = true
    requestLocation()
  }, [locationConsent, requestLocation])

  const regulatoryRegion = React.useMemo(
    () => resolveRegulatoryRegion(coords.lat, coords.lng),
    [coords.lat, coords.lng],
  )
  const uiRegion = React.useMemo(
    () => resolveUiRegion(coords.lat, coords.lng, regulatoryRegion),
    [coords.lat, coords.lng, regulatoryRegion],
  )

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const previous = window.localStorage.getItem(REGION_KEY)
    if (previous === uiRegion) return
    window.localStorage.setItem(REGION_KEY, uiRegion)
    window.dispatchEvent(
      new CustomEvent(REGION_SYNC_EVENT, {
        detail: { region: uiRegion },
      }),
    )
  }, [uiRegion])

  React.useEffect(() => {
    setShowRegulations(false)
  }, [regulatoryRegion])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-saffron/70">{t('label')}</p>

          <p className="text-sm text-ivory/70">
            {status === 'idle' && (
              <>
                {locationConsent === 'denied' ? t('blocked') : t('idle')}
              </>
            )}
            {status === 'loading' && t('loading')}
            {status === 'ready' && (
              <>
                {t('centered')}{' '}
                <span className="text-ivory">{t(`laws.${regulatoryRegion}.label`)}</span>
                {coords.accuracy ? ` · ±${Math.round(coords.accuracy)}m` : null}
              </>
            )}
            {status === 'error' && (error ?? t('error'))}
          </p>
        </div>

        <button
          type="button"
          onClick={requestLocation}
          disabled={status === 'loading' || locationConsent !== 'granted'}
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-ivory backdrop-blur hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('useLocation')}
        </button>
      </div>

      <div
        className={`relative w-full overflow-hidden rounded-3xl border backdrop-blur-xl ${
          isLightTheme
            ? 'border-[#7fa3c1]/40 bg-white/70 shadow-2xl shadow-[#7fa3c1]/25'
            : 'border-white/10 bg-black/60 shadow-2xl shadow-black/40'
        }`}
      >
        <div ref={containerRef} className="h-[260px] w-full md:h-[320px]" />
        <div
          className={`pointer-events-none absolute inset-0 ${
            isLightTheme
              ? 'bg-gradient-to-b from-white/35 via-transparent to-white/45'
              : 'bg-gradient-to-b from-black/20 via-transparent to-black/40'
          }`}
        />
        {!mapReady && !mapError ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-ivory/60">
            {t('loadingTiles')}
          </div>
        ) : null}
        {mapError ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-red-200">
            {t('offline')}
          </div>
        ) : null}
      </div>
      <div className="surface-soft p-4 text-sm text-ivory/70">
        <p className="text-xs uppercase tracking-[0.16em] text-ivory/50">{t('laws.title')}</p>
        <p className="mt-2 text-xs text-ivory/60">
          {t('laws.jurisdiction')}{' '}
          <span className="text-ivory">{t(`laws.${regulatoryRegion}.label`)}</span>
        </p>
        <button
          type="button"
          onClick={() => setShowRegulations((open) => !open)}
          className="mt-3 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ivory/75 transition hover:bg-white/10"
        >
          {showRegulations ? t('laws.showLess') : t('laws.showMore')}
        </button>
        {showRegulations && (
          <>
            <ul className="mt-3 space-y-2 text-xs text-ivory/60">
              <li>{t(`laws.${regulatoryRegion}.item1`)}</li>
              <li>{t(`laws.${regulatoryRegion}.item2`)}</li>
              <li>{t(`laws.${regulatoryRegion}.item3`)}</li>
            </ul>
            <p className="mt-3 text-[11px] text-ivory/45">{t('laws.disclaimer')}</p>
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-ivory/45">{t('laws.sourcesTitle')}</p>
              <ul className="mt-2 space-y-1.5 text-[11px] text-ivory/65">
                {GOV_SOURCES[regulatoryRegion].map((source) => (
                  <li key={source.href}>
                    <a
                      href={source.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-white/25 underline-offset-2 transition hover:text-ivory hover:decoration-ivory/60"
                    >
                      {source.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

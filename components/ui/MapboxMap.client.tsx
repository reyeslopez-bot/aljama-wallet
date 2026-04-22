'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useAdaptiveExperience } from '@/hooks/useAdaptiveExperience'
import { getLocationConsent, onLocationConsentChange } from '@/infra/location/client'
import {
  DETECTED_REGION_KEY,
  REGION_KEY,
  REGION_SELECTION_MODE_KEY,
  REGION_SYNC_EVENT,
} from '@/lib/region-profile'
import { parseClientApiError } from '@/lib/security/client-api-error'

type Coords = {
  lat: number
  lng: number
  timestamp: number
  source: 'default' | 'network'
}

type RegulatoryRegion = 'uae' | 'israel' | 'eu' | 'us' | 'global'
type UiRegion = 'us' | 'eu' | 'mena' | 'apac' | 'latam'
type MapboxModule = typeof import('mapbox-gl')
type MapboxMapInstance = import('mapbox-gl').Map
type MapboxMarkerInstance = import('mapbox-gl').Marker
type GovSource = { label: string; href: string }
type NetworkLocationResponse = {
  ok: true
  location: {
    source: 'network' | 'default'
    latitude: number
    longitude: number
    country: string | null
    region: string | null
    city: string | null
    timezone: string
  }
}

type ReverseGeocodeResponse = {
  features?: Array<{
    text?: string
    place_type?: string[]
  }>
}

const DEFAULT_CENTER = { lat: 25.204849, lng: 55.270783 } // Dubai fallback
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
  const titleId = 'mapbox-map-title'
  const statusId = 'mapbox-map-status'
  const lawsId = 'mapbox-map-laws'
  const regulationPanelId = 'mapbox-map-regulations'
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const mapRef = React.useRef<MapboxMapInstance | null>(null)
  const markerRef = React.useRef<MapboxMarkerInstance | null>(null)
  const mapboxModuleRef = React.useRef<MapboxModule | null>(null)

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
  const [placeLabel, setPlaceLabel] = React.useState<string | null>(null)
  const [isLightTheme, setIsLightTheme] = React.useState(false)
  const [locationEnabled, setLocationEnabled] = React.useState(false)
  const { shouldUseLightweightMode } = useAdaptiveExperience()

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const mapStyle = isLightTheme ? 'mapbox://styles/mapbox/light-v11' : 'mapbox://styles/mapbox/dark-v11'

  const resolvePlaceLabel = React.useCallback(
    async (lat: number, lng: number, fallbackLabel: string | null = null) => {
      if (shouldUseLightweightMode) return fallbackLabel
      if (!token) return fallbackLabel

      try {
        const params = new URLSearchParams({
          access_token: token,
          language: 'en',
          types: 'place,locality,neighborhood,district,region',
        })
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params.toString()}`,
          { method: 'GET', cache: 'no-store' },
        )
        if (!res.ok) return fallbackLabel

        const body = (await res.json()) as ReverseGeocodeResponse
        const bestFeature = body.features?.find((feature) =>
          feature.place_type?.some((type) => ['place', 'locality', 'district', 'region'].includes(type)),
        )
        return bestFeature?.text?.trim() || fallbackLabel
      } catch {
        return fallbackLabel
      }
    },
    [shouldUseLightweightMode, token],
  )

  const requestNetworkLocation = React.useCallback(async () => {
    let res: Response
    try {
      res = await fetch('/api/network-location', { method: 'GET', cache: 'no-store' })
    } catch {
      throw new Error('Network location unavailable.')
    }

    const body = (await res.json().catch(() => null)) as
      | NetworkLocationResponse
      | { ok: false; error?: string; code?: string; details?: unknown }
      | null
    if (!res.ok || !body?.ok) {
      throw new Error(parseClientApiError(res, body).message)
    }

    const label = await resolvePlaceLabel(body.location.latitude, body.location.longitude, body.location.city)

    setCoords({
      lat: body.location.latitude,
      lng: body.location.longitude,
      timestamp: Date.now(),
      source: body.location.source === 'network' ? 'network' : 'default',
    })
    setPlaceLabel(label)
    setStatus('ready')
  }, [resolvePlaceLabel])

  const requestLocation = React.useCallback(async () => {
    if (!locationEnabled) return

    setError(null)
    setStatus('loading')

    try {
      await requestNetworkLocation()
    } catch (error) {
      setCoords({
        lat: DEFAULT_CENTER.lat,
        lng: DEFAULT_CENTER.lng,
        timestamp: Date.now(),
        source: 'default',
      })
      setPlaceLabel(null)
      setStatus('error')
      setError(
        error instanceof Error && error.message.trim()
          ? `${error.message} Using Dubai fallback.`
          : 'Network location unavailable. Using Dubai fallback.',
      )
    }
  }, [locationEnabled, requestNetworkLocation])

  React.useEffect(() => {
    const syncLocationConsent = () => {
      setLocationEnabled(getLocationConsent() === 'granted')
    }

    syncLocationConsent()
    const unsubscribe = onLocationConsentChange(syncLocationConsent)
    window.addEventListener('storage', syncLocationConsent)
    window.addEventListener('focus', syncLocationConsent)
    return () => {
      unsubscribe()
      window.removeEventListener('storage', syncLocationConsent)
      window.removeEventListener('focus', syncLocationConsent)
    }
  }, [])

  React.useEffect(() => {
    if (!locationEnabled) return
    void requestLocation()
  }, [locationEnabled, requestLocation])

  React.useEffect(() => {
    if (typeof document === 'undefined') return
    const syncTheme = () => setIsLightTheme(document.body.classList.contains('light'))
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    if (shouldUseLightweightMode) {
      setMapReady(false)
      setMapError(null)
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
      return
    }
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
  }, [shouldUseLightweightMode, token])

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

    const targetZoom = Math.max(map.getZoom(), 11.5)
    map.flyTo({ center: lngLat, zoom: targetZoom, essential: true })
  }, [coords, mapReady])

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

    window.localStorage.setItem(DETECTED_REGION_KEY, uiRegion)
    const selectionMode = window.localStorage.getItem(REGION_SELECTION_MODE_KEY)
    if (selectionMode !== 'manual') {
      window.localStorage.setItem(REGION_KEY, uiRegion)
    }

    window.dispatchEvent(
      new CustomEvent(REGION_SYNC_EVENT, {
        detail: { region: uiRegion },
      }),
    )
  }, [uiRegion])

  return (
    <section
      data-testid="mapbox-map"
      aria-labelledby={titleId}
      aria-describedby={`${statusId} ${lawsId}`}
      className="space-y-4"
    >
      <div className="space-y-1">
        <p id={titleId} className="text-xs uppercase tracking-[0.18em] text-saffron/70">
          {t('label')}
        </p>

        <p id={statusId} data-testid="mapbox-map-status" aria-live="polite" className="text-sm text-ivory/70">
          {shouldUseLightweightMode ? (
            <>
              {t('lightweight')}{' '}
            </>
          ) : null}
          {!locationEnabled && t('blocked')}
          {locationEnabled && status === 'idle' && t('idle')}
          {locationEnabled && status === 'loading' && t('loading')}
          {locationEnabled && status === 'ready' && coords.source === 'default' && t('idle')}
          {locationEnabled && status === 'ready' && coords.source !== 'default' && (
            <>
              {t('centered')}{' '}
              <span className="text-ivory">{t(`laws.${regulatoryRegion}.label`)}</span>
              {placeLabel ? ` · ${placeLabel}` : null}
              {' · '}
              <span className="text-ivory/65">{t('source.network')}</span>
            </>
          )}
          {locationEnabled && status === 'error' && (error ?? t('error'))}
        </p>
      </div>

      <div
        data-testid="mapbox-map-viewport"
        className={`relative min-h-[260px] w-full overflow-hidden rounded-3xl border backdrop-blur-xl md:min-h-[320px] ${
          isLightTheme
            ? 'border-[#7fa3c1]/40 bg-white/70 shadow-2xl shadow-[#7fa3c1]/25'
            : 'border-white/10 bg-black/60 shadow-2xl shadow-black/40'
        }`}
        data-map-mode={shouldUseLightweightMode ? 'lightweight' : 'interactive'}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={statusId}
      >
        <div
          data-testid="mapbox-map-static-fallback"
          aria-hidden="true"
          className={`absolute inset-0 ${
            isLightTheme
              ? 'bg-[radial-gradient(circle_at_18%_20%,rgba(127,176,217,0.25),transparent_35%),radial-gradient(circle_at_82%_18%,rgba(92,152,124,0.18),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.88),rgba(234,242,251,0.86),rgba(229,237,247,0.9))]'
              : 'bg-[radial-gradient(circle_at_18%_20%,rgba(210,167,98,0.22),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(127,176,217,0.18),transparent_34%),linear-gradient(145deg,rgba(8,11,15,0.96),rgba(12,16,22,0.9),rgba(8,10,14,0.96))]'
          }`}
        >
          <div
            className={`absolute inset-x-0 top-[22%] h-px ${
              isLightTheme ? 'bg-[#7fa3c1]/28' : 'bg-white/8'
            }`}
          />
          <div
            className={`absolute left-[28%] top-[48%] h-px w-[44%] ${
              isLightTheme ? 'bg-[#7fa3c1]/24' : 'bg-white/7'
            }`}
          />
          <div
            className={`absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
              isLightTheme ? 'border-[#5c8db4]/45 bg-white/70' : 'border-white/14 bg-black/45'
            }`}
          >
            <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-saffron shadow-[0_0_16px_rgba(210,167,98,0.5)]" />
          </div>
        </div>
        <div
          ref={containerRef}
          aria-hidden="true"
          className={`relative h-[260px] w-full md:h-[320px] ${shouldUseLightweightMode ? 'hidden' : ''}`}
        />
        <div
          className={`pointer-events-none absolute inset-0 ${
            isLightTheme
              ? 'bg-gradient-to-b from-white/35 via-transparent to-white/45'
              : 'bg-gradient-to-b from-black/20 via-transparent to-black/40'
          }`}
        />
        {!shouldUseLightweightMode && !mapReady && !mapError ? (
          <div
            data-testid="mapbox-map-overlay-loading"
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-ivory/60"
          >
            {t('loadingTiles')}
          </div>
        ) : null}
        {mapError ? (
          <div
            data-testid="mapbox-map-overlay-error"
            role="alert"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-red-200"
          >
            {t('offline')}
          </div>
        ) : null}
      </div>
      <div data-testid="mapbox-map-laws-panel" className="surface-soft p-4 text-sm text-ivory/70">
        <p className="text-xs uppercase tracking-[0.16em] text-ivory/50">{t('laws.title')}</p>
        <p id={lawsId} data-testid="mapbox-map-laws" className="mt-2 text-xs text-ivory/60">
          {t('laws.jurisdiction')}{' '}
          <span className="text-ivory">{t(`laws.${regulatoryRegion}.label`)}</span>
        </p>
        <details className="group mt-3" id={regulationPanelId}>
          <summary
            data-testid="mapbox-map-laws-toggle"
            className="inline-flex cursor-pointer list-none rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ivory/75 transition hover:bg-white/10 [&::-webkit-details-marker]:hidden"
          >
            <span className="group-open:hidden">{t('laws.showMore')}</span>
            <span className="hidden group-open:inline">{t('laws.showLess')}</span>
          </summary>
          <div className="mt-3" data-testid="mapbox-map-regulations">
            <ul className="mt-3 space-y-2 text-xs text-ivory/60">
              <li data-testid="mapbox-map-regulation-item">{t(`laws.${regulatoryRegion}.item1`)}</li>
              <li data-testid="mapbox-map-regulation-item">{t(`laws.${regulatoryRegion}.item2`)}</li>
              <li data-testid="mapbox-map-regulation-item">{t(`laws.${regulatoryRegion}.item3`)}</li>
            </ul>
            <p className="mt-3 text-[11px] text-ivory/45">{t('laws.disclaimer')}</p>
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-ivory/45">{t('laws.sourcesTitle')}</p>
              <ul className="mt-2 space-y-1.5 text-[11px] text-ivory/65">
                {GOV_SOURCES[regulatoryRegion].map((source) => (
                  <li key={source.href}>
                    <a
                      data-testid="mapbox-map-source-link"
                      href={source.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={source.label}
                      className="underline decoration-white/25 underline-offset-2 transition hover:text-ivory hover:decoration-ivory/60"
                    >
                      {source.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      </div>
    </section>
  )
}

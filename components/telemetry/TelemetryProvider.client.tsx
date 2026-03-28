'use client'

import type { ReactNode } from 'react'
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  getBasicContext,
  getDeviceId,
  getSessionId,
  getTelemetryConsent,
  onTelemetryConsentChange,
  sendTelemetryEvent,
  type TelemetryConsent,
} from '@/infra/telemetry/client'
import { getLocationConsent } from '@/infra/location/client'
import { parseClientApiError } from '@/lib/security/client-api-error'

type TelemetryContextValue = {
  consent: TelemetryConsent
  track: (event: string, payload?: Record<string, unknown>) => void
}

type TelemetryContextSnapshot = Record<string, unknown>

export const TelemetryContext = createContext<TelemetryContextValue>({
  consent: 'unset',
  track: () => {},
})

export default function TelemetryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [consent, setConsent] = useState<TelemetryConsent>('unset')
  const [context, setContext] = useState<TelemetryContextSnapshot>({})
  const contextRef = useRef<TelemetryContextSnapshot>({})
  const sessionStartRef = useRef<number>(Date.now())
  const pageStartRef = useRef<number>(Date.now())
  const bootstrappedRef = useRef(false)
  const lastPathRef = useRef<string>('')

  const fullPath = useMemo(() => {
    if (typeof window === 'undefined') return pathname
    const qs = window.location.search.slice(1)
    return qs ? `${pathname}?${qs}` : pathname
  }, [pathname])

  useEffect(() => {
    setConsent(getTelemetryConsent())
    return onTelemetryConsentChange(() => setConsent(getTelemetryConsent()))
  }, [])

  useEffect(() => {
    contextRef.current = context
  }, [context])

  useEffect(() => {
    if (consent !== 'granted') {
      bootstrappedRef.current = false
      contextRef.current = {}
      setContext({})
      return
    }

    if (bootstrappedRef.current) return
    bootstrappedRef.current = true

    const deviceId = getDeviceId()
    const sessionId = getSessionId()
    if (!deviceId || !sessionId) return

    const baseContext = getBasicContext() as TelemetryContextSnapshot
    contextRef.current = baseContext
    setContext(baseContext)

    const init = async () => {
      let enriched: TelemetryContextSnapshot = baseContext
      try {
        if (getLocationConsent() === 'granted') {
          const res = await fetch('/api/network-location', { method: 'GET', cache: 'no-store' })
          const body = (await res.json().catch(() => null)) as
            | {
                ok: true
                location?: {
                  source: 'network' | 'default'
                  latitude: number
                  longitude: number
                  country: string | null
                  region: string | null
                  city: string | null
                  timezone: string
                }
              }
            | { ok: false; error?: string; code?: string; details?: unknown }
            | null
          if (!res.ok || !body?.ok) {
            throw new Error(parseClientApiError(res, body).message)
          }
          if (body.location) {
            enriched = {
              ...baseContext,
              networkLocation: body.location,
            }
          }
        }
      } catch {
        // keep base context if network location lookup fails
      }

      contextRef.current = enriched
      setContext(enriched)

      await sendTelemetryEvent({
        event: 'session_start',
        sessionId,
        deviceId,
        path: fullPath,
        context: enriched,
        payload: {
          startedAt: new Date(sessionStartRef.current).toISOString(),
        },
      })
    }

    void init()
  }, [consent, fullPath])

  useEffect(() => {
    if (consent !== 'granted') return

    const deviceId = getDeviceId()
    const sessionId = getSessionId()
    if (!deviceId || !sessionId) return

    const sendPageTime = async (path: string, durationMs: number) => {
      await sendTelemetryEvent({
        event: 'page_time',
        sessionId,
        deviceId,
        path,
        context: contextRef.current,
        payload: { durationMs },
      })
    }

    if (lastPathRef.current && lastPathRef.current !== fullPath) {
      const durationMs = Date.now() - pageStartRef.current
      void sendPageTime(lastPathRef.current, durationMs)
    }

    lastPathRef.current = fullPath
    pageStartRef.current = Date.now()

    void sendTelemetryEvent({
      event: 'page_view',
      sessionId,
      deviceId,
      path: fullPath,
      context: contextRef.current,
    })
  }, [consent, fullPath])

  useEffect(() => {
    if (consent !== 'granted') return

    const deviceId = getDeviceId()
    const sessionId = getSessionId()
    if (!deviceId || !sessionId) return

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return

      const interactive = target.closest('a,button,[data-telemetry-click]') as HTMLElement | null
      if (!interactive) return

      if (interactive.tagName === 'INPUT' || interactive.tagName === 'TEXTAREA') return

      const text = (interactive.textContent ?? '').trim().slice(0, 64)
      const href = interactive.getAttribute('href') ?? undefined
      const id = interactive.getAttribute('data-telemetry-id') ?? interactive.id ?? undefined

      void sendTelemetryEvent({
        event: 'click',
        sessionId,
        deviceId,
        path: fullPath,
        context: contextRef.current,
        payload: {
          tag: interactive.tagName.toLowerCase(),
          text: text || undefined,
          href,
          id,
        },
      })
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [consent, fullPath])

  useEffect(() => {
    if (consent !== 'granted') return

    const deviceId = getDeviceId()
    const sessionId = getSessionId()
    if (!deviceId || !sessionId) return

    const sendSessionEnd = async () => {
      const durationMs = Date.now() - sessionStartRef.current
      await sendTelemetryEvent({
        event: 'session_end',
        sessionId,
        deviceId,
        path: fullPath,
        context: contextRef.current,
        payload: { durationMs },
        immediate: true,
      })
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void sendSessionEnd()
      }
    }

    const handlePageHide = () => {
      void sendSessionEnd()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [consent, fullPath])

  useEffect(() => {
    if (consent !== 'granted') return

    const deviceId = getDeviceId()
    const sessionId = getSessionId()
    if (!deviceId || !sessionId) return

    const sendPerf = () => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      const paints = performance.getEntriesByType('paint') as PerformanceEntry[]
      const fcp = paints.find((entry) => entry.name === 'first-contentful-paint')?.startTime

      void sendTelemetryEvent({
        event: 'perf',
        sessionId,
        deviceId,
        path: fullPath,
        context: contextRef.current,
        payload: {
          ttfb: nav ? nav.responseStart - nav.requestStart : null,
          domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
          loadEventEnd: nav ? nav.loadEventEnd : null,
          fcp: fcp ?? null,
        },
      })
    }

    if (document.readyState === 'complete') {
      sendPerf()
      return
    }

    window.addEventListener('load', sendPerf, { once: true })
    return () => window.removeEventListener('load', sendPerf)
  }, [consent, fullPath])

  const track = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      if (consent !== 'granted') return
      const deviceId = getDeviceId()
      const sessionId = getSessionId()
      if (!deviceId || !sessionId) return
      void sendTelemetryEvent({
        event,
        sessionId,
        deviceId,
        path: fullPath,
        context: contextRef.current,
        payload,
      })
    },
    [consent, fullPath],
  )

  const value = useMemo<TelemetryContextValue>(() => ({ consent, track }), [consent, track])

  return <TelemetryContext.Provider value={value}>{children}</TelemetryContext.Provider>
}

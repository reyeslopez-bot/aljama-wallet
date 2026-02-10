'use client'

import { useContext, useEffect, useRef } from 'react'
import { TelemetryContext } from '@/components/telemetry/TelemetryProvider.client'

export function useComponentTelemetry(name: string, payload?: Record<string, unknown>) {
  const { track, consent } = useContext(TelemetryContext)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (consent !== 'granted') return
    startRef.current = Date.now()
    track('component_view', { name, ...payload })

    return () => {
      if (consent !== 'granted') return
      const started = startRef.current
      if (!started) return
      const durationMs = Date.now() - started
      track('component_time', { name, durationMs, ...payload })
    }
  }, [consent, name, payload, track])
}

'use client'

import { useContext, useEffect, useRef } from 'react'
import { TelemetryContext } from '@/components/telemetry/TelemetryProvider.client'

export function useComponentTelemetry(name: string, payload?: Record<string, unknown>) {
  const { track, consent } = useContext(TelemetryContext)
  const startRef = useRef<number | null>(null)
  const trackRef = useRef(track)
  const payloadRef = useRef(payload)

  useEffect(() => {
    trackRef.current = track
  }, [track])

  useEffect(() => {
    payloadRef.current = payload
  }, [payload])

  useEffect(() => {
    if (consent !== 'granted') return
    startRef.current = Date.now()
    trackRef.current('component_view', { name, ...(payloadRef.current ?? {}) })

    return () => {
      if (consent !== 'granted') return
      const started = startRef.current
      if (!started) return
      const durationMs = Date.now() - started
      trackRef.current('component_time', { name, durationMs, ...(payloadRef.current ?? {}) })
    }
  }, [consent, name])
}

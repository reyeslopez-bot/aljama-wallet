'use client'

import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

type NavigatorConnection = {
  effectiveType?: string
  saveData?: boolean
  addEventListener?: (type: 'change', listener: () => void) => void
  removeEventListener?: (type: 'change', listener: () => void) => void
  addListener?: (listener: () => void) => void
  removeListener?: (listener: () => void) => void
}

type AdaptiveExperienceInput = {
  prefersReducedMotion: boolean
  effectiveType?: string | null
  saveData?: boolean
  deviceMemory?: number | null
  hardwareConcurrency?: number | null
}

export type AdaptiveExperienceState = AdaptiveExperienceInput & {
  hasHydrated: boolean
  isLowBandwidth: boolean
  isLowPerformanceDevice: boolean
  shouldReduceMotion: boolean
  shouldUseLightweightMode: boolean
}

const SLOW_CONNECTION_TYPES = new Set(['slow-2g', '2g', '3g'])
const LOW_DEVICE_MEMORY_GB = 4
const LOW_HARDWARE_CONCURRENCY = 4

function normalizeEffectiveType(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

function getNavigatorConnection(): NavigatorConnection | null {
  if (typeof navigator === 'undefined') return null

  const candidate = (
    navigator as Navigator & {
      connection?: NavigatorConnection
      mozConnection?: NavigatorConnection
      webkitConnection?: NavigatorConnection
    }
  ).connection
    ?? (
      navigator as Navigator & {
        mozConnection?: NavigatorConnection
        webkitConnection?: NavigatorConnection
      }
    ).mozConnection
    ?? (
      navigator as Navigator & {
        webkitConnection?: NavigatorConnection
      }
    ).webkitConnection

  return candidate ?? null
}

function getNumericNavigatorValue<K extends 'deviceMemory' | 'hardwareConcurrency'>(key: K) {
  if (typeof navigator === 'undefined') return null

  const value = (
    navigator as Navigator & {
      deviceMemory?: number
      hardwareConcurrency?: number
    }
  )[key]

  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function evaluateAdaptiveExperience({
  prefersReducedMotion,
  effectiveType,
  saveData = false,
  deviceMemory = null,
  hardwareConcurrency = null,
}: AdaptiveExperienceInput): Omit<AdaptiveExperienceState, 'hasHydrated'> {
  const normalizedEffectiveType = normalizeEffectiveType(effectiveType)
  const isLowBandwidth = Boolean(saveData) || SLOW_CONNECTION_TYPES.has(normalizedEffectiveType ?? '')
  const isLowPerformanceDevice =
    (typeof deviceMemory === 'number' && deviceMemory <= LOW_DEVICE_MEMORY_GB) ||
    (typeof hardwareConcurrency === 'number' && hardwareConcurrency <= LOW_HARDWARE_CONCURRENCY)

  return {
    prefersReducedMotion,
    effectiveType: normalizedEffectiveType,
    saveData: Boolean(saveData),
    deviceMemory,
    hardwareConcurrency,
    isLowBandwidth,
    isLowPerformanceDevice,
    shouldReduceMotion: prefersReducedMotion || isLowBandwidth || isLowPerformanceDevice,
    shouldUseLightweightMode: isLowBandwidth || isLowPerformanceDevice,
  }
}

function getAdaptiveExperienceSnapshot(prefersReducedMotion: boolean): AdaptiveExperienceState {
  const connection = getNavigatorConnection()
  const deviceMemory = getNumericNavigatorValue('deviceMemory')
  const hardwareConcurrency = getNumericNavigatorValue('hardwareConcurrency')
  const nextState = evaluateAdaptiveExperience({
    prefersReducedMotion,
    effectiveType: connection?.effectiveType ?? null,
    saveData: connection?.saveData,
    deviceMemory,
    hardwareConcurrency,
  })

  return {
    ...nextState,
    hasHydrated: true,
  }
}

const INITIAL_STATE: AdaptiveExperienceState = {
  prefersReducedMotion: true,
  effectiveType: null,
  saveData: false,
  deviceMemory: null,
  hardwareConcurrency: null,
  hasHydrated: false,
  isLowBandwidth: true,
  isLowPerformanceDevice: true,
  shouldReduceMotion: true,
  shouldUseLightweightMode: true,
}

export function useAdaptiveExperience() {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [state, setState] = useState<AdaptiveExperienceState>(INITIAL_STATE)

  useEffect(() => {
    const sync = () => {
      setState(getAdaptiveExperienceSnapshot(prefersReducedMotion))
    }

    sync()

    const connection = getNavigatorConnection()
    if (!connection) return

    if (typeof connection.addEventListener === 'function') {
      connection.addEventListener('change', sync)
      return () => connection.removeEventListener?.('change', sync)
    }

    connection.addListener?.(sync)
    return () => connection.removeListener?.(sync)
  }, [prefersReducedMotion])

  return state
}

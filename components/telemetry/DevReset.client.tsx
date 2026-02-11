// components/telemetry/DevReset.client.tsx
'use client'

import { useEffect } from 'react'

const BUILD_KEY = 'aljama.dev.buildId'
const TELEMETRY_KEYS = [
  'aljama.telemetry.consent',
  'aljama.telemetry.deviceId',
  'aljama.telemetry.sessionId',
]
const STORAGE_KEYS = [
  'site_secure_gate_v1',
  'home_secure_gate_v1',
  'secure_gate_default_v1',
]

function getBuildId(): string | null {
  if (typeof window === 'undefined') return null
  const nextData = (window as Window & { __NEXT_DATA__?: { buildId?: string } }).__NEXT_DATA__
  return typeof nextData?.buildId === 'string' ? nextData.buildId : null
}

function collectKeys(storage: Storage, prefixes: string[], exact: string[]): string[] {
  const hits = new Set<string>(exact)
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (!key) continue
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      hits.add(key)
    }
  }
  return Array.from(hits)
}

export default function DevReset() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    if (typeof window === 'undefined') return

    const buildId = getBuildId()
    if (!buildId) return

    const storedBuildId = window.localStorage.getItem(BUILD_KEY)
    if (storedBuildId === buildId) return

    window.localStorage.setItem(BUILD_KEY, buildId)

    const localKeys = collectKeys(
      window.localStorage,
      ['secure_gate_', 'site_secure_gate_', 'home_secure_gate_'],
      [...TELEMETRY_KEYS, ...STORAGE_KEYS],
    )
    localKeys.forEach((key) => window.localStorage.removeItem(key))

    const sessionKeys = collectKeys(
      window.sessionStorage,
      ['wc2:', 'wagmi', 'rk-', 'walletconnect'],
      ['aljama.telemetry.sessionId'],
    )
    sessionKeys.forEach((key) => window.sessionStorage.removeItem(key))
  }, [])

  return null
}

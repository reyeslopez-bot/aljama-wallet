'use client'

const TEST_FIXED_NOW_ISO = '2026-02-20T00:00:00.000Z'

declare global {
  interface Window {
    __ALJAMA_E2E_FIXED_NOW__?: string
  }
}

function getE2EFixedNow() {
  if (typeof window === 'undefined') return null
  const rawValue = window.__ALJAMA_E2E_FIXED_NOW__
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) return null

  const fixedNow = new Date(rawValue)
  return Number.isNaN(fixedNow.getTime()) ? null : fixedNow
}

export function getHomeNow() {
  if (process.env.NODE_ENV === 'test') {
    return new Date(TEST_FIXED_NOW_ISO)
  }

  return getE2EFixedNow() ?? new Date()
}

export function getHomeNowMs() {
  return getHomeNow().getTime()
}

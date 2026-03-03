// infra/telemetry/client.ts

export type TelemetryConsent = 'granted' | 'denied' | 'unset'

const CONSENT_KEY = 'aljama.telemetry.consent'
const DEVICE_ID_KEY = 'aljama.telemetry.deviceId'
const SESSION_ID_KEY = 'aljama.telemetry.sessionId'
const CONSENT_EVENT = 'aljama:telemetry-consent'

function hasWindow() {
  return typeof window !== 'undefined'
}

function hasCrypto() {
  return Boolean(globalThis.crypto?.randomUUID)
}

function randomId() {
  if (hasCrypto()) return globalThis.crypto.randomUUID()
  return `id_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

export function getTelemetryConsent(): TelemetryConsent {
  if (!hasWindow()) return 'unset'
  const value = window.localStorage.getItem(CONSENT_KEY)
  if (value === 'granted' || value === 'denied') return value
  return 'unset'
}

export function setTelemetryConsent(value: Exclude<TelemetryConsent, 'unset'>) {
  if (!hasWindow()) return
  window.localStorage.setItem(CONSENT_KEY, value)
  window.dispatchEvent(new Event(CONSENT_EVENT))
}

export function onTelemetryConsentChange(handler: () => void) {
  if (!hasWindow()) return () => {}
  window.addEventListener(CONSENT_EVENT, handler)
  return () => window.removeEventListener(CONSENT_EVENT, handler)
}

function getOrCreateId(storage: Storage, key: string) {
  const existing = storage.getItem(key)
  if (existing) return existing
  const id = randomId()
  storage.setItem(key, id)
  return id
}

export function getDeviceId(): string | null {
  if (!hasWindow()) return null
  if (getTelemetryConsent() !== 'granted') return null
  return getOrCreateId(window.localStorage, DEVICE_ID_KEY)
}

export function hasRecognizedDevice(): boolean {
  if (!hasWindow()) return false
  try {
    const storage = window.localStorage as { getItem?: (key: string) => string | null }
    if (typeof storage.getItem !== 'function') return false
    return Boolean(storage.getItem(DEVICE_ID_KEY))
  } catch {
    return false
  }
}

export function getSessionId(): string | null {
  if (!hasWindow()) return null
  if (getTelemetryConsent() !== 'granted') return null
  return getOrCreateId(window.sessionStorage, SESSION_ID_KEY)
}

export function getUtmParams(): Record<string, string> {
  if (!hasWindow()) return {}
  const params = new URLSearchParams(window.location.search)
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
  const utm: Record<string, string> = {}
  for (const key of keys) {
    const value = params.get(key)
    if (value) utm[key] = value
  }
  return utm
}

export function getBasicContext() {
  if (!hasWindow()) return {}
  const nav = navigator as Navigator & { userAgentData?: { brands?: { brand: string; version: string }[] } }
  const connection =
    (navigator as Navigator & { connection?: { effectiveType?: string; rtt?: number; downlink?: number; saveData?: boolean } })
      .connection ?? null

  return {
    userAgent: navigator.userAgent ?? null,
    platform: navigator.platform ?? null,
    language: navigator.language ?? null,
    languages: navigator.languages ?? null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    screen: {
      width: window.screen?.width ?? null,
      height: window.screen?.height ?? null,
      devicePixelRatio: window.devicePixelRatio ?? null,
    },
    viewport: {
      width: window.innerWidth ?? null,
      height: window.innerHeight ?? null,
    },
    referrer: document.referrer || null,
    utm: getUtmParams(),
    botSignals: {
      webdriver: Boolean((navigator as Navigator & { webdriver?: boolean }).webdriver),
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
      maxTouchPoints: navigator.maxTouchPoints ?? null,
      userAgentBrands: nav.userAgentData?.brands ?? null,
      userActivation: (navigator as Navigator & { userActivation?: { hasBeenActive: boolean; isActive: boolean } })
        .userActivation ?? null,
      cookieEnabled: navigator.cookieEnabled ?? null,
    },
    connection: connection
      ? {
          effectiveType: connection.effectiveType ?? null,
          rtt: connection.rtt ?? null,
          downlink: connection.downlink ?? null,
          saveData: connection.saveData ?? null,
        }
      : null,
  }
}

export async function sendTelemetryEvent(input: {
  event: string
  sessionId: string
  deviceId: string
  path?: string
  context?: Record<string, unknown>
  payload?: Record<string, unknown>
  immediate?: boolean
}) {
  const body = {
    event: input.event,
    ts: new Date().toISOString(),
    sessionId: input.sessionId,
    deviceId: input.deviceId,
    path: input.path,
    context: input.context,
    payload: input.payload,
  }

  try {
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' })
    if (input.immediate && navigator.sendBeacon) {
      navigator.sendBeacon('/api/telemetry', blob)
      return
    }

    await fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: Boolean(input.immediate),
    })
  } catch {
    // intentionally swallow client telemetry errors
  }
}

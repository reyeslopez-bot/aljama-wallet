// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getTelemetryConsent,
  setTelemetryConsent,
  onTelemetryConsentChange,
  getDeviceId,
  getSessionId,
  getUtmParams,
  getBasicContext,
  sendTelemetryEvent,
} from '@/infra/telemetry/client'

describe('telemetry client utilities', () => {
  beforeEach(() => {
    const makeStorage = () => {
      const store = new Map<string, string>()
      return {
        get length() {
          return store.size
        },
        clear() {
          store.clear()
        },
        getItem(key: string) {
          return store.has(key) ? store.get(key)! : null
        },
        key(index: number) {
          return Array.from(store.keys())[index] ?? null
        },
        removeItem(key: string) {
          store.delete(key)
        },
        setItem(key: string, value: string) {
          store.set(key, String(value))
        },
      }
    }

    Object.defineProperty(window, 'localStorage', {
      value: makeStorage(),
      configurable: true,
    })
    Object.defineProperty(window, 'sessionStorage', {
      value: makeStorage(),
      configurable: true,
    })
  })

  it('tracks consent changes', () => {
    const handler = vi.fn()
    const cleanup = onTelemetryConsentChange(handler)

    expect(getTelemetryConsent()).toBe('unset')
    setTelemetryConsent('granted')
    expect(getTelemetryConsent()).toBe('granted')
    expect(handler).toHaveBeenCalled()

    cleanup()
  })

  it('only creates IDs after consent is granted', () => {
    expect(getDeviceId()).toBeNull()
    expect(getSessionId()).toBeNull()

    setTelemetryConsent('granted')
    const deviceId = getDeviceId()
    const sessionId = getSessionId()

    expect(deviceId).toBeTruthy()
    expect(sessionId).toBeTruthy()
    expect(getDeviceId()).toBe(deviceId)
    expect(getSessionId()).toBe(sessionId)
  })

  it('parses UTM params from the URL', () => {
    window.history.pushState({}, '', '/?utm_source=src&utm_medium=med&utm_campaign=camp')
    expect(getUtmParams()).toEqual({
      utm_source: 'src',
      utm_medium: 'med',
      utm_campaign: 'camp',
    })
  })

  it('returns a basic context snapshot', () => {
    setTelemetryConsent('granted')
    const context = getBasicContext()
    expect(context).toHaveProperty('language')
    expect(context).toHaveProperty('timezone')
    expect(context).toHaveProperty('screen')
    expect(context).toHaveProperty('viewport')
  })

  it('sends telemetry events via fetch', async () => {
    setTelemetryConsent('granted')
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchSpy)

    await sendTelemetryEvent({
      event: 'test_event',
      sessionId: getSessionId()!,
      deviceId: getDeviceId()!,
      path: '/test',
      context: { foo: 'bar' },
    })

    expect(fetchSpy).toHaveBeenCalled()
  })
})

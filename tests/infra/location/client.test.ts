// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocationConsent, onLocationConsentChange, setLocationConsent } from '@/infra/location/client'

describe('location consent client utilities', () => {
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
  })

  it('tracks location consent changes', () => {
    const handler = vi.fn()
    const cleanup = onLocationConsentChange(handler)

    expect(getLocationConsent()).toBe('unset')

    setLocationConsent('granted')
    expect(getLocationConsent()).toBe('granted')
    expect(handler).toHaveBeenCalled()

    cleanup()
  })

  it('stores denied consent', () => {
    setLocationConsent('denied')
    expect(getLocationConsent()).toBe('denied')
  })
})

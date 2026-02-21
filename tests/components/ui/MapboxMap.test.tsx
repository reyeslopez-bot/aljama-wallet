// @vitest-environment jsdom

import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import MapboxMap from '@/components/ui/MapboxMap.client'
import { CONSENT_MODE_KEY } from '@/infra/consent/constants'

const locationState = vi.hoisted(() => ({
  consent: 'granted' as 'granted' | 'denied' | 'unset',
}))
const setLocationConsentMock = vi.hoisted(() => vi.fn())
const locationConsentListener = vi.hoisted(() => ({
  handler: null as null | (() => void),
}))

vi.mock('mapbox-gl', () => ({
  default: {
    Map: class {
      on = vi.fn()
      addControl = vi.fn()
      resize = vi.fn()
      getZoom = vi.fn(() => 10)
      flyTo = vi.fn()
      remove = vi.fn()
    },
    Marker: class {
      setLngLat = vi.fn(() => this)
      addTo = vi.fn(() => this)
    },
    NavigationControl: class {},
    accessToken: '',
  },
}))
vi.mock('@/infra/location/client', () => ({
  canUseGeolocation: () => true,
  getLocationConsent: () => locationState.consent,
  onLocationConsentChange: (handler: () => void) => {
    locationConsentListener.handler = handler
    return () => {
      if (locationConsentListener.handler === handler) {
        locationConsentListener.handler = null
      }
    }
  },
  setLocationConsent: setLocationConsentMock,
}))

describe('MapboxMap', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      value: {
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
      },
      configurable: true,
    })

    vi.clearAllMocks()
    locationState.consent = 'granted'
    locationConsentListener.handler = null
  })

  it('keeps Dubai jurisdiction until location consent flow has allowed tracking', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 20,
        },
        timestamp: 1700000000000,
      } as GeolocationPosition),
    )
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    })

    const { getByText, getAllByText } = render(<MapboxMap />)

    await waitFor(() => {
      expect(getCurrentPosition).not.toHaveBeenCalled()
      expect(getByText('Jurisdiction:')).toBeTruthy()
      expect(getAllByText('UAE - Dubai').length).toBeGreaterThan(0)
    })
  })

  it('requests geolocation when location button is clicked', async () => {
    window.localStorage.setItem('aljama.telemetry.consent', 'granted')
    window.localStorage.setItem(CONSENT_MODE_KEY, 'allowAll')

    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({
        coords: {
          latitude: 12.345678,
          longitude: 98.765432,
          accuracy: 15,
        },
        timestamp: 1700000000000,
      } as GeolocationPosition),
    )
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    })

    const { getByRole, getByText } = render(<MapboxMap />)
    act(() => {
      locationConsentListener.handler?.()
    })

    await waitFor(() => {
      const button = getByRole('button', { name: 'Use my location' }) as HTMLButtonElement
      expect(button.disabled).toBe(false)
    })

    fireEvent.click(getByRole('button', { name: 'Use my location' }))

    await waitFor(() => {
      expect(getCurrentPosition).toHaveBeenCalled()
      expect(getByText(/Centered at/)).toBeTruthy()
    })
  })

  it('keeps location button hidden behind permissions when consent is denied', () => {
    locationState.consent = 'denied'

    const { getByRole, queryByText } = render(<MapboxMap />)

    const button = getByRole('button', { name: 'Use my location' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(queryByText('Sign in to unlock actions.')).toBeNull()
  })
})

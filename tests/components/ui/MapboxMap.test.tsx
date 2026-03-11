// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import MapboxMap from '@/components/ui/MapboxMap.client'

vi.mock('mapbox-gl', () => ({
  default: {
    Map: class {
      on = vi.fn()
      addControl = vi.fn()
      resize = vi.fn()
      getZoom = vi.fn(() => 10)
      flyTo = vi.fn()
      remove = vi.fn()
      setStyle = vi.fn()
    },
    Marker: class {
      setLngLat = vi.fn(() => this)
      addTo = vi.fn(() => this)
    },
    NavigationControl: class {},
    accessToken: '',
  },
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
    Reflect.deleteProperty(navigator, 'connection')
  })

  it('keeps Dubai jurisdiction when network location falls back to default', async () => {
    window.localStorage.setItem('aljama.location.consent', 'granted')

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          location: {
            source: 'default',
            latitude: 25.204849,
            longitude: 55.270783,
            country: 'AE',
            region: null,
            city: 'Dubai',
            timezone: 'Asia/Dubai',
          },
        }),
      }),
    )

    const { getByTestId } = render(<MapboxMap />)

    await waitFor(() => {
      expect(getByTestId('mapbox-map-laws').textContent).toContain('Jurisdiction:')
      expect(getByTestId('mapbox-map-laws').textContent).toContain('UAE - Dubai')
    })
  })

  it('uses VPN/network location automatically when location is enabled', async () => {
    window.localStorage.setItem('aljama.location.consent', 'granted')

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        location: {
          source: 'network',
          latitude: 25.204849,
          longitude: 55.270783,
          country: 'AE',
          region: null,
          city: 'Dubai',
          timezone: 'Asia/Dubai',
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId } = render(<MapboxMap />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(getByTestId('mapbox-map-laws').textContent).toContain('UAE - Dubai')
    })
  })

  it('switches to lightweight mode when save-data is enabled', async () => {
    window.localStorage.setItem('aljama.location.consent', 'granted')
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: {
        saveData: true,
        effectiveType: '2g',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        location: {
          source: 'network',
          latitude: 25.204849,
          longitude: 55.270783,
          country: 'AE',
          region: null,
          city: 'Dubai',
          timezone: 'Asia/Dubai',
        },
      }),
    }))

    const { getByTestId, queryByTestId } = render(<MapboxMap />)

    await waitFor(() => {
      expect(getByTestId('mapbox-map-viewport').getAttribute('data-map-mode')).toBe('lightweight')
      expect(getByTestId('mapbox-map-status').textContent).toContain('Lightweight mode active')
    })

    expect(getByTestId('mapbox-map-static-fallback')).toBeTruthy()
    expect(queryByTestId('mapbox-map-overlay-loading')).toBeNull()
  })

  it('does not render manual location controls', async () => {
    window.localStorage.setItem('aljama.location.consent', 'granted')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        location: {
          source: 'network',
          latitude: 25.204849,
          longitude: 55.270783,
          country: 'AE',
          region: null,
          city: 'Dubai',
          timezone: 'Asia/Dubai',
        },
      }),
    }))

    const { queryByTestId } = render(<MapboxMap />)

    await waitFor(() => {
      expect(queryByTestId('mapbox-map-use-network-location')).toBeNull()
      expect(queryByTestId('mapbox-map-use-device-location')).toBeNull()
      expect(queryByTestId('mapbox-map-refresh')).toBeNull()
    })
  })

  it('shows fallback error when lookup fails', async () => {
    window.localStorage.setItem('aljama.location.consent', 'granted')

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const { getByTestId, queryByTestId } = render(<MapboxMap />)

    await waitFor(() => {
      expect(getByTestId('mapbox-map-status').textContent).toContain('Network location unavailable. Using Dubai fallback.')
    })
    expect(queryByTestId('mapbox-map-refresh')).toBeNull()
  })
})

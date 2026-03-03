// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
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

  it('refreshes using VPN/network location when the button is clicked', async () => {
    window.localStorage.setItem('aljama.location.consent', 'granted')

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          location: {
            source: 'network',
            latitude: 31.7683,
            longitude: 35.2137,
            country: 'IL',
            region: 'JM',
            city: 'Jerusalem',
            timezone: 'Asia/Jerusalem',
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId } = render(<MapboxMap />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(getByTestId('mapbox-map-refresh'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(getByTestId('mapbox-map-status').textContent).toMatch(/Centered at/)
      expect(getByTestId('mapbox-map-laws').textContent).toContain('Israel')
    })
  })

  it('shows fallback error and keeps action enabled when lookup fails', async () => {
    window.localStorage.setItem('aljama.location.consent', 'granted')

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const { getByTestId } = render(<MapboxMap />)

    await waitFor(() => {
      expect(getByTestId('mapbox-map-status').textContent).toContain('Network location unavailable. Using Dubai fallback.')
    })

    const button = getByTestId('mapbox-map-refresh') as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })
})

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

    const { getByText, getAllByText } = render(<MapboxMap />)

    await waitFor(() => {
      expect(getByText('Jurisdiction:')).toBeTruthy()
      expect(getAllByText('UAE - Dubai').length).toBeGreaterThan(0)
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

    const { getByRole, getByText, getAllByText } = render(<MapboxMap />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(getByRole('button', { name: 'Refresh location' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(getByText(/Centered at/)).toBeTruthy()
      expect(getAllByText('Israel').length).toBeGreaterThan(0)
    })
  })

  it('shows fallback error and keeps action enabled when lookup fails', async () => {
    window.localStorage.setItem('aljama.location.consent', 'granted')

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const { getByRole, getByText } = render(<MapboxMap />)

    await waitFor(() => {
      expect(getByText('Network location unavailable. Using Dubai fallback.')).toBeTruthy()
    })

    const button = getByRole('button', { name: 'Refresh location' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })
})

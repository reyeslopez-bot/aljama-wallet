// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import MapboxMap from '@/components/ui/MapboxMap.client'
import { useSession } from 'next-auth/react'

const locationState = vi.hoisted(() => ({
  consent: 'granted' as 'granted' | 'denied' | 'unset',
}))
const setLocationConsentMock = vi.hoisted(() => vi.fn())

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
  getLocationConsent: () => locationState.consent,
  onLocationConsentChange: () => () => {},
  setLocationConsent: setLocationConsentMock,
}))

const mockedUseSession = vi.mocked(useSession)

describe('MapboxMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    locationState.consent = 'granted'
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'test-user', email: 'test@example.com' } },
      status: 'authenticated',
    } as any)
  })

  it('requests location on mount and updates jurisdiction copy', async () => {
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

    const { getByText } = render(<MapboxMap />)

    await waitFor(() => {
      expect(getCurrentPosition).toHaveBeenCalled()
      expect(getByText('Detected jurisdiction:')).toBeTruthy()
      expect(getByText('United States')).toBeTruthy()
    })
  })

  it('requests geolocation when location button is clicked', async () => {
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

    fireEvent.click(getByRole('button', { name: 'Use my location' }))

    await waitFor(() => {
      expect(getCurrentPosition).toHaveBeenCalled()
      expect(getByText(/Centered at/)).toBeTruthy()
    })
  })

  it('disables location button when unauthenticated', () => {
    locationState.consent = 'denied'
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    } as any)

    const { getByRole, getByText } = render(<MapboxMap />)

    const button = getByRole('button', { name: 'Use my location' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(getByText('Sign in to unlock actions.')).toBeTruthy()
  })
})

// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import MapboxMap from '@/components/ui/MapboxMap.client'
import { useSession } from 'next-auth/react'

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

const mockedUseSession = vi.mocked(useSession)

describe('MapboxMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'test-user', email: 'test@example.com' } },
      status: 'authenticated',
    } as any)
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

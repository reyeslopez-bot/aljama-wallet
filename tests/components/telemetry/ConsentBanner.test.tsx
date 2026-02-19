// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import ConsentBanner from '@/components/telemetry/ConsentBanner.client'

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    status: 'authenticated',
    data: { user: { id: 'test-user' } },
  }),
}))

const telemetryState = vi.hoisted(() => ({
  consent: 'unset' as 'granted' | 'denied' | 'unset',
}))
const setTelemetryConsentMock = vi.hoisted(() => vi.fn())
const locationState = vi.hoisted(() => ({
  consent: 'unset' as 'granted' | 'denied' | 'unset',
}))
const setLocationConsentMock = vi.hoisted(() => vi.fn())

vi.mock('@/infra/telemetry/client', () => ({
  getTelemetryConsent: () => telemetryState.consent,
  setTelemetryConsent: setTelemetryConsentMock,
}))
vi.mock('@/infra/location/client', () => ({
  canUseGeolocation: () => true,
  getLocationConsent: () => locationState.consent,
  setLocationConsent: setLocationConsentMock,
}))

describe('ConsentBanner', () => {
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
    telemetryState.consent = 'unset'
    locationState.consent = 'unset'
    window.sessionStorage.clear()
  })

  it('allow all stores consent, requests geolocation, and dismisses the popup', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({
        coords: {
          latitude: 25.204849,
          longitude: 55.270783,
          accuracy: 20,
        },
        timestamp: 1700000000000,
      } as GeolocationPosition),
    )
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    })

    const { findByRole, queryByRole } = render(<ConsentBanner />)

    const accept = await findByRole('button', { name: 'Allow all' })
    fireEvent.click(accept)

    expect(setTelemetryConsentMock).toHaveBeenCalledWith('granted')
    expect(getCurrentPosition).toHaveBeenCalled()
    expect(setLocationConsentMock).toHaveBeenCalledWith('granted')

    await waitFor(() => {
      expect(queryByRole('button', { name: 'Allow all' })).toBeNull()
    })
  })

  it('reject all stores denied consent and dismisses the popup', async () => {
    const { findByRole, queryByRole } = render(<ConsentBanner />)

    fireEvent.click(await findByRole('button', { name: 'Reject all' }))

    expect(setTelemetryConsentMock).toHaveBeenCalledWith('denied')
    expect(setLocationConsentMock).toHaveBeenCalledWith('denied')

    await waitFor(() => {
      expect(queryByRole('button', { name: 'Reject all' })).toBeNull()
    })
  })

  it('essential only stores denied consent and dismisses the popup', async () => {
    const { findByRole, queryByRole } = render(<ConsentBanner />)

    fireEvent.click(await findByRole('button', { name: 'Essential only' }))

    expect(setTelemetryConsentMock).toHaveBeenCalledWith('denied')
    expect(setLocationConsentMock).toHaveBeenCalledWith('denied')

    await waitFor(() => {
      expect(queryByRole('button', { name: 'Essential only' })).toBeNull()
    })
  })
})

// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import ConsentBanner from '@/components/telemetry/ConsentBanner.client'

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
  getLocationConsent: () => locationState.consent,
  setLocationConsent: setLocationConsentMock,
}))

describe('ConsentBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    telemetryState.consent = 'unset'
    locationState.consent = 'unset'
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

    const { getByRole, queryByRole } = render(<ConsentBanner />)

    const accept = getByRole('button', { name: 'Allow all' })
    fireEvent.click(accept)

    expect(setTelemetryConsentMock).toHaveBeenCalledWith('granted')
    expect(getCurrentPosition).toHaveBeenCalled()
    expect(setLocationConsentMock).toHaveBeenCalledWith('granted')

    await waitFor(() => {
      expect(queryByRole('button', { name: 'Allow all' })).toBeNull()
    })
  })

  it('reject all stores denied consent and dismisses the popup', async () => {
    const { getByRole, queryByRole } = render(<ConsentBanner />)

    fireEvent.click(getByRole('button', { name: 'Reject all' }))

    expect(setTelemetryConsentMock).toHaveBeenCalledWith('denied')
    expect(setLocationConsentMock).toHaveBeenCalledWith('denied')

    await waitFor(() => {
      expect(queryByRole('button', { name: 'Reject all' })).toBeNull()
    })
  })

  it('essential only stores denied consent and dismisses the popup', async () => {
    const { getByRole, queryByRole } = render(<ConsentBanner />)

    fireEvent.click(getByRole('button', { name: 'Essential only' }))

    expect(setTelemetryConsentMock).toHaveBeenCalledWith('denied')
    expect(setLocationConsentMock).toHaveBeenCalledWith('denied')

    await waitFor(() => {
      expect(queryByRole('button', { name: 'Essential only' })).toBeNull()
    })
  })
})

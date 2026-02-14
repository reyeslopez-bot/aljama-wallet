// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import ConsentBanner from '@/components/telemetry/ConsentBanner.client'

const telemetryState = vi.hoisted(() => ({
  consent: 'unset' as 'granted' | 'denied' | 'unset',
}))
const setTelemetryConsentMock = vi.hoisted(() => vi.fn())

vi.mock('@/infra/telemetry/client', () => ({
  getTelemetryConsent: () => telemetryState.consent,
  setTelemetryConsent: setTelemetryConsentMock,
}))

describe('ConsentBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    telemetryState.consent = 'unset'
  })

  it('accept button stores consent and dismisses the banner', async () => {
    const { getByRole, queryByRole } = render(<ConsentBanner />)

    const accept = getByRole('button', { name: 'Accept' })
    fireEvent.click(accept)

    expect(setTelemetryConsentMock).toHaveBeenCalledWith('granted')

    await waitFor(() => {
      expect(queryByRole('button', { name: 'Accept' })).toBeNull()
    })
  })

  it('decline button stores consent and dismisses the banner', async () => {
    const { getByRole, queryByRole } = render(<ConsentBanner />)

    fireEvent.click(getByRole('button', { name: 'Decline' }))

    expect(setTelemetryConsentMock).toHaveBeenCalledWith('denied')

    await waitFor(() => {
      expect(queryByRole('button', { name: 'Decline' })).toBeNull()
    })
  })
})


// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigationState = vi.hoisted(() => ({
  pathname: '/en',
  search: '',
}))

const telemetryMocks = vi.hoisted(() => ({
  sendTelemetryEvent: vi.fn().mockResolvedValue(undefined),
  getBasicContext: vi.fn(() => ({
    timezone: 'UTC',
    language: 'en',
  })),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
  useSearchParams: () => new URLSearchParams(navigationState.search),
}))

vi.mock('@/infra/telemetry/client', () => ({
  getTelemetryConsent: () => 'granted',
  onTelemetryConsentChange: () => () => {},
  getDeviceId: () => 'device-1',
  getSessionId: () => 'session-1',
  getBasicContext: telemetryMocks.getBasicContext,
  sendTelemetryEvent: telemetryMocks.sendTelemetryEvent,
}))

vi.mock('@/infra/location/client', () => ({
  getLocationConsent: () => 'granted',
}))

import TelemetryProvider from '@/components/telemetry/TelemetryProvider.client'

describe('TelemetryProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigationState.pathname = '/en'
    navigationState.search = ''
    telemetryMocks.getBasicContext.mockReturnValue({
      timezone: 'UTC',
      language: 'en',
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
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
      }),
    )
  })

  it('bootstraps session telemetry once and avoids repeated network-location fetches across route changes', async () => {
    const { rerender } = render(
      <TelemetryProvider>
        <div>child</div>
      </TelemetryProvider>,
    )

    await waitFor(() => {
      expect(
        telemetryMocks.sendTelemetryEvent.mock.calls.some((call) => call[0]?.event === 'session_start'),
      ).toBe(true)
      expect(
        telemetryMocks.sendTelemetryEvent.mock.calls.some((call) => call[0]?.event === 'page_view'),
      ).toBe(true)
    })

    navigationState.pathname = '/en/login'
    navigationState.search = 'mode=login'

    rerender(
      <TelemetryProvider>
        <div>child</div>
      </TelemetryProvider>,
    )

    await waitFor(() => {
      expect(
        telemetryMocks.sendTelemetryEvent.mock.calls.filter((call) => call[0]?.event === 'page_view'),
      ).toHaveLength(2)
    })

    expect(
      telemetryMocks.sendTelemetryEvent.mock.calls.filter((call) => call[0]?.event === 'session_start'),
    ).toHaveLength(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TelemetryContext } from '@/components/telemetry/TelemetryProvider.client'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'

function Probe({
  name,
  payload,
}: {
  name: string
  payload?: Record<string, unknown>
}) {
  useComponentTelemetry(name, payload)
  return <div>probe</div>
}

describe('useComponentTelemetry', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('does not emit extra component lifecycle events on rerender', () => {
    const track = vi.fn()

    const { rerender, unmount } = render(
      <TelemetryContext.Provider value={{ consent: 'granted', track }}>
        <Probe name="TestPanel" payload={{ variant: 'a' }} />
      </TelemetryContext.Provider>,
    )

    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenNthCalledWith(1, 'component_view', {
      name: 'TestPanel',
      variant: 'a',
    })

    rerender(
      <TelemetryContext.Provider value={{ consent: 'granted', track }}>
        <Probe name="TestPanel" payload={{ variant: 'b' }} />
      </TelemetryContext.Provider>,
    )

    expect(track).toHaveBeenCalledTimes(1)

    unmount()

    expect(track).toHaveBeenCalledTimes(2)
    expect(track.mock.calls[1]?.[0]).toBe('component_time')
    expect(track.mock.calls[1]?.[1]).toMatchObject({
      name: 'TestPanel',
      variant: 'b',
    })
    expect(typeof track.mock.calls[1]?.[1]?.durationMs).toBe('number')
  })
})

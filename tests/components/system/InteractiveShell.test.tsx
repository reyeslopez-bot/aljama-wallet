// @vitest-environment jsdom

import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InteractiveShell from '@/components/system/InteractiveShell.client'

describe('InteractiveShell', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('removes the loading status if animation frames never complete', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const { queryByTestId, getByTestId } = render(
      <InteractiveShell
        rootTestId="shell"
        loadingTestId="shell-loading"
        loadingTitle="Loading"
        loadingHint="Please wait"
      >
        <button>Ready action</button>
      </InteractiveShell>,
    )

    expect(getByTestId('shell-loading')).toBeTruthy()
    expect(getByTestId('shell').getAttribute('aria-busy')).toBe('true')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500)
    })

    expect(queryByTestId('shell-loading')).toBeNull()
    expect(getByTestId('shell').getAttribute('aria-busy')).toBe('false')
  })
})

// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import HomeConsentGate from '@/components/home/HomeConsentGate.client'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

describe('HomeConsentGate', () => {
  beforeEach(() => {
    const localStore = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      value: {
        get length() {
          return localStore.size
        },
        clear() {
          localStore.clear()
        },
        getItem(key: string) {
          return localStore.has(key) ? localStore.get(key)! : null
        },
        key(index: number) {
          return Array.from(localStore.keys())[index] ?? null
        },
        removeItem(key: string) {
          localStore.delete(key)
        },
        setItem(key: string, value: string) {
          localStore.set(key, String(value))
        },
      },
      configurable: true,
    })
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('redirects to locale login when permissions are not answered', async () => {
    const { queryByText } = render(
      <HomeConsentGate>
        <div>home-content</div>
      </HomeConsentGate>,
    )

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/en/login?mode=register')
    })
    expect(queryByText('home-content')).toBeNull()
  })

  it('renders children when permissions were already answered', async () => {
    window.localStorage.setItem('aljama.telemetry.consent', 'denied')
    window.localStorage.setItem('aljama.location.consent', 'denied')

    const { queryByText } = render(
      <HomeConsentGate>
        <div>home-content</div>
      </HomeConsentGate>,
    )

    await waitFor(() => {
      expect(queryByText('home-content')).not.toBeNull()
    })
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})

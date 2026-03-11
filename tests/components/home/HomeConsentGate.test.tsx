// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import HomeConsentGate from '@/components/home/HomeConsentGate.client'
import {
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from '@/infra/consent/constants'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  pathname: '/en',
  search: '',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
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

    const sessionStore = new Map<string, string>()
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        get length() {
          return sessionStore.size
        },
        clear() {
          sessionStore.clear()
        },
        getItem(key: string) {
          return sessionStore.has(key) ? sessionStore.get(key)! : null
        },
        key(index: number) {
          return Array.from(sessionStore.keys())[index] ?? null
        },
        removeItem(key: string) {
          sessionStore.delete(key)
        },
        setItem(key: string, value: string) {
          sessionStore.set(key, String(value))
        },
      },
      configurable: true,
    })

    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
    mocks.pathname = '/en'
    mocks.search = ''
  })

  it('redirects to the consent route when session consent is not answered', async () => {
    const { queryByText, queryByTestId } = render(
      <HomeConsentGate>
        <div>home-content</div>
      </HomeConsentGate>,
    )

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/en/consent?next=%2Fen')
      expect(queryByText('home-content')).toBeNull()
    })
    expect(queryByTestId('consent-gate-root')).toBeNull()
  })

  it('preserves the current query string when redirecting to consent', async () => {
    window.localStorage.setItem('aljama.telemetry.consent', 'denied')
    window.localStorage.setItem('aljama.location.consent', 'denied')
    window.sessionStorage.setItem(CONSENT_PROMPT_SESSION_KEY, 'seen')
    mocks.pathname = '/en/compliance'
    mocks.search = 'source=nav'

    const { queryByText, queryByTestId } = render(
      <HomeConsentGate>
        <div>home-content</div>
      </HomeConsentGate>,
    )

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/en/consent?next=%2Fen%2Fcompliance%3Fsource%3Dnav')
      expect(queryByText('home-content')).toBeNull()
    })
    expect(queryByTestId('consent-gate-root')).toBeNull()
  })

  it('renders children when permissions were answered in this session', async () => {
    window.localStorage.setItem('aljama.telemetry.consent', 'denied')
    window.localStorage.setItem('aljama.location.consent', 'denied')
    window.sessionStorage.setItem(CONSENT_PROMPT_SESSION_KEY, 'seen')
    window.sessionStorage.setItem(CONSENT_SITE_ENTRY_SESSION_KEY, 'seen')

    const { queryByText, queryByTestId } = render(
      <HomeConsentGate>
        <div>home-content</div>
      </HomeConsentGate>,
    )

    await waitFor(() => {
      expect(queryByText('home-content')).not.toBeNull()
    })
    expect(queryByTestId('consent-gate-root')).toBeNull()
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})

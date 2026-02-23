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
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => mocks.pathname,
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
  })

  it('shows secure gate when session consent is not answered', async () => {
    const { queryByText, getByTestId } = render(
      <HomeConsentGate>
        <div>home-content</div>
      </HomeConsentGate>,
    )

    await waitFor(() => {
      expect(getByTestId('consent-gate-root')).toBeTruthy()
    })
    expect(queryByText('home-content')).toBeNull()
  })

  it('still gates when consent exists but continue-to-site was not completed', async () => {
    window.localStorage.setItem('aljama.telemetry.consent', 'denied')
    window.localStorage.setItem('aljama.location.consent', 'denied')
    window.sessionStorage.setItem(CONSENT_PROMPT_SESSION_KEY, 'seen')

    const { queryByText, getByTestId } = render(
      <HomeConsentGate>
        <div>home-content</div>
      </HomeConsentGate>,
    )

    await waitFor(() => {
      expect(getByTestId('consent-gate-root')).toBeTruthy()
    })
    expect(queryByText('home-content')).toBeNull()
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
  })
})

// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ConsentEntryGate from '@/components/home/ConsentEntryGate.client'
import { createHuman, HUMAN_DELAYS } from '@/tests/helpers/human'
import {
  CONSENT_MODE_KEY,
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from '@/infra/consent/constants'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  pathname: '/en/consent',
  search: 'next=%2Fen%2Fcompliance',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

describe('ConsentEntryGate', () => {
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
    mocks.pathname = '/en/consent'
    mocks.search = 'next=%2Fen%2Fcompliance'
  })

  it('continues to the requested site route after saving consent', async () => {
    const human = createHuman()
    const { getByTestId } = render(<ConsentEntryGate />)

    await human.click(getByTestId('consent-gate-continue'), HUMAN_DELAYS.mediumSettle)

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith('/en/compliance')
    })

    expect(localStorage.getItem('aljama.telemetry.consent')).toBe('denied')
    expect(localStorage.getItem('aljama.location.consent')).toBe('denied')
    expect(localStorage.getItem(CONSENT_MODE_KEY)).toBe('essentialOnly')
    expect(sessionStorage.getItem(CONSENT_PROMPT_SESSION_KEY)).toBe('seen')
    expect(sessionStorage.getItem(CONSENT_SITE_ENTRY_SESSION_KEY)).toBe('seen')
  })

  it('rewrites the next target when switching locale', async () => {
    const human = createHuman()
    const { getByRole } = render(<ConsentEntryGate />)

    await human.click(getByRole('button', { name: 'HE' }), HUMAN_DELAYS.mediumSettle)

    expect(mocks.push).toHaveBeenCalledWith('/he/consent?next=%2Fhe%2Fcompliance')
  })

  it('renders the guided start flow above the permissions controls', () => {
    const { getByTestId } = render(<ConsentEntryGate />)

    expect(getByTestId('consent-gate-start-flow')).toBeTruthy()
  })
})

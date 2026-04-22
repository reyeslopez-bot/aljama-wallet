// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ConsentEntryGate from '@/components/home/ConsentEntryGate.client'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import { createHuman, HUMAN_DELAYS } from '@/tests/helpers/human'
import {
  CONSENT_MODE_KEY,
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from '@/infra/consent/constants'
import { useSession } from 'next-auth/react'
import { useConnection } from 'wagmi'

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

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}))

vi.mock('wagmi', () => ({
  useConnection: vi.fn(),
}))

const mockedUseSession = vi.mocked(useSession)
const mockedUseConnection = vi.mocked(useConnection)
const initialState = useDynamicInfoStore.getState()

const resetStore = () => {
  useDynamicInfoStore.setState(
    {
      ...initialState,
      wallet: { ...initialState.wallet },
    },
    true,
  )
}

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
    resetStore()
    mocks.pathname = '/en/consent'
    mocks.search = 'next=%2Fen%2Fcompliance'
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    } as any)
    mockedUseConnection.mockReturnValue({
      address: undefined,
      isConnected: false,
      chain: undefined,
      connector: undefined,
    } as any)
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

  it('keeps the consent surface free of language-switch buttons', () => {
    const { queryByRole } = render(<ConsentEntryGate />)

    expect(queryByRole('button', { name: 'EN' })).toBeNull()
    expect(queryByRole('button', { name: 'HE' })).toBeNull()
    expect(queryByRole('button', { name: 'AR' })).toBeNull()
  })

  it('renders a simple next-steps explainer above the permissions controls', () => {
    const { getByTestId } = render(<ConsentEntryGate />)

    expect(getByTestId('consent-gate-next-steps')).toBeTruthy()
  })

  it('hides the auth prompt when the site session already exists', () => {
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      status: 'authenticated',
    } as any)

    const { queryByRole } = render(<ConsentEntryGate />)

    expect(queryByRole('button', { name: 'Sign in' })).toBeNull()
  })

  it('hides the onboarding explainer when session and wallet are already ready', () => {
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      status: 'authenticated',
    } as any)
    mockedUseConnection.mockReturnValue({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chain: { id: 1, name: 'Ethereum' },
      connector: { name: 'MetaMask' },
    } as any)

    const { queryByTestId } = render(<ConsentEntryGate />)

    expect(queryByTestId('consent-gate-next-steps')).toBeNull()
  })
})

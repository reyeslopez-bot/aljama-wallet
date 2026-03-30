// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from 'next-auth/react'
import HomeStageShell from '@/components/home/HomeStageShell.client'
import {
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from '@/infra/consent/constants'

const mocks = vi.hoisted(() => ({
  search: '',
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}))

vi.mock('@/components/home/LoginGate', () => ({
  default: ({
    initialMode,
    variant,
  }: {
    initialMode?: 'login' | 'register'
    variant?: 'page' | 'inline'
  }) => <div data-testid="mock-login-gate" data-mode={initialMode} data-variant={variant} />,
}))

vi.mock('@/components/home/ConsentEntryGate.client', () => ({
  default: ({ variant }: { variant?: 'page' | 'inline' }) => (
    <div data-testid="mock-consent-gate" data-variant={variant} />
  ),
}))

const mockedUseSession = vi.mocked(useSession)

function installStorage() {
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
}

describe('HomeStageShell', () => {
  beforeEach(() => {
    installStorage()
    localStorage.clear()
    sessionStorage.clear()
    mocks.search = ''
    vi.clearAllMocks()
  })

  it('renders the inline login gate on the home page when the user is unauthenticated', async () => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    } as any)
    mocks.search = 'mode=login'

    const { getByTestId } = render(
      <HomeStageShell>
        <div>workspace</div>
      </HomeStageShell>,
    )

    await waitFor(() => {
      expect(getByTestId('home-stage-workspace').getAttribute('data-stage')).toBe('locked')
    })

    expect(getByTestId('mock-login-gate').getAttribute('data-mode')).toBe('login')
    expect(getByTestId('mock-login-gate').getAttribute('data-variant')).toBe('inline')
    expect(getByTestId('home-stage-workspace').className).not.toContain('pointer-events-none')
    expect(getByTestId('home-stage-workspace').className).not.toContain('opacity-60')
  })

  it('renders the inline consent gate after authentication when permissions are still unanswered', async () => {
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'authenticated',
    } as any)

    const { getByTestId, queryByTestId } = render(
      <HomeStageShell>
        <div>workspace</div>
      </HomeStageShell>,
    )

    await waitFor(() => {
      expect(getByTestId('home-stage-workspace').getAttribute('data-stage')).toBe('consent-required')
    })

    expect(getByTestId('mock-consent-gate').getAttribute('data-variant')).toBe('inline')
    expect(queryByTestId('mock-login-gate')).toBeNull()
    expect(getByTestId('home-stage-workspace').className).toContain('pointer-events-none')
    expect(getByTestId('home-stage-workspace').className).toContain('opacity-60')
  })

  it('unlocks the wallet workspace once consent is already answered', async () => {
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'authenticated',
    } as any)
    localStorage.setItem('aljama.telemetry.consent', 'denied')
    localStorage.setItem('aljama.location.consent', 'denied')
    sessionStorage.setItem(CONSENT_PROMPT_SESSION_KEY, 'seen')
    sessionStorage.setItem(CONSENT_SITE_ENTRY_SESSION_KEY, 'seen')

    const { getByTestId, queryByTestId } = render(
      <HomeStageShell>
        <div>workspace</div>
      </HomeStageShell>,
    )

    await waitFor(() => {
      expect(getByTestId('home-stage-workspace').getAttribute('data-stage')).toBe('wallet-ready')
    })

    expect(queryByTestId('mock-login-gate')).toBeNull()
    expect(queryByTestId('mock-consent-gate')).toBeNull()
    expect(getByTestId('home-stage-workspace').className).toBe('')
  })
})

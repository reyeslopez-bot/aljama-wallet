// @vitest-environment jsdom

import { render, waitFor, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { signIn } from 'next-auth/react'
import { createHuman, HUMAN_DELAYS } from '@/tests/helpers/human'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  pathname: '/en/login',
  search: '',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

import LoginGate from '@/components/home/LoginGate'

const mockedSignIn = vi.mocked(signIn)

describe('LoginGate', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/en/login')

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

    vi.clearAllMocks()
    mocks.pathname = '/en/login'
    mocks.search = ''
    mockedSignIn.mockResolvedValue({ error: null, ok: true } as any)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('switches locale path when language buttons are clicked', async () => {
    const human = createHuman()
    const { getByRole } = render(<LoginGate showBackLink={false} />)

    await human.click(getByRole('button', { name: 'HE' }), HUMAN_DELAYS.mediumSettle)
    await human.click(getByRole('button', { name: 'AR' }), HUMAN_DELAYS.mediumSettle)

    expect(mocks.push).toHaveBeenNthCalledWith(1, '/he/login')
    expect(mocks.push).toHaveBeenNthCalledWith(2, '/ar/login')
  })

  it('preserves the auth mode query when switching locale', async () => {
    const human = createHuman()
    mocks.search = 'mode=login'
    window.history.replaceState({}, '', '/en/login?mode=login')

    const { getByRole } = render(<LoginGate showBackLink={false} initialMode="login" />)

    await human.click(getByRole('button', { name: 'HE' }), HUMAN_DELAYS.mediumSettle)

    expect(mocks.push).toHaveBeenCalledWith('/he/login?mode=login')
  })

  it('shows sign-up subtitle in register mode', () => {
    const { getByText } = render(<LoginGate showBackLink={false} initialMode="register" />)
    expect(getByText('Sign up to continue.')).toBeTruthy()
  })

  it('shows close button and closes to locale home', async () => {
    const human = createHuman()
    const { getByLabelText } = render(<LoginGate showBackLink={false} />)

    await human.click(getByLabelText('Return to Home'), HUMAN_DELAYS.mediumSettle)

    expect(mocks.replace).toHaveBeenCalledWith('/en')
  })

  it('closes correctly when rendered in explicit login mode', async () => {
    const human = createHuman()
    window.history.replaceState({}, '', '/en/login?mode=login')

    const { getByLabelText } = render(<LoginGate showBackLink={false} initialMode="login" />)

    await human.click(getByLabelText('Return to Home'), HUMAN_DELAYS.mediumSettle)

    expect(mocks.replace).toHaveBeenCalledWith('/en')
  })

  it('does not auto-redirect away on initial render', () => {
    render(<LoginGate showBackLink={false} initialMode="login" />)

    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('falls back to a hard navigation when router.replace throws', async () => {
    const human = createHuman()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mocks.replace.mockImplementation(() => {
      throw new TypeError('Failed to fetch')
    })

    const { getByLabelText } = render(<LoginGate showBackLink={false} initialMode="login" />)

    await expect(
      human.click(getByLabelText('Return to Home'), HUMAN_DELAYS.mediumSettle),
    ).resolves.toBeUndefined()

    expect(mocks.replace).toHaveBeenCalledWith('/en')
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('[login-gate:navigate] Failed to fetch')
  })

  it('prefers the explicit onClose handler over router navigation', async () => {
    const human = createHuman()
    const onClose = vi.fn()
    const { getByLabelText } = render(<LoginGate showBackLink={false} onClose={onClose} />)
    const replaceCallsBeforeClick = mocks.replace.mock.calls.length

    await human.click(getByLabelText('Return to Home'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledTimes(replaceCallsBeforeClick)
  })

  it('does not render permissions controls on auth gate', () => {
    const { queryByTestId, queryByRole, queryByText } = render(<LoginGate showBackLink={false} />)

    expect(queryByTestId('secure-gate-permissions')).toBeNull()
    expect(queryByTestId('secure-gate-continue-guest')).toBeNull()
    expect(queryByRole('switch')).toBeNull()
    expect(queryByText('Allow all')).toBeNull()
    expect(queryByText('Essential only')).toBeNull()
  })

  it('toggles password visibility button', async () => {
    const human = createHuman()
    const { getByLabelText, getByPlaceholderText } = render(<LoginGate showBackLink={false} />)

    const password = getByPlaceholderText('••••••••') as HTMLInputElement
    expect(password.type).toBe('password')

    await human.click(getByLabelText('Show password'))
    expect(password.type).toBe('text')

    await human.click(getByLabelText('Hide password'))
    expect(password.type).toBe('password')
  })

  it('toggles between login and register modes when the auth mode link is clicked', async () => {
    const human = createHuman()
    window.history.replaceState({}, '', '/en/login?mode=login')
    const { getByTestId, queryByTestId } = render(<LoginGate showBackLink={false} initialMode="login" />)

    const modeSwitch = getByTestId('secure-gate-auth-mode-switch')
    await human.click(within(modeSwitch).getByRole('button', { name: 'Sign up' }), HUMAN_DELAYS.mediumSettle)

    expect(queryByTestId('secure-gate-identifier-input')).toBeNull()
    expect(getByTestId('secure-gate-username-input')).toBeTruthy()
    expect(getByTestId('secure-gate-email-input')).toBeTruthy()

    await human.click(within(modeSwitch).getByRole('button', { name: 'Sign in' }), HUMAN_DELAYS.mediumSettle)

    expect(getByTestId('secure-gate-identifier-input')).toBeTruthy()
    expect(queryByTestId('secure-gate-username-input')).toBeNull()
    expect(queryByTestId('secure-gate-email-input')).toBeNull()
  })

  it('does not submit the login form when the sign-in button is disabled', async () => {
    const human = createHuman()
    window.history.replaceState({}, '', '/en/login?mode=login')
    const { getByTestId } = render(<LoginGate showBackLink={false} initialMode="login" />)

    const submitButton = getByTestId('secure-gate-auth-submit') as HTMLButtonElement
    expect(submitButton.disabled).toBe(true)

    await human.click(submitButton)

    expect(mockedSignIn).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('calls onBack when the back link is clicked', async () => {
    const human = createHuman()
    const onBack = vi.fn()
    const { getByRole } = render(<LoginGate onBack={onBack} />)

    await human.click(getByRole('button', { name: 'Return to Home' }))

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('shows an inline error when sign in returns invalid credentials', async () => {
    const human = createHuman()
    mockedSignIn.mockResolvedValue({ error: 'CredentialsSignin', ok: false } as any)
    window.history.replaceState({}, '', '/en/login?mode=login')

    const { getByPlaceholderText, getByRole, findByText } = render(
      <LoginGate showBackLink={false} initialMode="login" />,
    )

    await human.type(getByPlaceholderText('username or you@company.com'), 'user@example.com')
    await human.type(getByPlaceholderText('••••••••'), 'WrongPassword123!')
    await human.click(getByRole('button', { name: 'Sign in' }), HUMAN_DELAYS.mediumSettle)

    expect(await findByText('Login failed.')).toBeTruthy()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('shows a service error when sign in throws instead of returning a result', async () => {
    const human = createHuman()
    mockedSignIn.mockRejectedValue(new TypeError('Failed to fetch'))
    window.history.replaceState({}, '', '/en/login?mode=login')

    const { getByPlaceholderText, getByRole, findByText } = render(
      <LoginGate showBackLink={false} initialMode="login" />,
    )

    await human.type(getByPlaceholderText('username or you@company.com'), 'user@example.com')
    await human.type(getByPlaceholderText('••••••••'), 'AnyPassword123!')
    await human.click(getByRole('button', { name: 'Sign in' }), HUMAN_DELAYS.mediumSettle)

    expect(await findByText('Sign-in is temporarily unavailable. Try again.')).toBeTruthy()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('uses onUnlock instead of calling signIn when a custom unlock handler is provided', async () => {
    const human = createHuman()
    const onUnlock = vi.fn()
    window.history.replaceState({}, '', '/en/login?mode=login')

    const { getByPlaceholderText, getByRole } = render(
      <LoginGate showBackLink={false} initialMode="login" onUnlock={onUnlock} />,
    )

    await human.type(getByPlaceholderText('username or you@company.com'), 'desk@example.com')
    await human.type(getByPlaceholderText('••••••••'), 'AnyPassword123!')
    await human.click(getByRole('button', { name: 'Sign in' }), HUMAN_DELAYS.mediumSettle)

    expect(onUnlock).toHaveBeenCalledWith({
      identifier: 'desk@example.com',
      password: 'AnyPassword123!',
    })
    expect(mockedSignIn).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('submits login form when sign-in button is enabled', async () => {
    const human = createHuman()
    window.history.replaceState({}, '', '/en/login?mode=login')
    const { getByPlaceholderText, getByRole } = render(
      <LoginGate showBackLink={false} initialMode="login" />,
    )

    await human.type(getByPlaceholderText('username or you@company.com'), 'user@example.com')
    await human.type(getByPlaceholderText('••••••••'), 'AnyPassword123!')

    await human.click(getByRole('button', { name: 'Sign in' }), HUMAN_DELAYS.mediumSettle)

    await waitFor(() => {
      expect(mockedSignIn).toHaveBeenCalledWith('credentials', {
        identifier: 'user@example.com',
        password: 'AnyPassword123!',
        redirect: false,
      })
      expect(mocks.push).toHaveBeenCalledWith('/en')
    }, { timeout: 800 })
  })

  it('submits register flow and then signs in', async () => {
    const human = createHuman()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getByRole, getByPlaceholderText } = render(
      <LoginGate showBackLink={false} initialMode="register" />,
    )

    await human.type(getByPlaceholderText('wallet_operator'), 'new_operator')
    await human.type(getByPlaceholderText('you@company.com'), 'newuser@example.com')
    await human.type(getByPlaceholderText('••••••••'), 'VeryStrongPassphrase1!')

    await human.click(getByRole('button', { name: 'Sign up' }), HUMAN_DELAYS.mediumSettle)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/register', expect.any(Object))
      expect(mockedSignIn).toHaveBeenCalledWith('credentials', {
        identifier: 'new_operator',
        password: 'VeryStrongPassphrase1!',
        redirect: false,
      })
      expect(mocks.push).toHaveBeenCalledWith('/en')
    }, { timeout: 1000 })

    const registerPayload = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(registerPayload).toMatchObject({
      username: 'new_operator',
      email: 'newuser@example.com',
    })
  })

  it('shows a rate-limit message when sign up is throttled', async () => {
    const human = createHuman()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ code: 'rate_limited', error: 'RATE_LIMITED' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getByRole, getByPlaceholderText, findByText } = render(
      <LoginGate showBackLink={false} initialMode="register" />,
    )

    await human.type(getByPlaceholderText('wallet_operator'), 'limited_user')
    await human.type(getByPlaceholderText('••••••••'), 'VeryStrongPassphrase1!')
    await human.click(getByRole('button', { name: 'Sign up' }), HUMAN_DELAYS.mediumSettle)

    expect(await findByText('Too many attempts. Wait a minute and try again.')).toBeTruthy()
    expect(mockedSignIn).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('shows a service error when sign up request throws', async () => {
    const human = createHuman()
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const { getByRole, getByPlaceholderText, findByText } = render(
      <LoginGate showBackLink={false} initialMode="register" />,
    )

    await human.type(getByPlaceholderText('wallet_operator'), 'network_user')
    await human.type(getByPlaceholderText('••••••••'), 'VeryStrongPassphrase1!')
    await human.click(getByRole('button', { name: 'Sign up' }), HUMAN_DELAYS.mediumSettle)

    expect(await findByText('Registration is temporarily unavailable. Try again.')).toBeTruthy()
    expect(mockedSignIn).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('allows sign up with username and password only (email optional)', async () => {
    const human = createHuman()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getByRole, getByPlaceholderText, queryByText } = render(
      <LoginGate showBackLink={false} initialMode="register" />,
    )

    await human.type(getByPlaceholderText('wallet_operator'), 'noemailuser')
    await human.type(getByPlaceholderText('••••••••'), 'VeryStrongPassphrase1!')

    await human.click(getByRole('button', { name: 'Sign up' }), HUMAN_DELAYS.mediumSettle)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/register', expect.any(Object))
      expect(mockedSignIn).toHaveBeenCalledWith('credentials', {
        identifier: 'noemailuser',
        password: 'VeryStrongPassphrase1!',
        redirect: false,
      })
    }, { timeout: 1000 })

    expect(queryByText('Enter a valid email address.')).toBeNull()
  })
})

// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { signIn } from 'next-auth/react'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: '/en/login',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => mocks.pathname,
}))

import LoginGate from '@/components/home/LoginGate'

const mockedSignIn = vi.mocked(signIn)

describe('LoginGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.pathname = '/en/login'
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

  it('switches locale path when language buttons are clicked', () => {
    const { getByRole } = render(<LoginGate showBackLink={false} />)

    fireEvent.click(getByRole('button', { name: 'HE' }))
    fireEvent.click(getByRole('button', { name: 'AR' }))

    expect(mocks.push).toHaveBeenNthCalledWith(1, '/he/login')
    expect(mocks.push).toHaveBeenNthCalledWith(2, '/ar/login')
  })

  it('closes to locale home when close button is clicked', () => {
    const { getByLabelText } = render(<LoginGate showBackLink={false} />)

    fireEvent.click(getByLabelText('Return to Home'))

    expect(mocks.push).toHaveBeenCalledWith('/en')
  })

  it('toggles password visibility button', () => {
    const { getByLabelText, getByPlaceholderText } = render(<LoginGate showBackLink={false} />)

    const password = getByPlaceholderText('••••••••') as HTMLInputElement
    expect(password.type).toBe('password')

    fireEvent.click(getByLabelText('Show password'))
    expect(password.type).toBe('text')

    fireEvent.click(getByLabelText('Hide password'))
    expect(password.type).toBe('password')
  })

  it('submits login form when sign-in button is enabled', async () => {
    const { getByPlaceholderText, getByRole } = render(<LoginGate showBackLink={false} />)

    fireEvent.change(getByPlaceholderText('you@company.com'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(getByPlaceholderText('••••••••'), {
      target: { value: 'AnyPassword123!' },
    })

    fireEvent.click(getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(mockedSignIn).toHaveBeenCalledWith('credentials', {
        email: 'user@example.com',
        password: 'AnyPassword123!',
        redirect: false,
      })
      expect(mocks.push).toHaveBeenCalledWith('/en')
    })
  })

  it('submits register flow and then signs in', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getByRole, getByPlaceholderText } = render(<LoginGate showBackLink={false} />)

    fireEvent.click(getByRole('button', { name: 'Need an invite? Sign up' }))

    fireEvent.change(getByPlaceholderText('you@company.com'), {
      target: { value: 'newuser@example.com' },
    })
    fireEvent.change(getByPlaceholderText('••••••••'), {
      target: { value: 'VeryStrongPassphrase1!' },
    })
    fireEvent.change(getByPlaceholderText('demo-invite'), {
      target: { value: 'demo-invite' },
    })

    fireEvent.click(getByRole('button', { name: 'Sign up' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/register', expect.any(Object))
      expect(mockedSignIn).toHaveBeenCalledWith('credentials', {
        email: 'newuser@example.com',
        password: 'VeryStrongPassphrase1!',
        redirect: false,
      })
      expect(mocks.push).toHaveBeenCalledWith('/en')
    })
  })
})

// @vitest-environment jsdom

import React from 'react'
import { render } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import HomeActionButtons from '@/components/home/HomeActionButtons.client'
import { useSession } from 'next-auth/react'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ whileHover, whileTap, transition, ...props }: React.ComponentProps<'div'> & {
      whileHover?: unknown
      whileTap?: unknown
      transition?: unknown
    }) => React.createElement('div', props),
  },
}))

const mockedUseSession = vi.mocked(useSession)

describe('HomeActionButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      status: 'authenticated',
    } as any)
  })

  it('renders all CTA links and href targets when authenticated', () => {
    const { getByRole, queryByText } = render(<HomeActionButtons />)

    const create = getByRole('link', { name: 'Create Wallet' })
    const connect = getByRole('link', { name: 'Connect Wallet' })
    const xrpl = getByRole('link', { name: 'XRPL' })

    expect(create.getAttribute('href')).toBe('/en/#create')
    expect(connect.getAttribute('href')).toBe('/en/#connect')
    expect(xrpl.getAttribute('href')).toBe('/en/#xrpl')
    expect(queryByText('Sign in to unlock actions.')).toBeNull()
  })

  it('locks all CTA links when unauthenticated', () => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    } as any)

    const { getByRole, getByText } = render(<HomeActionButtons />)

    const create = getByRole('link', { name: 'Create Wallet' })
    const connect = getByRole('link', { name: 'Connect Wallet' })
    const xrpl = getByRole('link', { name: 'XRPL' })

    expect(create.getAttribute('aria-disabled')).toBe('true')
    expect(connect.getAttribute('aria-disabled')).toBe('true')
    expect(xrpl.getAttribute('aria-disabled')).toBe('true')
    expect(create.tabIndex).toBe(-1)
    expect(connect.tabIndex).toBe(-1)
    expect(xrpl.tabIndex).toBe(-1)
    expect(getByText('Sign in to unlock actions.')).toBeTruthy()
  })
})


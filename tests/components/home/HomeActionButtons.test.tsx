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

const mockedUseSession = vi.mocked(useSession)

describe('HomeActionButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      status: 'authenticated',
    } as any)
  })

  it('renders create and connect CTA links when authenticated', () => {
    const { getByTestId, queryByTestId } = render(<HomeActionButtons />)

    const create = getByTestId('home-action-button-create-wallet') as HTMLAnchorElement
    const connect = getByTestId('home-action-button-connect-wallet') as HTMLAnchorElement

    expect(create.getAttribute('href')).toBe('/en#create')
    expect(connect.getAttribute('href')).toBe('/en#connect')
    expect(queryByTestId('home-action-button-xrpl')).toBeNull()
    expect(getByTestId('home-action-buttons')).toBeTruthy()
    expect(getByTestId('home-action-buttons-list')).toBeTruthy()
    expect(queryByTestId('home-action-buttons-unlock')).toBeNull()
  })

  it('locks create and connect CTA links when unauthenticated', () => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    } as any)

    const { getByTestId, queryByTestId } = render(<HomeActionButtons />)

    const create = getByTestId('home-action-button-create-wallet') as HTMLAnchorElement
    const connect = getByTestId('home-action-button-connect-wallet') as HTMLAnchorElement

    expect(create.getAttribute('aria-disabled')).toBe('true')
    expect(connect.getAttribute('aria-disabled')).toBe('true')
    expect(create.tabIndex).toBe(-1)
    expect(connect.tabIndex).toBe(-1)
    expect(queryByTestId('home-action-button-xrpl')).toBeNull()
    expect(getByTestId('home-action-buttons-unlock')).toBeTruthy()
  })
})

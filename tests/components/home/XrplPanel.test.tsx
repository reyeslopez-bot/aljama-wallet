// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { XrplPanel } from '@/components/home/XrplPanel.client'
import { useSession } from 'next-auth/react'

vi.mock('framer-motion', () => ({
  motion: {
    button: ({ whileHover, whileTap, ...props }: React.ComponentProps<'button'> & {
      whileHover?: unknown
      whileTap?: unknown
    }) => React.createElement('button', props),
  },
}))

const mockedUseSession = vi.mocked(useSession)

describe('XrplPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'test-user', email: 'test@example.com' } },
      status: 'authenticated',
    } as any)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads XRPL account and supports refresh button when authenticated', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          account: { address: 'rAddressOne', xrpBalance: '42.15' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          account: { address: 'rAddressOne', xrpBalance: '42.15' },
        }),
      })

    vi.stubGlobal('fetch', fetchMock)
    const { getByRole, getByText } = render(<XrplPanel />)

    await waitFor(() => {
      expect(getByText('rAddressOne')).toBeTruthy()
    })

    const refresh = getByRole('button', { name: 'Refresh XRPL snapshot' }) as HTMLButtonElement
    expect(refresh.disabled).toBe(false)

    fireEvent.click(refresh)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  it('disables refresh button when unauthenticated', async () => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    } as any)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        account: { address: 'rAddressTwo', xrpBalance: '7.00' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getByRole, getByText } = render(<XrplPanel />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    const refresh = getByRole('button', { name: 'Refresh XRPL snapshot' }) as HTMLButtonElement
    expect(refresh.disabled).toBe(true)
    expect(getByText('Sign in to unlock actions.')).toBeTruthy()
  })
})

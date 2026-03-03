// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import XrplMarketPanel from '@/components/home/XrplMarketPanel.client'
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

const snapshot = {
  ok: true as const,
  source: 'coingecko' as const,
  updatedAt: '2026-02-14T20:00:00.000Z',
  assets: [
    {
      id: 'xrp',
      symbol: 'XRP',
      name: 'XRP',
      marketGroup: 'xrpl' as const,
      network: 'XRPL',
      priceUsd: 0.62,
      change24h: 2.2,
      series: [1, 1.02, 1.01],
    },
    {
      id: 'btc',
      symbol: 'BTC',
      name: 'Bitcoin',
      marketGroup: 'reference' as const,
      network: 'Bitcoin',
      priceUsd: 69000,
      change24h: -0.4,
      series: [1, 0.99, 1.01],
    },
  ],
}

describe('XrplMarketPanel', () => {
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

  it('loads market data, filters by button, and refreshes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => snapshot,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => snapshot,
      })

    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId, getByText, queryByTestId } = render(<XrplMarketPanel />)

    await waitFor(() => {
      expect(getByText('$0.62')).toBeTruthy()
      expect(getByText('$69,000.00')).toBeTruthy()
      expect(getByText('Bitcoin')).toBeTruthy()
    })

    fireEvent.click(getByTestId('xrpl-market-filter-xrpl'))

    await waitFor(() => {
      expect(getByTestId('xrpl-market-row-xrp')).toBeTruthy()
      expect(queryByTestId('xrpl-market-row-btc')).toBeNull()
    })

    fireEvent.click(getByTestId('xrpl-market-refresh'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  it('disables all market action buttons when unauthenticated', async () => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    } as any)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshot,
    })
    vi.stubGlobal(
      'fetch',
      fetchMock,
    )

    const { getByTestId, getByText } = render(<XrplMarketPanel />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    const all = getByTestId('xrpl-market-filter-all') as HTMLButtonElement
    const xrpl = getByTestId('xrpl-market-filter-xrpl') as HTMLButtonElement
    const reference = getByTestId('xrpl-market-filter-reference') as HTMLButtonElement
    const refresh = getByTestId('xrpl-market-refresh') as HTMLButtonElement

    expect(all.disabled).toBe(true)
    expect(xrpl.disabled).toBe(true)
    expect(reference.disabled).toBe(true)
    expect(refresh.disabled).toBe(true)
    expect(getByText('Sign up to unlock actions.')).toBeTruthy()
  })
})

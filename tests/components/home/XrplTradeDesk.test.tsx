// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from 'next-auth/react'
import XrplTradeDesk from '@/components/home/XrplTradeDesk.client'

vi.mock('framer-motion', () => ({
  motion: {
    button: ({ whileHover, whileTap, ...props }: React.ComponentProps<'button'> & { whileHover?: unknown; whileTap?: unknown }) =>
      React.createElement('button', props),
  },
}))

const mockedUseSession = vi.mocked(useSession)

describe('XrplTradeDesk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      status: 'authenticated',
    } as any)
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => (key === 'aljama.region' ? 'us' : null)),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      configurable: true,
    })
  })

  it('loads initial XRPL trade desk data and submits trustline action', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()

      if (method === 'POST' && url === '/api/xrpl/trustline/set') {
        return {
          ok: true,
          json: async () => ({ ok: true, tx: { hash: 'ABC123' } }),
        } as Response
      }

      if (url.startsWith('/api/xrpl/account-assets')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            network: 'testnet',
            account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
            assets: [
              { assetType: 'xrp', currency: 'XRP', issuer: null, value: '12.1', limit: null },
              { assetType: 'issued', currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '21.0', limit: '1000' },
            ],
          }),
        } as Response
      }

      if (url.startsWith('/api/xrpl/nfts')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            nfts: [
              {
                nftokenId: 'NFT1',
                uri: 'https://example.com/meta.json',
                issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
                metadata: { name: 'Demo NFT', description: 'Demo', image: null },
              },
            ],
          }),
        } as Response
      }

      if (url.startsWith('/api/xrpl/orderbook')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            offers: [{ account: 'rOffer', sequence: 1, quality: '1.1', takerGets: '10', takerPays: '20' }],
          }),
        } as Response
      }

      if (url.startsWith('/api/xrpl/action-history')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            actions: [{ id: 'act-1', action: 'offer_create', status: 'validated', txHash: 'AABBCC', engineResult: 'tesSUCCESS', updatedAt: new Date().toISOString() }],
          }),
        } as Response
      }

      return {
        ok: false,
        json: async () => ({ ok: false, error: 'not mocked' }),
      } as Response
    })

    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId, getByText, queryByText } = render(<XrplTradeDesk />)

    await waitFor(() => {
      expect(getByText('One swap flow, nothing extra')).toBeTruthy()
      expect(getByTestId('xrpl-trade-desk-quick-swap-form')).toBeTruthy()
    })

    expect(queryByText('Wallet Balances')).toBeNull()
    expect(queryByText('Recent Actions')).toBeNull()
    expect(() => getByTestId('xrpl-trade-desk-refresh')).toThrow()
    expect(queryByText('Show submission log')).toBeNull()
    expect(() => getByTestId('xrpl-trade-desk-activity-rail')).toThrow()
    expect(queryByText('Demo NFT')).toBeNull()

    fireEvent.click(getByTestId('xrpl-trade-desk-expert-toggle'))

    await waitFor(() => {
      expect(getByText('Demo NFT')).toBeTruthy()
      expect(getByText('offer_create · validated')).toBeTruthy()
      expect(getByTestId('xrpl-trade-desk-refresh')).toBeTruthy()
    })

    fireEvent.change(getByTestId('xrpl-trade-desk-trustline-issuer'), {
      target: { value: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' },
    })
    fireEvent.change(getByTestId('xrpl-trade-desk-trustline-currency'), { target: { value: 'USD' } })
    fireEvent.change(getByTestId('xrpl-trade-desk-trustline-limit'), { target: { value: '250' } })

    fireEvent.click(getByTestId('xrpl-trade-desk-trustline-submit'))

    await waitFor(() => {
      expect(getByTestId('xrpl-trade-desk-action-status').textContent).toMatch(/trustline_set submitted/i)
      expect(getByTestId('xrpl-trade-desk-log-toggle').textContent).toMatch(/show submission log/i)
    })

    expect(() => getByTestId('xrpl-trade-desk-activity-rail')).toThrow()

    fireEvent.click(getByTestId('xrpl-trade-desk-log-toggle'))

    await waitFor(() => {
      expect(getByTestId('xrpl-trade-desk-activity-rail')).toBeTruthy()
      expect(getByTestId('xrpl-trade-desk-retry-last-action')).toBeTruthy()
      expect(getByTestId('xrpl-trade-desk-log-toggle').textContent).toMatch(/hide submission log/i)
    })
  })

  it('loads live quotes even when unauthenticated', async () => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    } as any)

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/xrpl/orderbook')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            offers: [{ account: 'rOffer', sequence: 1, quality: '1.1', takerGets: '10', takerPays: '20' }],
          }),
        } as Response
      }

      return {
        ok: false,
        json: async () => ({ ok: false, error: 'not mocked' }),
      } as Response
    })

    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId, getByText, queryByTestId } = render(<XrplTradeDesk />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(getByText('One swap flow, nothing extra')).toBeTruthy()
      expect(getByTestId('xrpl-trade-desk-quick-swap-preview')).toBeTruthy()
    })

    expect(queryByTestId('xrpl-trade-desk-history')).toBeNull()
    expect(queryByTestId('xrpl-trade-desk-launch-context')).toBeNull()
    expect(queryByTestId('xrpl-trade-desk-refresh')).toBeNull()
    expect((getByTestId('xrpl-trade-desk-quick-swap-refresh-quote') as HTMLButtonElement).disabled).toBe(false)
    expect(queryByTestId('xrpl-trade-desk-log-toggle')).toBeNull()
    expect(queryByTestId('xrpl-trade-desk-activity-rail')).toBeNull()
  })
})

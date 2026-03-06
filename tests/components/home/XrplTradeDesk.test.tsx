// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import XrplTradeDesk from '@/components/home/XrplTradeDesk.client'

vi.mock('framer-motion', () => ({
  motion: {
    button: ({ whileHover, whileTap, ...props }: React.ComponentProps<'button'> & { whileHover?: unknown; whileTap?: unknown }) =>
      React.createElement('button', props),
  },
}))

describe('XrplTradeDesk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    const { getByTestId, getByText } = render(<XrplTradeDesk />)

    await waitFor(() => {
      expect(getByTestId('xrpl-trade-desk-assets')).toBeTruthy()
      expect(getByText('Demo NFT')).toBeTruthy()
      expect(getByText('offer_create · validated')).toBeTruthy()
    })

    fireEvent.click(getByTestId('xrpl-trade-desk-tab-advanced'))

    fireEvent.change(getByTestId('xrpl-trade-desk-trustline-issuer'), {
      target: { value: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' },
    })
    fireEvent.change(getByTestId('xrpl-trade-desk-trustline-currency'), { target: { value: 'USD' } })
    fireEvent.change(getByTestId('xrpl-trade-desk-trustline-limit'), { target: { value: '250' } })

    fireEvent.click(getByTestId('xrpl-trade-desk-trustline-submit'))

    await waitFor(() => {
      expect(getByTestId('xrpl-trade-desk-action-status').textContent).toMatch(/trustline_set submitted/i)
    })
  })
})

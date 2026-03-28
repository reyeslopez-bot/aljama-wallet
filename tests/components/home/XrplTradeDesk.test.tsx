// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from 'next-auth/react'
import XrplTradeDesk from '@/components/home/XrplTradeDesk.client'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'

const mockedUseSession = vi.mocked(useSession)
const initialState = useDynamicInfoStore.getState()

const resetStore = () => {
  useDynamicInfoStore.setState(
    {
      ...initialState,
      user: initialState.user ? { ...initialState.user } : null,
      wallet: { ...initialState.wallet },
      lastEvent: initialState.lastEvent ? { ...initialState.lastEvent } : null,
    },
    true,
  )
}

const unlockTradeDesk = () => {
  useDynamicInfoStore.setState((state) => ({
    wallet: {
      ...state.wallet,
      createdAddress: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
    },
    createWalletStatus: 'success',
  }))
}

describe('XrplTradeDesk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
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

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads initial XRPL trade desk data and submits trustline action', async () => {
    unlockTradeDesk()

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

      if (url.startsWith('/api/xrpl/trade/swap/quote')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            quote: {
              sourceAmount: { currency: 'XRP', value: '50' },
              quotedSourceAmount: { currency: 'XRP', value: '50' },
              destinationAmount: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '45.5' },
              deliverMin: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '45.2725' },
              pathCount: 1,
              alternativeCount: 2,
              fullReply: true,
              slippageBps: 50,
            },
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

    const { getByTestId, getByText, queryByTestId, queryByText } = render(<XrplTradeDesk />)

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
      expect(getByTestId('xrpl-trade-desk-advanced-overlay')).toBeTruthy()
      expect(getByTestId('xrpl-trade-desk-advanced-close')).toBeTruthy()
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

    fireEvent.click(getByTestId('xrpl-trade-desk-advanced-close'))

    await waitFor(() => {
      expect(queryByTestId('xrpl-trade-desk-advanced-overlay')).toBeNull()
    })
  })

  it('keeps the trade desk locked when unauthenticated', async () => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    } as any)

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/xrpl/trade/swap/quote')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            quote: {
              sourceAmount: { currency: 'XRP', value: '50' },
              quotedSourceAmount: { currency: 'XRP', value: '50' },
              destinationAmount: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '45.5' },
              deliverMin: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '45.2725' },
              pathCount: 1,
              alternativeCount: 2,
              fullReply: true,
              slippageBps: 50,
            },
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
      expect(getByText('One swap flow, nothing extra')).toBeTruthy()
      expect(getByTestId('xrpl-trade-desk-quick-swap-preview')).toBeTruthy()
      expect(getByText('Sign in to unlock the XRPL trade desk.')).toBeTruthy()
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(queryByTestId('xrpl-trade-desk-history')).toBeNull()
    expect(queryByTestId('xrpl-trade-desk-launch-context')).toBeNull()
    expect(queryByTestId('xrpl-trade-desk-refresh')).toBeNull()
    expect((getByTestId('xrpl-trade-desk-context-toggle') as HTMLButtonElement).disabled).toBe(true)
    expect((getByTestId('xrpl-trade-desk-expert-toggle') as HTMLButtonElement).disabled).toBe(true)
    expect((getByTestId('xrpl-trade-desk-quick-swap-refresh-quote') as HTMLButtonElement).disabled).toBe(true)
    expect(getByTestId('xrpl-trade-desk-unlock')).toBeTruthy()
    expect(queryByTestId('xrpl-trade-desk-log-toggle')).toBeNull()
    expect(queryByTestId('xrpl-trade-desk-activity-rail')).toBeNull()
  })

  it('submits issuer policy admin and distribution actions from the advanced desk', async () => {
    unlockTradeDesk()

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()

      if (method === 'POST' && url === '/api/xrpl/issuer/asset') {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            issuerProgram: { id: 'program-1' },
            asset: { id: 'asset-1' },
          }),
        } as Response
      }

      if (method === 'POST' && url === '/api/xrpl/issuer/holder/review') {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            holder: { id: 'holder-1', status: 'approved' },
          }),
        } as Response
      }

      if (method === 'POST' && url === '/api/xrpl/issuer/payment') {
        return {
          ok: true,
          json: async () => ({ ok: true, tx: { hash: 'ISSUE123' } }),
        } as Response
      }

      if (url.startsWith('/api/xrpl/account-assets')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            network: 'testnet',
            account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
            assets: [{ assetType: 'xrp', currency: 'XRP', issuer: null, value: '12.1', limit: null }],
          }),
        } as Response
      }

      if (url.startsWith('/api/xrpl/nfts')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            nfts: [],
          }),
        } as Response
      }

      if (url.startsWith('/api/xrpl/trade/swap/quote')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            quote: {
              sourceAmount: { currency: 'XRP', value: '50' },
              quotedSourceAmount: { currency: 'XRP', value: '50' },
              destinationAmount: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '45.5' },
              deliverMin: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '45.2725' },
              pathCount: 1,
              alternativeCount: 2,
              fullReply: true,
              slippageBps: 50,
            },
          }),
        } as Response
      }

      if (url.startsWith('/api/xrpl/orderbook')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            offers: [],
          }),
        } as Response
      }

      if (url.startsWith('/api/xrpl/action-history')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            actions: [],
          }),
        } as Response
      }

      return {
        ok: false,
        json: async () => ({ ok: false, error: 'not mocked' }),
      } as Response
    })

    vi.stubGlobal('fetch', fetchMock)

    const { getAllByText, getByTestId, getByText } = render(<XrplTradeDesk />)

    await waitFor(() => {
      expect(getByText('One swap flow, nothing extra')).toBeTruthy()
    })

    fireEvent.click(getByTestId('xrpl-trade-desk-expert-toggle'))

    await waitFor(() => {
      expect(getByTestId('xrpl-trade-desk-advanced-overlay')).toBeTruthy()
    })

    // Register the asset policy first so the rest of the issuer workflow has a
    // policy object to enforce against.
    fireEvent.change(getByTestId('xrpl-trade-desk-issuer-asset-currency'), {
      target: { value: 'RWAUSD' },
    })
    fireEvent.change(getByTestId('xrpl-trade-desk-issuer-asset-display-name'), {
      target: { value: 'Real World USD' },
    })
    fireEvent.change(getByTestId('xrpl-trade-desk-issuer-asset-max-distribution'), {
      target: { value: '5000' },
    })

    fireEvent.click(getByTestId('xrpl-trade-desk-issuer-asset-submit'))

    await waitFor(() => {
      expect(getByTestId('xrpl-trade-desk-action-status').textContent).toMatch(/issuer_asset_policy completed/i)
    })

    // Then persist the off-ledger holder approval that precedes on-ledger
    // trustline authorization in the new issuer policy model.
    fireEvent.change(getByTestId('xrpl-trade-desk-issuer-holder-review-holder'), {
      target: { value: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' },
    })
    fireEvent.change(getByTestId('xrpl-trade-desk-issuer-holder-review-currency'), {
      target: { value: 'RWAUSD' },
    })
    fireEvent.change(getByTestId('xrpl-trade-desk-issuer-holder-review-notes'), {
      target: { value: 'KYC approved' },
    })

    fireEvent.click(getByTestId('xrpl-trade-desk-issuer-holder-review-submit'))

    await waitFor(() => {
      expect(getByTestId('xrpl-trade-desk-action-status').textContent).toMatch(/issuer_holder_review completed/i)
    })

    fireEvent.change(getByTestId('xrpl-trade-desk-issuer-payment-destination'), {
      target: { value: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' },
    })
    fireEvent.change(getByTestId('xrpl-trade-desk-issuer-payment-currency'), {
      target: { value: 'RWAUSD' },
    })
    fireEvent.change(getByTestId('xrpl-trade-desk-issuer-payment-value'), {
      target: { value: '250' },
    })

    fireEvent.click(getByTestId('xrpl-trade-desk-issuer-payment-submit'))

    await waitFor(() => {
      expect(getByTestId('xrpl-trade-desk-action-status').textContent).toMatch(/issuer_payment submitted/i)
    })

    const assetCall = fetchMock.mock.calls.find(([input]) => String(input) === '/api/xrpl/issuer/asset')
    const assetBody = JSON.parse(String(assetCall?.[1]?.body ?? '{}'))
    expect(assetBody).toMatchObject({
      currency: 'RWAUSD',
      displayName: 'Real World USD',
      maxDistributionValue: '5000',
      requireHolderApproval: true,
      requiresAuthorizedTrustlines: true,
    })

    const holderReviewCall = fetchMock.mock.calls.find(([input]) => String(input) === '/api/xrpl/issuer/holder/review')
    const holderReviewBody = JSON.parse(String(holderReviewCall?.[1]?.body ?? '{}'))
    expect(holderReviewBody).toMatchObject({
      holder: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      currency: 'RWAUSD',
      status: 'approved',
      notes: 'KYC approved',
    })

    expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/xrpl/issuer/payment')).toBe(true)
  })

  it('maps retry-aware backend errors and replays the last action with a fresh idempotency key', async () => {
    unlockTradeDesk()

    const randomUUID = vi
      .fn()
      .mockReturnValueOnce('trace-first')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('trace-second')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
    vi.stubGlobal('crypto', { randomUUID })

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()

      if (method === 'POST' && url === '/api/xrpl/trustline/set') {
        const payload = JSON.parse(String(init?.body ?? '{}'))

        if (payload.idempotencyKey === '11111111-1111-4111-8111-111111111111') {
          return new Response(
            JSON.stringify({
              ok: false,
              code: 'rate_limited',
              error: 'RATE_LIMITED',
              details: { retryAfter: 17 },
            }),
            {
              status: 429,
              headers: {
                'content-type': 'application/json',
                'retry-after': '17',
              },
            },
          )
        }

        return new Response(
          JSON.stringify({
            ok: true,
            tx: { hash: 'RETRY123' },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      }

      if (url.startsWith('/api/xrpl/account-assets')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            network: 'testnet',
            account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
            assets: [{ assetType: 'xrp', currency: 'XRP', issuer: null, value: '12.1', limit: null }],
          }),
        } as Response
      }

      if (url.startsWith('/api/xrpl/nfts')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            nfts: [],
          }),
        } as Response
      }

      if (url.startsWith('/api/xrpl/trade/swap/quote')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            quote: {
              sourceAmount: { currency: 'XRP', value: '50' },
              quotedSourceAmount: { currency: 'XRP', value: '50' },
              destinationAmount: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '45.5' },
              deliverMin: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '45.2725' },
              pathCount: 1,
              alternativeCount: 2,
              fullReply: true,
              slippageBps: 50,
            },
          }),
        } as Response
      }

      if (url.startsWith('/api/xrpl/orderbook')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            offers: [],
          }),
        } as Response
      }

      if (url.startsWith('/api/xrpl/action-history')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            actions: [],
          }),
        } as Response
      }

      return {
        ok: false,
        json: async () => ({ ok: false, error: 'not mocked' }),
      } as Response
    })

    vi.stubGlobal('fetch', fetchMock)

    const { getAllByText, getByTestId, getByText } = render(<XrplTradeDesk />)

    await waitFor(() => {
      expect(getByText('One swap flow, nothing extra')).toBeTruthy()
    })

    fireEvent.click(getByTestId('xrpl-trade-desk-expert-toggle'))

    await waitFor(() => {
      expect(getByTestId('xrpl-trade-desk-advanced-overlay')).toBeTruthy()
    })

    fireEvent.change(getByTestId('xrpl-trade-desk-trustline-issuer'), {
      target: { value: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' },
    })
    fireEvent.change(getByTestId('xrpl-trade-desk-trustline-currency'), { target: { value: 'USD' } })
    fireEvent.change(getByTestId('xrpl-trade-desk-trustline-limit'), { target: { value: '250' } })

    fireEvent.click(getByTestId('xrpl-trade-desk-trustline-submit'))

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => url === '/api/xrpl/trustline/set' && init?.method === 'POST',
        ),
      ).toBe(true)
      expect(getByTestId('xrpl-trade-desk-log-toggle')).toBeTruthy()
    })

    fireEvent.click(getByTestId('xrpl-trade-desk-log-toggle'))

    await waitFor(() => {
      expect(getAllByText('Too many attempts. Try again in 17 seconds.').length).toBeGreaterThan(0)
    })

    fireEvent.click(getByTestId('xrpl-trade-desk-retry-last-action'))

    await waitFor(() => {
      expect(getByTestId('xrpl-trade-desk-action-status').textContent).toContain(
        'trustline_set_retry submitted',
      )
    })

    const postCalls = fetchMock.mock.calls.filter(
      ([url, init]) => url === '/api/xrpl/trustline/set' && init?.method === 'POST',
    )
    expect(postCalls).toHaveLength(2)
    expect(JSON.parse(String(postCalls[0]?.[1]?.body)).idempotencyKey).toBe(
      '11111111-1111-4111-8111-111111111111',
    )
    expect(JSON.parse(String(postCalls[1]?.[1]?.body)).idempotencyKey).toBe(
      '22222222-2222-4222-8222-222222222222',
    )
  })

  it('hides the missing quote warning until a manual refresh is attempted', async () => {
    unlockTradeDesk()

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/xrpl/trade/swap/quote')) {
        return {
          ok: false,
          json: async () => ({
            ok: false,
            error: 'No XRPL swap path found',
          }),
        } as Response
      }

      return {
        ok: false,
        json: async () => ({ ok: false, error: 'not mocked' }),
      } as Response
    })

    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId, queryByText, getByText } = render(<XrplTradeDesk />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect((getByTestId('xrpl-trade-desk-quick-swap-refresh-quote') as HTMLButtonElement).disabled).toBe(false)
    })

    expect(queryByText(/No XRPL swap path found/i)).toBeNull()

    fireEvent.click(getByTestId('xrpl-trade-desk-quick-swap-refresh-quote'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(getByText(/No XRPL swap path found/i)).toBeTruthy()
    })
  })

  it('does not show a no-path warning when quote prerequisites are still missing', async () => {
    unlockTradeDesk()

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.startsWith('/api/xrpl/trade/swap/quote')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            quote: {
              sourceAmount: { currency: 'XRP', value: '50' },
              quotedSourceAmount: { currency: 'XRP', value: '50' },
              destinationAmount: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '45.5' },
              deliverMin: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '45.2725' },
              pathCount: 1,
              alternativeCount: 2,
              fullReply: true,
              slippageBps: 50,
            },
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
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(getByTestId('xrpl-trade-desk-quick-swap-from-currency'), {
      target: { value: 'USD' },
    })
    fireEvent.change(getByTestId('xrpl-trade-desk-quick-swap-to-currency'), {
      target: { value: 'USD' },
    })

    fireEvent.click(getByTestId('xrpl-trade-desk-quick-swap-refresh-quote'))

    await waitFor(() => {
      expect(getByText(/Choose a different destination asset for quick swap/i)).toBeTruthy()
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(queryByText(/No trusted swap path is available for USD -> USD/i)).toBeNull()
  })
})

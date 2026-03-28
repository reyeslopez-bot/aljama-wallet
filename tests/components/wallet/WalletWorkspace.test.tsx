// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ManagedWalletSessionProvider } from '@/components/wallet/sync/ManagedWalletSessionContext.client'
import WalletWorkspace from '@/components/wallet/ui/WalletWorkspace.client'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

function renderWorkspace({
  walletId,
  allowedChainIds = [],
}: {
  walletId: string | null
  allowedChainIds?: number[]
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ManagedWalletSessionProvider walletId={walletId}>
        <WalletWorkspace allowedChainIds={allowedChainIds} />
      </ManagedWalletSessionProvider>
    </QueryClientProvider>,
  )
}

describe('WalletWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows an empty managed-wallet state when no wallet is linked', () => {
    const { getByTestId, getByText } = renderWorkspace({
      walletId: null,
    })

    expect(getByTestId('wallet-workspace-empty')).toBeTruthy()
    expect(getByText(/No managed wallet available/i)).toBeTruthy()
    expect(getByText(/local vault and the external wallet connection do not populate this workspace/i)).toBeTruthy()
  })

  it('loads snapshot and transactions and submits a send intent', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === '/api/wallet/wallet-123' && (!init?.method || init.method === 'GET')) {
        return jsonResponse({
          ok: true,
          wallet: {
            walletId: 'wallet-123',
            address: '0x1111111111111111111111111111111111111111',
            createdAt: '2026-03-15T08:00:00.000Z',
            authorities: {
              transactional: 'cockroachdb',
              analytics: 'postgres',
              chain: 'xrpl',
            },
            summary: {
              transactionalTxCount: 3,
              transferAttemptCount24h: 2,
              lastTransactionalAt: '2026-03-15T09:00:00.000Z',
              lastTransferStatus: 'submitted',
            },
            reconciliation: {
              source: 'xrpl',
              status: 'not_applicable',
              checkedAt: '2026-03-15T09:05:00.000Z',
              ledgerIndex: null,
              ledgerHash: null,
            },
            updatedAt: '2026-03-15T09:05:00.000Z',
          },
        })
      }

      if (
        url.startsWith('/api/wallet/wallet-123/transactions?') &&
        (!init?.method || init.method === 'GET')
      ) {
        return jsonResponse({
          ok: true,
          walletId: 'wallet-123',
          items: [
            {
              id: 'tx-1',
              source: 'transactional',
              direction: 'outgoing',
              amountWei: '25000000000000000',
              asset: null,
              chainType: 'EVM',
              networkId: '8453',
              chainId: 8453,
              txType: 'transfer',
              status: 'confirmed_final',
              counterparty: '0x2222222222222222222222222222222222222222',
              idempotencyKey: '11111111-1111-4111-8111-111111111111',
              txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              nonce: '7',
              replacesTxHash: null,
              replacedByTxHash: null,
              gasLimit: '21000',
              gasPrice: null,
              maxFeePerGas: null,
              maxPriorityFeePerGas: null,
              gasUsed: '21000',
              blockHeight: '123',
              blockHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              confirmationCount: 2,
              contractAddress: null,
              tokenId: null,
              data: null,
              confirmedAt: '2026-03-15T09:06:00.000Z',
              createdAt: '2026-03-15T09:05:30.000Z',
            },
          ],
          nextCursor: null,
        })
      }

      if (url === '/api/wallet/wallet-123/send' && init?.method === 'POST') {
        return jsonResponse({
          ok: true,
          intentId: 'intent-123',
          status: 'queued',
          walletId: 'wallet-123',
          to: '0x3333333333333333333333333333333333333333',
          amountWei: '100000000000000000',
          chainId: 8453,
          traceId: 'trace-123',
          correlationId: 'corr-123',
          idempotencyKey: '22222222-2222-4222-8222-222222222222',
          transferLogId: 'log-123',
        })
      }

      throw new Error(`Unhandled fetch: ${String(init?.method ?? 'GET')} ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('crypto', {
      randomUUID: () => '22222222-2222-4222-8222-222222222222',
    })

    const { getByTestId, getByText, getAllByTestId, queryByText } = renderWorkspace({
      walletId: 'wallet-123',
      allowedChainIds: [8453],
    })

    await waitFor(() => {
      expect(getByTestId('wallet-workspace-receive-address').textContent).toContain(
        '0x1111111111111111111111111111111111111111',
      )
      expect(queryByText(/Transfer queued/i)).toBeNull()
    })

    await waitFor(() => {
      expect(getAllByTestId('wallet-workspace-transaction-row')).toHaveLength(1)
      expect(getByText(/0\.025 ETH/i)).toBeTruthy()
    })

    fireEvent.change(getByTestId('wallet-workspace-send-destination'), {
      target: { value: '0x3333333333333333333333333333333333333333' },
    })
    fireEvent.change(getByTestId('wallet-workspace-send-amount'), {
      target: { value: '0.1' },
    })
    fireEvent.click(getByTestId('wallet-workspace-send-submit'))

    await waitFor(() => {
      expect(getByTestId('wallet-workspace-send-success').textContent).toContain('intent-123')
      expect(getByTestId('wallet-workspace-send-success').textContent).toContain('8453')
      expect(getByTestId('wallet-workspace-send-success').textContent).toContain('0.1 ETH')
    })

    const sendCall = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/wallet/wallet-123/send' && init?.method === 'POST',
    )
    expect(sendCall).toBeTruthy()
    expect(JSON.parse(String(sendCall?.[1]?.body))).toMatchObject({
      to: '0x3333333333333333333333333333333333333333',
      amountWei: '100000000000000000',
      chainId: 8453,
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
    })
  })

  it('shows retry-aware messaging when wallet send is fail-closed by backend protection', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === '/api/wallet/wallet-123' && (!init?.method || init.method === 'GET')) {
        return jsonResponse({
          ok: true,
          wallet: {
            walletId: 'wallet-123',
            address: '0x1111111111111111111111111111111111111111',
            createdAt: '2026-03-15T08:00:00.000Z',
            authorities: {
              transactional: 'cockroachdb',
              analytics: 'postgres',
              chain: 'xrpl',
            },
            summary: {
              transactionalTxCount: 3,
              transferAttemptCount24h: 2,
              lastTransactionalAt: '2026-03-15T09:00:00.000Z',
              lastTransferStatus: 'submitted',
            },
            reconciliation: {
              source: 'xrpl',
              status: 'not_applicable',
              checkedAt: '2026-03-15T09:05:00.000Z',
              ledgerIndex: null,
              ledgerHash: null,
            },
            updatedAt: '2026-03-15T09:05:00.000Z',
          },
        })
      }

      if (
        url.startsWith('/api/wallet/wallet-123/transactions?') &&
        (!init?.method || init.method === 'GET')
      ) {
        return jsonResponse({
          ok: true,
          walletId: 'wallet-123',
          items: [],
          nextCursor: null,
        })
      }

      if (url === '/api/wallet/wallet-123/send' && init?.method === 'POST') {
        return jsonResponse(
          {
            ok: false,
            code: 'rate_limit_backend_unavailable',
            error: 'RATE_LIMIT_BACKEND_UNAVAILABLE',
            details: { retryAfter: 9 },
          },
          {
            status: 503,
            headers: { 'retry-after': '9' },
          },
        )
      }

      throw new Error(`Unhandled fetch: ${String(init?.method ?? 'GET')} ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('crypto', {
      randomUUID: () => '33333333-3333-4333-8333-333333333333',
    })

    const { getByTestId } = renderWorkspace({
      walletId: 'wallet-123',
      allowedChainIds: [8453],
    })

    await waitFor(() => {
      expect(getByTestId('wallet-workspace-receive-address').textContent).toContain(
        '0x1111111111111111111111111111111111111111',
      )
    })

    fireEvent.change(getByTestId('wallet-workspace-send-destination'), {
      target: { value: '0x3333333333333333333333333333333333333333' },
    })
    fireEvent.change(getByTestId('wallet-workspace-send-amount'), {
      target: { value: '0.1' },
    })
    fireEvent.click(getByTestId('wallet-workspace-send-submit'))

    await waitFor(() => {
      expect(getByTestId('wallet-workspace-send-error').textContent).toBe(
        'Request temporarily unavailable. Try again in 9 seconds.',
      )
    })
  })
})

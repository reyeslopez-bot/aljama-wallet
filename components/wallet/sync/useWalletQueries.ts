'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { walletQueryKeys } from '@/components/wallet/sync/wallet-query-keys'
import type {
  WalletSendInput,
  WalletSendResponse,
  WalletSnapshot,
  WalletTransactionItem,
  WalletTransactionsPage,
} from '@/types/wallet-api'

type ApiError = {
  error?: string
  code?: string
}

function buildErrorMessage(status: number, body: ApiError | null): string {
  if (body?.error) return body.error
  if (body?.code) return body.code
  return `Request failed (${status})`
}

async function expectJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as T | null
  if (!response.ok) {
    throw new Error(buildErrorMessage(response.status, body as ApiError | null))
  }
  if (!body) {
    throw new Error('Empty response payload')
  }
  return body
}

type WalletSnapshotResponse = { ok: true; wallet: WalletSnapshot }

export async function fetchWalletSnapshot(walletId: string): Promise<WalletSnapshot> {
  const response = await fetch(`/api/wallet/${walletId}`, {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await expectJson<WalletSnapshotResponse>(response)
  return payload.wallet
}

type WalletTransactionsResponse = {
  ok: true
  walletId: string
  items: WalletTransactionItem[]
  nextCursor: string | null
}

export async function fetchWalletTransactions(params: {
  walletId: string
  cursor?: string | null
  limit?: number
}): Promise<WalletTransactionsPage> {
  const limit = params.limit ?? 25
  const url = new URL(`/api/wallet/${params.walletId}/transactions`, window.location.origin)
  url.searchParams.set('limit', String(limit))
  if (params.cursor) {
    url.searchParams.set('cursor', params.cursor)
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await expectJson<WalletTransactionsResponse>(response)
  return {
    walletId: payload.walletId,
    items: payload.items,
    nextCursor: payload.nextCursor,
  }
}

export function useWalletSnapshotQuery(
  walletId: string | null,
  options?: {
    enabled?: boolean
    initialData?: WalletSnapshot
  },
) {
  const enabled = Boolean(walletId) && (options?.enabled ?? true)
  return useQuery({
    queryKey: walletId ? walletQueryKeys.snapshot(walletId) : walletQueryKeys.all,
    queryFn: () => fetchWalletSnapshot(walletId as string),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    ...(options?.initialData ? { initialData: options.initialData } : {}),
  })
}

export function useWalletTransactionsQuery(
  walletId: string | null,
  options?: {
    enabled?: boolean
    cursor?: string | null
    limit?: number
  },
) {
  const cursor = options?.cursor ?? null
  const limit = options?.limit ?? 25
  const enabled = Boolean(walletId) && (options?.enabled ?? true)

  return useQuery({
    queryKey: walletId ? walletQueryKeys.transactions(walletId, cursor, limit) : walletQueryKeys.all,
    queryFn: () =>
      fetchWalletTransactions({
        walletId: walletId as string,
        cursor,
        limit,
      }),
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  })
}

export function useWalletSendMutation(walletId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: WalletSendInput) => {
      if (!walletId) {
        throw new Error('Wallet not selected')
      }

      const response = await fetch(`/api/wallet/${walletId}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })

      return expectJson<WalletSendResponse>(response)
    },
    onMutate: async (input) => {
      if (!walletId) return null

      const snapshotKey = walletQueryKeys.snapshot(walletId)
      const transactionsKey = walletQueryKeys.transactions(walletId, null, 25)

      await queryClient.cancelQueries({ queryKey: walletQueryKeys.wallet(walletId) })

      const previousSnapshot = queryClient.getQueryData<WalletSnapshot>(snapshotKey)
      const previousTransactions = queryClient.getQueryData<WalletTransactionsPage>(transactionsKey)

      const optimisticItem: WalletTransactionItem = {
        id: `optimistic:${input.idempotencyKey}`,
        source: 'optimistic',
        direction: 'outgoing',
        amountWei: input.amountWei,
        asset: 'native',
        chainId: input.chainId,
        status: 'initiated',
        counterparty: input.to,
        idempotencyKey: input.idempotencyKey,
        txHash: null,
        createdAt: new Date().toISOString(),
      }

      queryClient.setQueryData<WalletTransactionsPage>(transactionsKey, (current) => {
        const items = current?.items ?? []
        return {
          walletId,
          items: [optimisticItem, ...items].slice(0, 25),
          nextCursor: current?.nextCursor ?? null,
        }
      })

      return {
        snapshotKey,
        transactionsKey,
        previousSnapshot,
        previousTransactions,
      }
    },
    onError: (_error, _input, context) => {
      if (!context) return
      queryClient.setQueryData(context.snapshotKey, context.previousSnapshot)
      queryClient.setQueryData(context.transactionsKey, context.previousTransactions)
    },
    onSuccess: (result, input) => {
      if (!walletId) return
      const transactionsKey = walletQueryKeys.transactions(walletId, null, 25)
      queryClient.setQueryData<WalletTransactionsPage>(transactionsKey, (current) => {
        if (!current) return current
        return {
          ...current,
          items: current.items.map((item) =>
            item.idempotencyKey === input.idempotencyKey
              ? {
                  ...item,
                  source: 'analytics',
                  status: 'broadcast',
                  txHash: result.txHash,
                }
              : item,
          ),
        }
      })
    },
    onSettled: () => {
      if (!walletId) return
      void queryClient.invalidateQueries({ queryKey: walletQueryKeys.wallet(walletId) })
    },
  })
}

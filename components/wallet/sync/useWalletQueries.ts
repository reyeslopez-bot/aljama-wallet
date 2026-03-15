'use client'

import { useQuery } from '@tanstack/react-query'
import { walletQueryKeys } from '@/components/wallet/sync/wallet-query-keys'
import type { WalletSnapshot, WalletTransactionsPage } from '@/types/wallet-api'

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
type WalletTransactionsResponse = WalletTransactionsPage & { ok: true }

async function fetchWalletSnapshot(walletId: string): Promise<WalletSnapshot> {
  const response = await fetch(`/api/wallet/${walletId}`, {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await expectJson<WalletSnapshotResponse>(response)
  return payload.wallet
}

async function fetchWalletTransactions(
  walletId: string,
  {
    cursor = null,
    limit = 25,
  }: {
    cursor?: string | null
    limit?: number
  } = {},
): Promise<WalletTransactionsPage> {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (cursor) {
    params.set('cursor', cursor)
  }

  const response = await fetch(`/api/wallet/${walletId}/transactions?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  })
  return expectJson<WalletTransactionsResponse>(response)
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
    initialData?: WalletTransactionsPage
  },
) {
  const enabled = Boolean(walletId) && (options?.enabled ?? true)
  const cursor = options?.cursor ?? null
  const limit = options?.limit ?? 25

  return useQuery({
    queryKey: walletId ? walletQueryKeys.transactions(walletId, cursor, limit) : walletQueryKeys.all,
    queryFn: () => fetchWalletTransactions(walletId as string, { cursor, limit }),
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    ...(options?.initialData ? { initialData: options.initialData } : {}),
  })
}

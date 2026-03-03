'use client'

import { useQuery } from '@tanstack/react-query'
import { walletQueryKeys } from '@/components/wallet/sync/wallet-query-keys'
import type { WalletSnapshot } from '@/types/wallet-api'

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

async function fetchWalletSnapshot(walletId: string): Promise<WalletSnapshot> {
  const response = await fetch(`/api/wallet/${walletId}`, {
    method: 'GET',
    cache: 'no-store',
  })
  const payload = await expectJson<WalletSnapshotResponse>(response)
  return payload.wallet
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

'use client'

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { HydrationBoundary, type DehydratedState } from '@tanstack/react-query'
import { persistWalletId } from '@/lib/storage/walletSession'
import { useWalletInvalidationSocket } from '@/components/wallet/sync/useWalletInvalidationSocket'
import { useWalletSnapshotQuery } from '@/components/wallet/sync/useWalletQueries'

function WalletSyncRuntime({ walletId }: { walletId: string | null }) {
  useWalletSnapshotQuery(walletId, { enabled: Boolean(walletId) })
  useWalletInvalidationSocket(walletId, Boolean(walletId))

  useEffect(() => {
    if (!walletId) return
    persistWalletId(walletId)
  }, [walletId])

  return null
}

export default function WalletSyncBoundary({
  children,
  walletId,
  dehydratedState,
}: {
  children: ReactNode
  walletId: string | null
  dehydratedState: DehydratedState
}) {
  return (
    <HydrationBoundary state={dehydratedState}>
      <WalletSyncRuntime walletId={walletId} />
      {children}
    </HydrationBoundary>
  )
}

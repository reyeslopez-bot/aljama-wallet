'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { walletQueryKeys } from '@/components/wallet/sync/wallet-query-keys'

type WalletInvalidationMessage = {
  type?: string
  walletId?: string
  query?: 'snapshot' | 'transactions' | 'all'
}

function parseSocketUrl(baseUrl: string, walletId: string): string | null {
  try {
    const url = new URL(baseUrl)
    url.searchParams.set('walletId', walletId)
    return url.toString()
  } catch {
    return null
  }
}

export function useWalletInvalidationSocket(walletId: string | null, enabled = true) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled || !walletId) return

    const baseUrl = process.env.NEXT_PUBLIC_WALLET_INVALIDATION_WS_URL
    if (!baseUrl) return

    const url = parseSocketUrl(baseUrl, walletId)
    if (!url) return

    const socket = new WebSocket(url)

    socket.onmessage = (event) => {
      const raw = typeof event.data === 'string' ? event.data : ''
      if (!raw) return

      let message: WalletInvalidationMessage | null = null
      try {
        message = JSON.parse(raw) as WalletInvalidationMessage
      } catch {
        return
      }

      if (message.walletId && message.walletId !== walletId) return

      if (message.query === 'snapshot') {
        void queryClient.invalidateQueries({ queryKey: walletQueryKeys.snapshot(walletId) })
        return
      }

      if (message.query === 'transactions') {
        void queryClient.invalidateQueries({
          queryKey: walletQueryKeys.transactions(walletId, null, 25),
        })
        return
      }

      if (!message.query || message.query === 'all' || message.type === 'wallet.invalidate') {
        void queryClient.invalidateQueries({ queryKey: walletQueryKeys.wallet(walletId) })
      }
    }

    return () => {
      socket.close(1000, 'wallet-invalidation-cleanup')
    }
  }, [enabled, queryClient, walletId])
}

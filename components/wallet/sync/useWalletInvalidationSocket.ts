'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { walletQueryKeys } from '@/components/wallet/sync/wallet-query-keys'
import { logError, logInfo, logWarn } from '@/lib/security/logging'

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

function sanitizeSocketUrl(urlValue: string) {
  try {
    const url = new URL(urlValue)
    return `${url.protocol}//${url.host}${url.pathname}`
  } catch {
    return urlValue
  }
}

export function useWalletInvalidationSocket(walletId: string | null, enabled = true) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled || !walletId) return

    const baseUrl = process.env.NEXT_PUBLIC_WALLET_INVALIDATION_WS_URL
    if (!baseUrl) {
      logWarn(
        'wallet-sync:ws',
        { message: 'Wallet invalidation socket is disabled because NEXT_PUBLIC_WALLET_INVALIDATION_WS_URL is missing' },
        { walletId },
      )
      return
    }

    const url = parseSocketUrl(baseUrl, walletId)
    if (!url) {
      logWarn(
        'wallet-sync:ws',
        { message: 'Wallet invalidation socket URL is invalid' },
        { walletId, baseUrl },
      )
      return
    }

    const socketDetails = {
      walletId,
      socketUrl: sanitizeSocketUrl(url),
    }

    logInfo('wallet-sync:ws', 'Connecting wallet invalidation socket', socketDetails)

    const socket = new WebSocket(url)
    socket.onopen = () => {
      logInfo('wallet-sync:ws', 'Wallet invalidation socket connected', socketDetails)
    }

    socket.onerror = () => {
      logError(
        'wallet-sync:ws',
        { message: 'Wallet invalidation socket emitted an error event' },
        socketDetails,
      )
    }

    socket.onclose = (event) => {
      logInfo('wallet-sync:ws', 'Wallet invalidation socket closed', {
        ...socketDetails,
        code: event.code,
        reason: event.reason || null,
        wasClean: event.wasClean,
      })
    }

    socket.onmessage = (event) => {
      const raw = typeof event.data === 'string' ? event.data : ''
      if (!raw) {
        logWarn(
          'wallet-sync:ws',
          { message: 'Ignoring empty wallet invalidation message' },
          socketDetails,
        )
        return
      }

      let message: WalletInvalidationMessage | null = null
      try {
        message = JSON.parse(raw) as WalletInvalidationMessage
      } catch (error) {
        logWarn('wallet-sync:ws', error, {
          ...socketDetails,
          rawPreview: raw.slice(0, 200),
        })
        return
      }

      if (message.walletId && message.walletId !== walletId) {
        logInfo('wallet-sync:ws', 'Ignoring wallet invalidation for another wallet', {
          ...socketDetails,
          messageWalletId: message.walletId,
          query: message.query ?? null,
          type: message.type ?? null,
        })
        return
      }

      if (message.query === 'snapshot') {
        logInfo('wallet-sync:ws', 'Invalidating wallet snapshot query', {
          ...socketDetails,
          query: 'snapshot',
        })
        void queryClient.invalidateQueries({ queryKey: walletQueryKeys.snapshot(walletId) })
        return
      }

      if (message.query === 'transactions') {
        logInfo('wallet-sync:ws', 'Invalidating wallet transactions query', {
          ...socketDetails,
          query: 'transactions',
        })
        void queryClient.invalidateQueries({
          queryKey: walletQueryKeys.transactions(walletId, null, 25),
        })
        return
      }

      if (!message.query || message.query === 'all' || message.type === 'wallet.invalidate') {
        logInfo('wallet-sync:ws', 'Invalidating all wallet queries', {
          ...socketDetails,
          query: message.query ?? 'all',
          type: message.type ?? null,
        })
        void queryClient.invalidateQueries({ queryKey: walletQueryKeys.wallet(walletId) })
      }
    }

    return () => {
      socket.close(1000, 'wallet-invalidation-cleanup')
    }
  }, [enabled, queryClient, walletId])
}

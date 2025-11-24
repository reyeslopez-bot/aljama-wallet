// components/wallet/ui/WalletButton.tsx
'use client'

import { useState } from 'react'
import { useAccount, useConnect, useDisconnect, type Connector } from 'wagmi'

const IGNORABLE_SUBSTRINGS = [
  'Connection request reset',
  'Connection request cancelled',
  'User closed modal',
  'User rejected the request',
  'User rejected request',
]

function isIgnorableError(err: unknown): boolean {
  const msg =
    typeof err === 'string'
      ? err
      : (err as any)?.message || (err as any)?.toString?.() || ''

  return IGNORABLE_SUBSTRINGS.some((s) => msg.includes(s))
}

export default function WalletButton() {
  const { address, isConnected, isConnecting } = useAccount()
  const { connectors, connectAsync, isPending } = useConnect()
  const { disconnectAsync } = useDisconnect()

  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  async function handleConnect() {
    setError(null)

    // pick “best” connector – prefer injected, then first
    let connector: Connector | undefined =
      connectors.find((c) => c.id === 'injected') ?? connectors[0]

    if (!connector) {
      setError('No wallet connectors are configured.')
      return
    }

    try {
      setIsBusy(true)
      await connectAsync({ connector })
    } catch (err) {
      if (isIgnorableError(err)) {
        console.info('[wallet] Ignored user-cancelled connect:', err)
        return
      }
      console.error('[wallet] Connect failed:', err)
      setError('Failed to connect. Check your wallet and try again.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleDisconnect() {
    setError(null)
    try {
      setIsBusy(true)
      await disconnectAsync()
    } catch (err) {
      console.error('[wallet] Disconnect failed:', err)
      setError('Failed to disconnect.')
    } finally {
      setIsBusy(false)
    }
  }

  const loading = isPending || isConnecting || isBusy

  if (isConnected && address) {
    const short = `${address.slice(0, 6)}...${address.slice(-4)}`
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs md:text-sm text-[#e0a17a] font-medium">
          {short}
        </span>
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={loading}
          className="
            px-3 py-1.5 rounded-full text-xs md:text-sm
            bg-black/40 border border-[#e0a17a]/60
            text-[#f9e7cf]
            hover:bg-black/60 hover:border-[#f3b78a]
            disabled:opacity-60
            transition
          "
        >
          {loading ? '…' : 'Disconnect'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleConnect}
        disabled={loading}
        className="
          px-4 py-2 rounded-full text-xs md:text-sm font-medium
          bg-gradient-to-r from-amber-500 to-orange-500
          text-white shadow-lg
          hover:brightness-110 hover:shadow-xl
          disabled:opacity-60
          transition
        "
      >
        {loading ? 'Connecting…' : 'Connect wallet'}
      </button>
      {error && (
        <p className="max-w-xs text-[10px] md:text-xs text-red-300 text-right">
          {error}
        </p>
      )}
    </div>
  )
}

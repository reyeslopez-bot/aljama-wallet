// components/wallet/ui/WalletDetector.tsx
'use client'

import { useAccount } from 'wagmi'

export default function WalletDetector() {
  const { address, isConnected } = useAccount()

  if (!isConnected || !address) return null

  const display = `EOA: ${address.slice(0, 6)}…${address.slice(-4)}`

  return (
    <div className="rounded-full border border-emerald-400/30 bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-100 shadow-lg shadow-emerald-500/20">
      {display}
    </div>
  )
}

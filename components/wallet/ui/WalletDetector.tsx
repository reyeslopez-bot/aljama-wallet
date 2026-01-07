//components/wallet/ui/WalletDetector.tsx
'use client'

import { useAccount } from 'wagmi'

export default function WalletDetector() {
  const { address, isConnected } = useAccount()

  if (!isConnected || !address) return null

  const display = `EOA: ${address.slice(0, 6)}…${address.slice(-4)}`

  return (
    <div className="px-3 py-1 rounded-full text-xs font-medium text-white shadow-md bg-emerald-600">
      {display}
    </div>
  )
}

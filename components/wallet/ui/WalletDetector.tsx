'use client'

import { useConnection } from 'wagmi'

export default function WalletDetector() {
  const { address, isConnected, chain, connector } = useConnection()

  if (!isConnected || !address) return null

  const addr = `${address.slice(0, 6)}…${address.slice(-4)}`
  const chainName = chain?.name ?? `Chain ${chain?.id ?? '—'}`
  const walletName = connector?.name ?? 'Wallet'

  const display = `${chainName} · ${walletName} · ${addr}`

  return (
    <div className="rounded-full border border-emerald-400/30 bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-100 shadow-lg shadow-emerald-500/20">
      {display}
    </div>
  )
}

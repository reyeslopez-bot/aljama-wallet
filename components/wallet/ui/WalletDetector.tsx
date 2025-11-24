"use client"

import { useAccount } from "wagmi"
import { useAljamaWallet } from "@/components/wallet/context/WalletContext"

export default function WalletDetector() {
  const { address: eoaAddress, isConnected } = useAccount()
  const { wallet } = useAljamaWallet() // your local encrypted wallet

  const localAddress = wallet?.address

  // Pick which identity to show
  const display = (() => {
    if (isConnected && eoaAddress) {
      return `EOA: ${eoaAddress.slice(0, 6)}…${eoaAddress.slice(-4)}`
    }
    if (localAddress) {
      return `Local: ${localAddress.slice(0, 6)}…${localAddress.slice(-4)}`
    }
    return null
  })()

  // Nothing connected → show nothing
  if (!display) return null

  const isActive = isConnected || localAddress
  const color = isActive ? "bg-emerald-600" : "bg-zinc-700"

  return (
    <div
      className={`
        px-3 py-1 rounded-full text-xs font-medium text-white shadow-md
        ${color}
      `}
    >
      {display}
    </div>
  )
}

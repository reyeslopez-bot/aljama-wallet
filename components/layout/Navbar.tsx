'use client'

import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'

export default function Navbar() {
  const { address, isConnected } = useAccount()

  return (
    <nav
      className="
        fixed top-0 left-0 right-0 z-50
        px-4 py-3
        flex items-center justify-between
        text-white
        bg-gradient-to-b
        from-[#0d0d0d]/70
        via-[#2e1d0f]/40
        to-transparent
        backdrop-blur-xl
        shadow-[0_4px_20px_rgba(0,0,0,0.35)]
        border-b border-white/10
      "
    >
      <div className="text-xl font-semibold tracking-wide">
        🔑 Aljama Wallet
      </div>

      <div className="flex items-center space-x-4">
        {isConnected && address && (
          <span className="text-sm text-[#e0a17a] font-medium">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        )}
        <ConnectKitButton />
      </div>
    </nav>
  )
}

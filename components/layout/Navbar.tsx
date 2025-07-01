'use client'

import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'

export default function Navbar() {
  const { address, isConnected } = useAccount()

  return (
    <nav className="w-full px-4 py-3 bg-[#1a1a1a] text-white flex items-center justify-between shadow-md z-50">
      <div className="text-xl font-bold">🔑 Aljama Wallet</div>

      <div className="flex items-center space-x-4">
        {isConnected && address && (
          <span className="text-sm text-[#d96f42]">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        )}
        <ConnectKitButton />
      </div>
    </nav>
  )
}


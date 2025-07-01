'use client'

import { useAccount } from 'wagmi'
import BalanceDisplay from '@/components/BalanceDisplay'
import { TokenDashboard } from '@/components/wallet/TokenDashboard'

export default function DashboardPage() {
  const { address, isConnected } = useAccount()

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-3xl font-bold text-white">Your Wallet Dashboard</h1>

      {!isConnected ? (
        <p className="text-zinc-400">Please connect your wallet using the top right button.</p>
      ) : (
        <>
          <BalanceDisplay address={address!} className="text-white" />

          <div className="mt-6">
            <TokenDashboard />
          </div>
        </>
      )}
    </main>
  )
}


'use client'

import { useAccount } from 'wagmi'

export default function DashboardClient() {
  const { address, isConnected } = useAccount()
  return (
    <div className="text-white">
      <div className="text-sm text-white/70">Status: {isConnected ? 'connected' : 'disconnected'}</div>
      <div className="mt-2 font-mono">{address ?? '—'}</div>
    </div>
  )
}
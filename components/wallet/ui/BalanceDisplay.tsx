'use client'

import React, { useState } from 'react'
import { useBalance, useConnect, type Connector } from 'wagmi'
import { mainnet, sepolia, polygon, base } from 'viem/chains'

const supportedChains = [mainnet, sepolia, polygon, base]

export default function BalanceDisplay({
  address,
  className = '',
}: {
  address: `0x${string}`
  className?: string
}) {
  return (
    <div className={className}>
      <div className="mb-2 font-bold">Native Balances:</div>
      <ul className="space-y-1">
        {supportedChains.map((c) => (
          <ChainBalance key={c.id} chainId={c.id} address={address} />
        ))}
      </ul>

      <div className="mt-4">
        <ConnectButtons />
      </div>
    </div>
  )
}

function ChainBalance({ chainId, address }: { chainId: number; address: `0x${string}` }) {
  const { data, isLoading } = useBalance({ address, chainId })

  const chainName = supportedChains.find((c) => c.id === chainId)?.name ?? `Chain ${chainId}`

  if (isLoading) return <li>{chainName}: Loading…</li>
  if (!data?.formatted) return <li>{chainName}: No balance</li>

  return (
    <li>
      {chainName}: {data.formatted} {data.symbol}
    </li>
  )
}

function ConnectButtons() {
  const { connectors, connectAsync, error, isPending } = useConnect()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const handleConnect = async (connector: Connector) => {
    setPendingId(connector.id)
    try {
      await connectAsync({ connector })
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="space-y-2">
      {connectors.map((connector) => {
        const connecting = pendingId === connector.id
        return (
          <button
            key={connector.id}
            onClick={() => handleConnect(connector)}
            disabled={!connector.ready || isPending}
            className="rounded bg-slate-700 px-3 py-2 text-white"
          >
            {connector.name}
            {connecting && ' (connecting…)'}
          </button>
        )
      })}
      {error && <p className="text-red-600">{error.message}</p>}
    </div>
  )
}

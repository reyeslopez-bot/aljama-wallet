// components/BalanceDisplay.tsx
'use client'

import { useBalance, useNetwork } from 'wagmi'
import { mainnet, sepolia, polygon, base } from 'wagmi/chains'

const supportedChains = [mainnet, sepolia, polygon, base]

export default function BalanceDisplay({
  address,
  className = '',
}: {
  address: `0x${string}`
  className?: string
}) {
  const { chain } = useNetwork()

  return (
    <div className={className}>
      <div className="mb-2 font-bold">Native Balances:</div>
      <ul className="space-y-1">
        {supportedChains.map((c) => (
          <ChainBalance key={c.id} chainId={c.id} address={address} />
        ))}
      </ul>
    </div>
  )
}

function ChainBalance({ chainId, address }: { chainId: number; address: `0x${string}` }) {
  const { data, isLoading } = useBalance({ address, chainId })

  const chainName = supportedChains.find((c) => c.id === chainId)?.name || `Chain ${chainId}`

  if (isLoading) return <li>{chainName}: Loading...</li>
  if (!data?.formatted) return <li>{chainName}: No balance</li>

  return (
    <li>
      {chainName}: {data.formatted} {data.symbol}
    </li>
  )
}


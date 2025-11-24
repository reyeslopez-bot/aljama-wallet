// components/wallet/ui/BalanceDisplay.tsx
'use client'

import { useAccount, useBalance } from 'wagmi'
import { mainnet, sepolia, polygon, base } from 'viem/chains'

const supportedChains = [mainnet, sepolia, polygon, base]

type Props = {
  className?: string
}

export default function BalanceDisplay({ className = '' }: Props) {
  const { address, isConnected } = useAccount()

  if (!isConnected || !address) {
    return (
      <div className={className}>
        <div className="px-4 py-2 rounded-lg bg-black/40 text-xs text-neutral-300">
          Wallet not connected.
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="mb-2 text-sm font-semibold text-[#f9e7cf]">
        Native balances
      </div>

      <ul className="space-y-1 text-sm text-[#f5f0e6]">
        {supportedChains.map((c) => (
          <ChainBalance
            key={c.id}
            chainId={c.id}
            address={address}
          />
        ))}
      </ul>
    </div>
  )
}

function ChainBalance({
  chainId,
  address,
}: {
  chainId: number
  address: `0x${string}`
}) {
  const { data, isLoading, isError } = useBalance({
    address,
    chainId,
  })

  const chainName = supportedChains.find((c) => c.id === chainId)?.name ?? `Chain ${chainId}`

  if (isLoading) return <li>{chainName}: Loading…</li>
  if (isError) return <li>{chainName}: Error loading balance</li>
  if (!data?.formatted) return <li>{chainName}: No balance</li>

  return (
    <li>
      {chainName}: {data.formatted.slice(0, 10)} {data.symbol}
    </li>
  )
}

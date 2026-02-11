// components/wallet/ui/BalanceDisplay.tsx
'use client'

import { useBalance, useConnection } from 'wagmi'
import { formatUnits } from 'viem'
import { mainnet, sepolia, polygon, base } from 'viem/chains'
import { useTranslations } from 'next-intl'

const supportedChains = [mainnet, sepolia, polygon, base]

type Props = {
  className?: string
}

export default function BalanceDisplay({ className = '' }: Props) {
  const t = useTranslations('wallet')
  const { address, isConnected } = useConnection()

  if (!isConnected || !address) {
    return (
      <div className={className}>
        <div className="surface-inner px-4 py-3 text-xs text-ivory/60">
          {t('walletNotConnected')}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="mb-2 text-sm font-semibold text-ivory">
        {t('nativeBalances')}
      </div>

      <ul className="space-y-2 text-sm text-ivory/80">
        {supportedChains.map((c) => (
          <ChainBalance key={c.id} chainId={c.id} address={address} />
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
  const t = useTranslations('wallet')
  const { data, isLoading, isError } = useBalance({ address, chainId })

  const chainName =
    supportedChains.find((c) => c.id === chainId)?.name ?? `Chain ${chainId}`

  if (isLoading) {
    return (
      <li className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs text-ivory/60">
        <span>{chainName}</span>
        <span>{t('loading')}</span>
      </li>
    )
  }
  if (isError) {
    return (
      <li className="flex items-center justify-between rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
        <span>{chainName}</span>
        <span>{t('error')}</span>
      </li>
    )
  }
  if (!data) {
    return (
      <li className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs text-ivory/60">
        <span>{chainName}</span>
        <span>—</span>
      </li>
    )
  }

  // wagmi v3: data = { value: bigint; decimals: number; symbol: string; ... }
  const raw = formatUnits(data.value, data.decimals)

  // keep it cheap: show up to 6 fractional digits, no float conversion
  const [intPart, fracPart = ''] = raw.split('.')
  const short =
    fracPart.length > 0 ? `${intPart}.${fracPart.slice(0, 6)}` : intPart

  return (
    <li className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm text-ivory">
      <span className="text-ivory/70">{chainName}</span>
      <span className="font-mono text-xs text-saffron/80">
        {short} {data.symbol}
      </span>
    </li>
  )
}

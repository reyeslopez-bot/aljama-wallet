// components/wallet/ui/BalanceDisplay.tsx
'use client'

import { useMemo } from 'react'
import { useAccount, useBalance } from 'wagmi'
import { mainnet, sepolia, polygon, base } from 'viem/chains'

const supportedChains = [mainnet, sepolia, polygon, base]

type Props = {
  className?: string
}

export default function BalanceDisplay({ className = '' }: Props) {
  const { address, isConnected } = useAccount()

  const heading = useMemo(
    () => (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Balances</p>
          <h3 className="text-xl font-semibold text-white">Multichain overview</h3>
        </div>
        <span className="rounded-full bg-emerald-300/10 px-3 py-1 text-xs text-emerald-200">
          Live
        </span>
      </div>
    ),
    []
  )

  if (!isConnected || !address) {
    return (
      <section
        className={`${className} rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/80 to-black/70 p-6 shadow-xl shadow-emerald-500/5 backdrop-blur`}
      >
        {heading}
        <p className="mt-4 text-sm text-zinc-400">Connect a wallet to see balances across supported chains.</p>
      </section>
    )
  }

  return (
    <section
      className={`${className} rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/80 to-black/70 p-6 shadow-xl shadow-emerald-500/5 backdrop-blur`}
    >
      {heading}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {supportedChains.map((chain) => (
          <ChainBalance key={chain.id} chainId={chain.id} address={address} />
        ))}
      </div>
    </section>
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

  if (isLoading) {
    return <SkeletonCard title={chainName} subtitle="Fetching…" />
  }

  if (isError) {
    return <ErrorCard title={chainName} />
  }

  if (!data?.formatted) {
    return <SkeletonCard title={chainName} subtitle="No balance detected" />
  }

  const displayValue = `${Number.parseFloat(data.formatted).toFixed(4)} ${data.symbol}`

  return (
    <article className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-4 transition hover:-translate-y-[1px] hover:border-emerald-300/30 hover:bg-white/10">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/5 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
      <div className="relative">
        <p className="text-xs uppercase tracking-[0.14em] text-emerald-200/70">{chainName}</p>
        <p className="mt-2 text-lg font-semibold text-white">{displayValue}</p>
        <p className="mt-1 text-xs text-zinc-400">Updated live via RPC</p>
      </div>
    </article>
  )
}

function SkeletonCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <article className="relative overflow-hidden rounded-xl border border-white/5 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">{title}</p>
      <div className="mt-2 h-6 w-32 animate-pulse rounded bg-white/10" />
      <p className="mt-3 text-xs text-zinc-500">{subtitle}</p>
    </article>
  )
}

function ErrorCard({ title }: { title: string }) {
  return (
    <article className="relative overflow-hidden rounded-xl border border-red-300/20 bg-red-500/10 p-4 text-red-100">
      <p className="text-xs uppercase tracking-[0.14em]">{title}</p>
      <p className="mt-2 text-sm font-semibold">Error loading balance</p>
      <p className="mt-1 text-xs text-red-200/80">Check your RPC or network health.</p>
    </article>
  )
}

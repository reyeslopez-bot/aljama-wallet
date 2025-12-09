'use client'

import { useMemo } from 'react'
import { useAccount, useEnsName, useNetwork } from 'wagmi'

function truncateAddress(address?: string) {
  if (!address) return ''
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function WalletStatus() {
  const { address, isConnected } = useAccount()
  const { chain } = useNetwork()
  const { data: ensName } = useEnsName({ address: address as `0x${string}` | undefined })

  const statusBadge = useMemo(() => {
    if (!isConnected) {
      return (
        <span className="rounded-full bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-200">Disconnected</span>
      )
    }

    return <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">Secure</span>
  }, [isConnected])

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/80 via-black/80 to-zinc-900/60 p-6 shadow-xl shadow-emerald-500/5 backdrop-blur">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.12),transparent_35%)]" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">Wallet health</p>
          <h3 className="text-2xl font-semibold text-white">Connection posture</h3>
          <p className="mt-2 max-w-md text-sm text-zinc-400">
            We keep your signer isolated and highlight any gaps before transacting.
          </p>

          <dl className="mt-4 space-y-3 text-sm text-white/90">
            <div className="flex items-center gap-3">
              <dt className="w-24 text-xs uppercase tracking-[0.2em] text-zinc-500">Status</dt>
              <dd>{statusBadge}</dd>
            </div>
            <div className="flex items-center gap-3">
              <dt className="w-24 text-xs uppercase tracking-[0.2em] text-zinc-500">Address</dt>
              <dd className="rounded-lg bg-white/5 px-3 py-2 text-white/90">
                {isConnected ? ensName ?? truncateAddress(address) : 'Not connected'}
              </dd>
            </div>
            <div className="flex items-center gap-3">
              <dt className="w-24 text-xs uppercase tracking-[0.2em] text-zinc-500">Network</dt>
              <dd className="rounded-lg bg-white/5 px-3 py-2 text-white/90">
                {chain?.name ?? '—'}
              </dd>
            </div>
          </dl>
        </div>
        <div className="hidden h-full min-w-[1px] flex-1 items-center justify-end lg:flex">
          <div className="h-36 w-36 rounded-full bg-gradient-to-br from-emerald-300/30 via-emerald-400/10 to-transparent blur-3xl" />
        </div>
      </div>
    </section>
  )
}

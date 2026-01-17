'use client'

import { useConnectModal } from '@rainbow-me/rainbowkit'
import { motion } from 'framer-motion'
import { useAccount } from 'wagmi'

export function ConnectWalletPanel() {
  const { openConnectModal } = useConnectModal()
  const { address, isConnected } = useAccount()

  return (
    <section className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 via-white/5 to-black/60 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="absolute -left-24 -top-24 h-48 w-48 rounded-full bg-[#caa56a]/30 blur-[120px] transition-all duration-500 group-hover:scale-110" />
      <div className="absolute -right-16 bottom-0 h-40 w-40 rounded-full bg-sky-400/20 blur-[120px]" />

      <header className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-amber-100/70">
            Connect + Sync
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[#f7f0e6] sm:text-3xl">
            Link your EVM wallet
          </h2>
          <p className="text-sm text-white/70">
            Use WalletConnect or browser wallets to authenticate instantly.
          </p>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-white/70">
          {isConnected ? 'Connected' : 'Ready to connect'}
        </span>
      </header>

      <div className="relative mt-6 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-inner shadow-black/40">
          {isConnected ? (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/80">
                Wallet linked
              </p>
              <p className="text-sm text-white/70">Primary address</p>
              <p className="break-all font-mono text-sm text-emerald-100">{address}</p>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-white/70">
              <p className="flex items-center gap-2 font-medium text-amber-100/80">
                <span className="h-2 w-2 rounded-full bg-amber-300" />
                No wallet connected
              </p>
              <p>Open the connector and approve access to sync balances.</p>
            </div>
          )}
        </div>

        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => openConnectModal?.()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#5da9e9] to-[#2f6fb4] px-5 py-3 text-base font-semibold tracking-wide text-white shadow-lg shadow-sky-400/30 transition focus:outline-none focus:ring-2 focus:ring-sky-200/40"
        >
          {isConnected ? 'Switch wallet' : 'Connect wallet'}
        </motion.button>
      </div>
    </section>
  )
}

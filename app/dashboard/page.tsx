'use client'

import { useAccount } from 'wagmi'
import BalanceDisplay from '@/components/wallet/ui/BalanceDisplay'
import { WalletStatus } from '@/components/dashboard/WalletStatus'

const upcomingActions = [
  {
    title: 'Session review',
    detail: 'Inspect pending approvals and revoke stale sessions.',
  },
  {
    title: 'Ledger handshake',
    detail: 'Pair a hardware signer for the next transaction window.',
  },
  {
    title: 'Backup check',
    detail: 'Verify recovery phrases are stored offline and encrypted.',
  },
]

export default function DashboardPage() {
  const { isConnected } = useAccount()

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_20%_20%,rgba(34,197,94,0.07),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.08),transparent_30%)]">
      <main className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-col gap-2 pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">Aljama Wallet</p>
            <h1 className="text-3xl font-bold text-white md:text-4xl">Control center</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Monitor balances, verify connection posture, and stage secure actions before authorizing any onchain movement.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-emerald-100">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-300" aria-hidden />
            {isConnected ? 'Ready to sign' : 'Awaiting wallet connection'}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <BalanceDisplay />

            <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/0 p-6 shadow-inner shadow-emerald-500/5 backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Pre-flight</p>
                  <h2 className="text-lg font-semibold text-white">Operational checklist</h2>
                </div>
                <span className="text-xs text-emerald-200">Manual</span>
              </div>
              <ul className="mt-4 space-y-3">
                {upcomingActions.map((item) => (
                  <li
                    key={item.title}
                    className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-zinc-200"
                  >
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-300" aria-hidden />
                    <div>
                      <p className="font-semibold text-white">{item.title}</p>
                      <p className="text-xs text-zinc-400">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="space-y-6">
            <WalletStatus />

            <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/0 p-6 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Activity</p>
              <h2 className="text-lg font-semibold text-white">Latest movement</h2>
              <p className="mt-3 text-sm text-zinc-400">No recent transactions. Start by connecting and signing your first transfer.</p>
              <div className="mt-4 h-28 rounded-xl border border-dashed border-white/10 bg-white/5" />
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}

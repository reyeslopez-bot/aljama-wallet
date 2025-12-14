'use client'

import { useState } from 'react'
import {
  ArrowTrendingUpIcon,
  CheckBadgeIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { useAljamaWallet } from '../wallet/context/WalletContext'

type CreatedWalletData = {
  address: string
}

const assurances = [
  {
    title: 'Local-first keys',
    copy: 'Session-scoped vaults never leave your device until you approve.',
    icon: ShieldCheckIcon,
  },
  {
    title: 'Zero-friction onboarding',
    copy: 'Generate, encrypt, and sync without exposing the seed.',
    icon: SparklesIcon,
  },
]

const stats = [
  { label: 'Live networks', value: 'L2 + EVM', hint: 'Ready for mainnet + testnet' },
  { label: 'Session health', value: 'Verified', hint: 'Integrity + replay guards' },
  { label: 'Latency', value: '<120ms', hint: 'Optimized RPC routing' },
]

const rituals = [
  'Encrypt your private key with a passphrase you control.',
  'Persist the encrypted payload locally for this device only.',
  'Unlock and sign with explicit consent; nothing moves silently.',
]

export default function HeroCard() {
  const { persistEncryptedPayload, unlockWithPassword } = useAljamaWallet()
  const [walletData, setWalletData] = useState<CreatedWalletData | null>(null)

  const createWallet = async () => {
    try {
      const passwordRaw =
        typeof window !== 'undefined'
          ? window.prompt('Set a password to encrypt your new wallet:')
          : null

      const password = passwordRaw?.trim()
      if (!password) {
        alert('Password is required to create a wallet.')
        return
      }

      const res = await fetch('/api/create-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed to create wallet (${res.status})`)
      }

      const data: { address: string; encrypted: string } = await res.json()

      persistEncryptedPayload(data.encrypted)

      const unlocked = await unlockWithPassword(password, data.encrypted)
      if (!unlocked) {
        throw new Error('Unable to unlock wallet with provided password')
      }

      setWalletData({ address: unlocked.address })
    } catch (err) {
      console.error('Wallet creation failed', err)
      alert('❌ Failed to create wallet.')
    }
  }

  const copyAddress = async () => {
    if (!walletData?.address || typeof navigator === 'undefined') return
    try {
      await navigator.clipboard.writeText(walletData.address)
    } catch (err) {
      console.error('Unable to copy address', err)
    }
  }

  return (
    <section className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black/50 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-[#d96f42]/25 via-white/5 to-transparent" />
      <div className="absolute left-12 top-12 h-40 w-40 rounded-full bg-[#d96f42]/20 blur-3xl" />
      <div className="absolute right-0 top-1/3 h-64 w-64 translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-8">
          <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-white/80">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Self-custody rituals</span>
            <span className="rounded-full border border-[#d96f42]/40 bg-[#d96f42]/15 px-3 py-1 text-[#f7c7b3]">Zero-knowledge ready</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-[#faf3e0] sm:text-5xl">
              Refined keys for the dunes age
            </h1>
            <p className="max-w-2xl text-lg text-white/70">
              Compose wallets, encrypt them locally, and move across EVM ecosystems with dune-smooth flows. Your keys stay with
              you; Aljama simply choreographs the experience.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={createWallet}
              className="group relative inline-flex items-center gap-2 rounded-full border border-[#d96f42]/60 bg-[#d96f42]/90 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-[#d96f42]/20 transition hover:scale-[1.02] hover:border-[#f08b64] hover:bg-[#f08b64]"
            >
              <SparklesIcon className="h-5 w-5" />
              Mint a vault
              <span className="absolute inset-0 -z-10 rounded-full bg-white/10 opacity-0 blur-lg transition group-hover:opacity-100" />
            </button>
            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-base font-semibold text-white/80 backdrop-blur hover:border-white/30 hover:text-white"
            >
              <ArrowTrendingUpIcon className="h-5 w-5" />
              Open dashboard
            </a>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-left shadow-inner shadow-black/30"
              >
                <p className="text-sm text-white/60">{item.label}</p>
                <p className="text-2xl font-semibold text-[#faf3e0]">{item.value}</p>
                <p className="text-xs text-white/50">{item.hint}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {assurances.map(({ title, copy, icon: Icon }) => (
              <div
                key={title}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/30"
              >
                <div className="mt-1 rounded-full border border-white/20 bg-white/10 p-2 text-[#f7c7b3]">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-[#faf3e0]">{title}</p>
                  <p className="text-sm text-white/65">{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-white/10 via-white/5 to-black/40 p-6 shadow-xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(247,199,179,0.2),transparent_40%)]" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.08em] text-white/60">Session vault</p>
                <p className="text-xl font-semibold text-[#faf3e0]">Hardware-grade posture</p>
                <p className="text-sm text-white/60">Encrypted payloads, timeboxed unlocks, audit-ready events.</p>
              </div>
              <span className="rounded-full border border-emerald-400/40 bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                Online
              </span>
            </div>

            <div className="relative mt-6 space-y-3">
              {rituals.map((step, index) => (
                <div key={step} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#d96f42]/20 text-xs font-semibold text-[#faf3e0]">
                    {index + 1}
                  </span>
                  <p className="leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
          </div>

          {walletData ? (
            <div className="space-y-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                    <CheckBadgeIcon className="h-5 w-5" /> Wallet created
                  </p>
                  <p className="font-mono text-sm text-white/90 break-all">{walletData.address}</p>
                </div>
                <button
                  onClick={copyAddress}
                  className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/80 hover:border-white/40"
                >
                  Copy
                </button>
              </div>
              <p className="text-sm text-white/70">
                Encrypted with your passphrase and stored for this session. Keep the password safe to unlock on this device.
              </p>
              <button
                onClick={() => setWalletData(null)}
                className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:border-white/30"
              >
                Dismiss
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
              Mint a vault to activate your session and sync with the detector floating on the page.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

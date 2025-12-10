// app/(wallet)/unlock/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'

import { useUnlockWallet } from '@/infra/utils/useUnlockWallet'
import { loadEncryptedWallet } from '@/lib/storage/walletStorage'
import { useWalletStore } from '@/infra/state/walletStore'

export default function UnlockWalletPage() {
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [recentAddress, setRecentAddress] = useState<string | null>(null)
  const [hasEncryptedWallet, setHasEncryptedWallet] = useState(false)

  const { isUnlocking, error, handleUnlock } = useUnlockWallet()
  const setWallet = useWalletStore((s) => s.setWallet)

  useEffect(() => {
    setHasEncryptedWallet(!!loadEncryptedWallet())
  }, [])

  const errorMessage = useMemo(() => localError ?? error, [error, localError])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    const encrypted = loadEncryptedWallet()
    if (!encrypted) {
      setLocalError('No encrypted wallet found in this session. Create one first.')
      setHasEncryptedWallet(false)
      return
    }

    const unlocked = await handleUnlock({ encrypted, password })

    if (unlocked) {
      setWallet(unlocked)
      setRecentAddress(unlocked.address)
      setHasEncryptedWallet(true)
      // router.push('/dashboard') can go here when dashboard exists
    }
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#0b0909] via-[#0f1117] to-[#0a0c12] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-amber-500/10 blur-[160px]" />
        <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-emerald-400/10 blur-[180px]" />
      </div>

      <div className="relative mx-auto flex max-w-4xl flex-col gap-6 px-6 py-16 lg:px-8">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-100/80">Unlock ritual</p>
          <h1 className="text-4xl font-semibold leading-tight text-[#f7f0e6] sm:text-5xl">
            Bring your encrypted vault back to life.
          </h1>
          <p className="max-w-3xl text-base text-white/70">
            We only store material in-session. Confirm your passphrase to restore the wallet and resume your flows.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/50 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-3 pb-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.14em] text-white/70">
              Session state
              <span
                className={`h-2 w-2 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.8)] ${
                  hasEncryptedWallet ? 'bg-emerald-400' : 'bg-red-400'
                }`}
              />
              {hasEncryptedWallet ? 'Encrypted wallet detected' : 'No wallet in memory'}
            </span>

            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-50">
              {isUnlocking ? 'Decrypting' : 'Protected'}
            </span>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block text-xs uppercase tracking-[0.16em] text-white/60">Passphrase</label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-inner shadow-black/40 focus-within:border-amber-200/40">
                <span className="text-[11px] uppercase tracking-[0.2em] text-amber-100/70">Unlock</span>
                <input
                  type="password"
                  className="w-full bg-transparent text-base text-white placeholder:text-white/40 focus:outline-none"
                  placeholder="Enter the password you used when creating"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={isUnlocking || !password.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#d96f42] to-[#b95734] px-5 py-3 text-base font-semibold tracking-wide text-white shadow-lg shadow-[#d96f42]/30 transition hover:scale-[1.02] hover:shadow-xl focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isUnlocking ? 'Unlocking…' : 'Unlock Wallet'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Session only – nothing leaves the browser
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-200" />
                Wrong password? We block unlocks immediately.
              </span>
            </div>
          </form>

          <div className="mt-6 rounded-2xl border border-white/5 bg-white/5 p-4 shadow-inner shadow-black/30">
            {recentAddress ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/80">Unlocked</p>
                <p className="text-sm text-white/70">Wallet hydrated into session store.</p>
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-100">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-200/80">Address</p>
                  <p className="mt-1 break-all font-mono text-base">{recentAddress}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm text-white/70">
                <p className="flex items-center gap-2 font-medium text-amber-100/80">
                  <span className="h-2 w-2 rounded-full bg-amber-300" />
                  Waiting for unlock
                </p>
                <p>Paste the same password you used when creating the wallet. We never persist it elsewhere.</p>
              </div>
            )}

            {errorMessage && (
              <p className="mt-3 text-sm text-red-300">
                {errorMessage}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

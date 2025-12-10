// components/wallet/forms/UnlockWalletForm.tsx
'use client'

import { useState, type FormEvent } from 'react'

import { useUnlockWallet } from '@/infra/utils/useUnlockWallet'
import { loadEncryptedWallet } from '@/lib/storage/walletStorage'

export default function UnlockWalletForm() {
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [recentAddress, setRecentAddress] = useState<string | null>(null)

  const { isUnlocking, error, handleUnlock } = useUnlockWallet()

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLocalError(null)

    const encrypted = loadEncryptedWallet()
    if (!encrypted) {
      setLocalError('No encrypted wallet found in this session. Create one first.')
      return
    }

    const wallet = await handleUnlock({
      encrypted,
      password,
    })

    if (wallet) {
      setRecentAddress(wallet.address)
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/40 p-5 text-white shadow-inner shadow-black/40 backdrop-blur">
      <form onSubmit={onSubmit} className="space-y-3">
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
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#d96f42] to-[#b95734] px-5 py-3 text-sm font-semibold tracking-wide text-white shadow-lg shadow-[#d96f42]/30 transition hover:scale-[1.02] hover:shadow-xl focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {isUnlocking ? 'Unlocking…' : 'Unlock Wallet'}
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
        {recentAddress ? (
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/80">Unlocked</p>
            <p className="font-mono text-base text-emerald-100">{recentAddress}</p>
            <p className="text-xs text-white/60">Hydrated into session store for immediate use.</p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.14em] text-amber-100/80">Waiting for unlock</p>
            <p>Provide the same password you created the wallet with. Nothing leaves the browser.</p>
          </div>
        )}

        {(localError || error) && (
          <p className="mt-3 text-sm text-red-300">{localError ?? error}</p>
        )}
      </div>
    </div>
  )
}

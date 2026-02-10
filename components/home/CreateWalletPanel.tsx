'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import { persistEncryptedSession, persistWalletId } from '@/lib/storage/walletSession'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'

type WalletPreview = {
  address: string
}

type Status = 'idle' | 'pending' | 'success' | 'error'

export function CreateWalletPanel() {
  useComponentTelemetry('CreateWalletPanel')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [walletPreview, setWalletPreview] = useState<WalletPreview | null>(null)
  const setCreateWalletStatus = useDynamicInfoStore((s) => s.setCreateWalletStatus)
  const setCreatedWalletAddress = useDynamicInfoStore((s) => s.setCreatedWalletAddress)

  const disabled = !password.trim() || status === 'pending'

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    if (!password.trim()) {
      setError('Password is required')
      setStatus('error')
      return
    }

    setStatus('pending')
    setError(null)
    setNotice(null)
    setCreateWalletStatus('pending')

    try {
      const res = await fetch('/api/create-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed to create wallet (${res.status})`)
      }

      const data: {
        address: string
        encrypted: string
        walletId?: string | null
        mode?: 'custody' | 'session-only'
        warning?: string
      } = await res.json()

      persistEncryptedSession(data.encrypted)
      if (data.walletId) {
        persistWalletId(data.walletId)
      }
      setWalletPreview({ address: data.address })
      if (data.mode === 'session-only') {
        setNotice(data.warning ?? 'Running in session-only mode.')
      }
      setStatus('success')
      setCreatedWalletAddress(data.address)
      setCreateWalletStatus('success')
    } catch (err) {
      console.error('Wallet creation failed', err)
      const message = err instanceof Error ? err.message : 'Failed to create wallet'
      setError(message)
      setStatus('error')
      setCreateWalletStatus('error', message)
    }
  }

  const badgeColor =
    status === 'success'
      ? 'bg-emerald-400/20 text-emerald-100'
      : 'bg-white/5 text-white/70'

  return (
    <section className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 via-white/5 to-black/60 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="absolute -left-24 -top-24 h-48 w-48 rounded-full bg-[#d96f42]/30 blur-[120px] transition-all duration-500 group-hover:scale-110" />
      <div className="absolute -right-16 bottom-0 h-40 w-40 rounded-full bg-emerald-400/20 blur-[120px]" />

      <header className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-amber-100/70">
            Create + Encrypt
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[#f7f0e6] sm:text-3xl">
            Spin up a fresh vault
          </h2>
          <p className="text-sm text-white/70">
            Generate a wallet, store an encrypted session copy, and sync to the custody vault.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${badgeColor}`}
        >
          {status === 'success' ? 'Ready to use' : 'Custody flow'}
        </span>
      </header>

      <form onSubmit={submit} className="relative mt-6 space-y-4">
        <label className="block text-xs uppercase tracking-[0.16em] text-white/60">
          Password
        </label>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 shadow-inner shadow-black/50 focus-within:border-amber-200/40 focus-within:ring-2 focus-within:ring-amber-200/20">
            <span className="text-xs uppercase tracking-[0.2em] text-amber-100/70">
              Encrypt
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create a passphrase you will remember"
              className="w-full bg-transparent text-base text-white placeholder:text-white/40 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={disabled}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#d96f42] to-[#b95734] px-5 py-3 text-base font-semibold tracking-wide text-white shadow-lg shadow-[#d96f42]/30 transition hover:scale-[1.02] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-amber-200/30 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
          >
            {status === 'pending' ? 'Creating…' : 'Create wallet'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Session
            copy encrypted
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-200" /> Keep the
            password private
          </span>
        </div>
      </form>

      <div className="relative mt-6 rounded-2xl border border-white/5 bg-black/40 p-4 shadow-inner shadow-black/40">
        {walletPreview ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/80">
              Wallet ready
            </p>
            <p className="text-sm text-white/70">
              Keep this tab open; your session copy stays local.
            </p>
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-100">
              <p className="text-xs uppercase tracking-[0.14em] text-emerald-200/80">
                Address
              </p>
              <p className="mt-1 break-all font-mono text-base">
                {walletPreview.address}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-sm text-white/70">
            <p className="flex items-center gap-2 font-medium text-amber-100/80">
              <span className="h-2 w-2 rounded-full bg-amber-300" />
              No wallet created yet
            </p>
            <p>Use a memorable phrase. It encrypts your local session copy.</p>
          </div>
        )}

        {notice && <p className="mt-3 text-xs text-amber-200/90">{notice}</p>}
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      </div>
    </section>
  )
}

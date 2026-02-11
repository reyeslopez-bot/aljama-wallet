'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import { persistEncryptedSession, persistWalletId } from '@/lib/storage/walletSession'
import { useComponentTelemetry } from '@/infra/telemetry/useComponentTelemetry'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'

type WalletPreview = {
  address: string
}

type Status = 'idle' | 'pending' | 'success' | 'error'

export function CreateWalletPanel() {
  useComponentTelemetry('CreateWalletPanel')
  const t = useTranslations('createWallet')
  const tActions = useTranslations('actions')
  const tAuth = useTranslations('auth')
  const { status: sessionStatus } = useSession()
  const locked = sessionStatus !== 'authenticated'
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [mode, setMode] = useState<'custody' | 'session-only' | null>(null)
  const [walletPreview, setWalletPreview] = useState<WalletPreview | null>(null)
  const setCreateWalletStatus = useDynamicInfoStore((s) => s.setCreateWalletStatus)
  const setCreatedWalletAddress = useDynamicInfoStore((s) => s.setCreatedWalletAddress)

  const disabled = locked || !password.trim() || status === 'pending'

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    if (locked) {
      setError(tAuth('unlockActions'))
      setStatus('error')
      return
    }

    if (!password.trim()) {
      setError('Password is required')
      setStatus('error')
      return
    }

    setStatus('pending')
    setError(null)
    setNotice(null)
    setMode(null)
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
      setMode(data.mode ?? null)
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
      ? 'bg-jade/20 text-jade'
      : 'bg-white/5 text-ivory/70'

  return (
    <section className="surface-panel panel-glow-saffron relative p-7 sm:p-8">
      <div className="absolute inset-x-8 top-5 ornament-line" />

      <header className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-saffron/70">{t('eyebrow')}</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-ivory sm:text-3xl">
            {t('title')}
          </h2>
          <p className="text-sm text-ivory/70">{t('body')}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${badgeColor}`}
        >
          {status === 'success'
            ? mode === 'session-only'
              ? t('badgeSessionOnly')
              : t('badgeReady')
            : t('badgeCustody')}
        </span>
      </header>

      <form onSubmit={submit} className="relative mt-6 space-y-4">
        <label className="block text-xs uppercase tracking-[0.16em] text-ivory/60">{t('passwordLabel')}</label>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="surface-inner flex w-full items-center gap-3 px-4 py-3 focus-within:border-saffron/50 focus-within:ring-2 focus-within:ring-saffron/25">
            <span className="text-xs uppercase tracking-[0.2em] text-saffron/70">{t('passwordTag')}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('passwordPlaceholder')}
              disabled={locked}
              className="w-full bg-transparent text-base text-ivory placeholder:text-ivory/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <button
            type="submit"
            disabled={disabled}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#f0d7a0] via-[#dda469] to-[#c7794a] px-5 py-3 text-base font-semibold tracking-wide text-[#1c120a] shadow-lg shadow-[#c7794a]/30 transition hover:scale-[1.02] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-saffron/30 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
          >
            {status === 'pending' ? tActions('creating') : t('button')}
          </button>
        </div>

        {locked && (
          <p className="text-xs uppercase tracking-[0.18em] text-ivory/50">
            {tAuth('unlockActions')}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs text-ivory/60">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {t('tagEncrypted')}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-saffron" /> {t('tagPrivate')}
          </span>
        </div>
      </form>

      <div className="surface-inner relative mt-6 p-4">
        {walletPreview ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.16em] text-jade/80">{t('readyTitle')}</p>
            <p className="text-sm text-ivory/70">{t('readyBody')}</p>
            <div className="rounded-xl border border-jade/30 bg-jade/10 px-4 py-3 text-sm text-jade">
              <p className="text-xs uppercase tracking-[0.14em] text-jade/80">{t('addressLabel')}</p>
              <p className="mt-1 break-all font-mono text-base">
                {walletPreview.address}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-sm text-ivory/70">
            <p className="flex items-center gap-2 font-medium text-saffron/80">
              <span className="h-2 w-2 rounded-full bg-saffron" />
              {t('emptyTitle')}
            </p>
            <p>{t('emptyBody')}</p>
          </div>
        )}

        {notice && <p className="mt-3 text-xs text-saffron/90">{notice}</p>}
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      </div>
    </section>
  )
}

// app/(wallet)/unlock/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAljamaWallet } from '@/components/wallet/context/WalletContext'
import { loadEncryptedSession } from '@/lib/storage/walletSession'

type Banner =
  | { tone: 'success'; message: string }
  | { tone: 'error'; message: string }
  | { tone: 'info'; message: string }

export default function UnlockWalletPage() {
  const router = useRouter()
  const { encryptedPayload, unlockWithPassword } = useAljamaWallet()

  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [banner, setBanner] = useState<Banner | null>(null)

  const hasEncryptedPayload = useMemo(() => {
    return Boolean(encryptedPayload ?? loadEncryptedSession())
  }, [encryptedPayload])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!password.trim()) {
      setStatus('error')
      setBanner({ tone: 'error', message: 'Password is required to unlock the vault.' })
      return
    }

    const payload = encryptedPayload ?? loadEncryptedSession()
    if (!payload) {
      setStatus('error')
      setBanner({ tone: 'error', message: 'No encrypted wallet found in this session.' })
      return
    }

    setStatus('pending')
    setBanner({ tone: 'info', message: 'Decrypting your vault…' })

    try {
      const unlocked = await unlockWithPassword(password.trim(), payload)

      if (!unlocked) {
        throw new Error('Unable to unlock wallet with the provided password')
      }

      setStatus('success')
      setBanner({ tone: 'success', message: 'Wallet unlocked. Redirecting to your dashboard…' })
      setTimeout(() => router.push('/dashboard'), 500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unlock wallet'
      setStatus('error')
      setBanner({ tone: 'error', message })
    }
  }

  const renderBanner = () => {
    if (!banner) return null

    const styles = {
      success: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100',
      error: 'border-red-400/40 bg-red-500/10 text-red-100',
      info: 'border-amber-300/40 bg-amber-200/10 text-amber-50',
    }

    const icon = {
      success: '✔',
      error: '⚠',
      info: '…',
    }

    return (
      <div
        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm backdrop-blur ${styles[banner.tone]}`}
      >
        <span className="text-lg">{icon[banner.tone]}</span>
        <p className="text-left font-medium leading-relaxed">{banner.message}</p>
      </div>
    )
  }

  return (
    <div className="relative mx-auto max-w-5xl space-y-10 pb-24 pt-20">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-black/70 p-10 shadow-2xl shadow-black/30">
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="absolute -left-24 -top-24 h-48 w-48 rounded-full bg-[#d96f42]/25 blur-[140px]" />
        <div className="absolute -right-16 bottom-0 h-40 w-40 rounded-full bg-emerald-400/15 blur-[140px]" />

        <div className="relative grid gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-100/70">Resume session</p>
              <h1 className="text-4xl font-semibold text-white">Unlock your wallet</h1>
              <p className="text-sm text-white/70">
                Provide your password to decrypt the in-memory vault. Your material never leaves this device.
              </p>
            </div>

            {renderBanner()}

            <form onSubmit={onSubmit} className="space-y-4">
              <Input
                type="password"
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your session password"
                autoFocus
                required
                disabled={status === 'pending'}
              />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full sm:w-auto"
                  disabled={status === 'pending' || !password.trim()}
                >
                  {status === 'pending' ? 'Unlocking…' : 'Unlock Wallet'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  className="w-full sm:w-auto"
                  onClick={() => router.push('/')}
                  disabled={status === 'pending'}
                >
                  Back to Home
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-white/50">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {hasEncryptedPayload ? 'Encrypted payload detected' : 'No vault found yet'}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  <span className="h-2 w-2 rounded-full bg-amber-200" />
                  Session stays local
                </span>
              </div>
            </form>
          </div>

          <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6 shadow-inner shadow-black/40">
            <div className="mb-4 space-y-2">
              <p className="text-xs uppercase tracking-[0.16em] text-white/60">Flow notes</p>
              <h2 className="text-xl font-semibold text-white">What to expect</h2>
              <p className="text-sm text-white/60">
                We decrypt the payload entirely in-memory. Successful unlocks hydrate the global wallet context so every
                dashboard tile can load your balances instantly.
              </p>
            </div>

            <ul className="space-y-3 text-sm text-white/70">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-300" />
                Use the same password you set during creation.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-amber-200" />
                If you refresh, the encrypted blob is fetched from session storage.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-red-300" />
                Entering the wrong password will keep the vault locked and show an error banner.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
export const dynamic = 'force-dynamic'
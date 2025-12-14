// app/(wallet)/unlock/page.tsx
'use client'

import { useState } from 'react'
import { useAljamaWallet } from '@/components/wallet/context/WalletContext'
import { loadEncryptedSession } from '@/lib/storage/walletSession'
import { useWalletStore } from '@/infra/state/walletStore'

export default function UnlockWalletPage() {
  const [password, setPassword] = useState('')
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setWallet = useWalletStore((s) => s.setWallet)
  const { encryptedPayload, unlockWithPassword } = useAljamaWallet()

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const encrypted = encryptedPayload ?? loadEncryptedSession()
    if (!encrypted) {
      setError('No encrypted wallet found in this session')
      return
    }

    setIsUnlocking(true)
    setError(null)

    try {
      const unlocked = await unlockWithPassword(password, encrypted)

      if (unlocked) {
        setWallet({ address: unlocked.address, privateKey: unlocked.privateKey })
        // navigate to dashboard if you want
        // router.push('/dashboard')
      } else {
        setError('Unable to unlock wallet with the provided password')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unlock wallet'
      setError(message)
    } finally {
      setIsUnlocking(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        type="password"
        className="border p-2 w-full"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Enter password"
      />

      <button
        type="submit"
        disabled={isUnlocking}
        className="bg-blue-600 text-white p-2 rounded"
      >
        {isUnlocking ? 'Unlocking...' : 'Unlock Wallet'}
      </button>

      {error && <p className="text-red-500">{error}</p>}
    </form>
  )
}

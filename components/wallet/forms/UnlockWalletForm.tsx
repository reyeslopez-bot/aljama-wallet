// components/wallet/forms/UnlockWalletForm.tsx
'use client'

import { useState, type FormEvent } from 'react'

import { useAljamaWallet } from '@/components/wallet/context/WalletContext'
import { loadEncryptedSession } from '@/lib/storage/walletSession'

export default function UnlockWalletForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const { encryptedPayload, unlockWithPassword } = useAljamaWallet()

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const encrypted = encryptedPayload ?? loadEncryptedSession()
    if (!encrypted) {
      setError('No encrypted wallet found in this session')
      return
    }

    setIsUnlocking(true)
    setError(null)

    try {
      const wallet = await unlockWithPassword(password, encrypted)

      if (wallet) {
        console.log('Unlocked wallet:', wallet.address)
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
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        type="submit"
        disabled={isUnlocking}
        className="bg-black text-white px-4 py-2 rounded"
      >
        {isUnlocking ? 'Unlocking…' : 'Unlock Wallet'}
      </button>

      {error && <p className="text-red-600">{error}</p>}
    </form>
  )
}

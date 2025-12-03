// app/(wallet)/unlock/page.tsx

'use client'

import { useState } from 'react'
import { useUnlockWallet } from '@/infra/utils/useUnlockWallet'
import { loadEncryptedWallet } from '@/lib/storage/walletStorage'
import { useWalletStore } from '@/infra/state/walletStore'

export default function UnlockWalletPage() {
  const [password, setPassword] = useState('')
  const { isUnlocking, error, handleUnlock } = useUnlockWallet()
  const setWallet = useWalletStore((s) => s.setWallet)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const encrypted = loadEncryptedWallet()
    const unlocked = await handleUnlock({ encrypted, password })

    if (unlocked) {
      setWallet(unlocked) // hydrate Zustand global store
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Enter password"
        className="border p-2 w-full"
      />

      <button
        type="submit"
        disabled={isUnlocking}
        className="bg-blue-500 text-white px-4 py-2"
      >
        {isUnlocking ? 'Unlocking...' : 'Unlock Wallet'}
      </button>

      {error && <p className="text-red-500">{error}</p>}
    </form>
  )
}

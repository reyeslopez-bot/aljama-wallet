// components/wallet/forms/UnlockWalletForm.tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useUnlockWallet } from '@/infra/utils/useUnlockWallet'

export default function UnlockWalletForm() {
  const [password, setPassword] = useState('')
  const { isUnlocking, error, handleUnlock } = useUnlockWallet()

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const encrypted =
      typeof window !== 'undefined'
        ? sessionStorage.getItem('aljama.encryptedWallet') ?? ''
        : ''

    const wallet = await handleUnlock({
      encrypted,
      password,
    })

    if (wallet) {
      console.log('Unlocked wallet:', wallet.address)
      // TODO: hydrate global wallet state + navigate to /dashboard
      // setGlobalWallet(wallet)
      // router.push('/dashboard')
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

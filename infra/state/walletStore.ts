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
      setWallet(unlocked)
      // optionally redirect to dashboard here
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* input + button + error, as before */}
    </form>
  )
}

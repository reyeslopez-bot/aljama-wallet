// infra/utils/useUnlockWallet.ts
import { useState } from 'react'
import {
  unlockWallet,
  type UnlockWalletParams,
  type UnlockedWallet,
} from '@/lib/wallet'

export function useUnlockWallet() {
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The real unlock function – no casting, no fake types.
  async function handleUnlock(
    params: UnlockWalletParams
  ): Promise<UnlockedWallet | null> {
    setIsUnlocking(true)
    setError(null)

    try {
      const wallet = await unlockWallet(params)
      return wallet
    } catch (err: any) {
      setError(err?.message ?? 'Failed to unlock wallet')
      return null
    } finally {
      setIsUnlocking(false)
    }
  }

  return { isUnlocking, error, handleUnlock }
}

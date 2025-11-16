// infra/utils/useUnlockWallet.ts
import { useState } from 'react'
import { unlockWallet } from '@/lib/wallet'

// Locally define the shape we want to use.
// We cast the imported function to this type to avoid type mismatch noise.
type UnlockFn = (password: string) => Promise<void>

export function useUnlockWallet() {
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const unlock = unlockWallet as unknown as UnlockFn

  async function handleUnlock(password: string) {
    setIsUnlocking(true)
    setError(null)
    try {
      await unlock(password)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to unlock wallet')
    } finally {
      setIsUnlocking(false)
    }
  }

  return { isUnlocking, error, handleUnlock }
}

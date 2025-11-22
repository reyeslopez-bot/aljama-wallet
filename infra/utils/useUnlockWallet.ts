// infra/utils/useUnlockWallet.ts
import { useState } from 'react'
import { unlockWallet, type UnlockWalletParams } from '@/lib/wallet'

type UnlockFn = (params: UnlockWalletParams) => Promise<void>

export function useUnlockWallet() {
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const unlock = unlockWallet as unknown as UnlockFn

  async function handleUnlock(params: UnlockWalletParams) {
    setIsUnlocking(true)
    setError(null)
    try {
      await unlock(params)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to unlock wallet')
    } finally {
      setIsUnlocking(false)
    }
  }

  return { isUnlocking, error, handleUnlock }
}

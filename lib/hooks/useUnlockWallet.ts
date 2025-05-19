// hooks/useUnlockWallet.ts
import { useState } from 'react'
import { unlockWallet } from '@/lib/wallet'   // your actual wallet‑unseal logic

export function useUnlockWallet() {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    async function unlock(password: string) {
        setIsLoading(true)
        setError(null)
        try {
            await unlockWallet(password)
        } catch (err: any) {
            setError(err)
            throw err
        } finally {
            setIsLoading(false)
        }
    }

    return { unlock, isLoading, error }
}


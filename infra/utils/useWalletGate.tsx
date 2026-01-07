// useWalletGate.tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loadEncryptedSession } from '@/lib/storage/walletSession'
import { useAljamaWallet } from '@/components/wallet/context/WalletContext'

type Mode = 'require-unlocked' | 'require-locked'

export function useWalletGate(mode: Mode) {
  const router = useRouter()
  const { isUnlocked } = useAljamaWallet()

  useEffect(() => {
    const hasEncrypted = Boolean(loadEncryptedSession())

    // dashboard guard
    if (mode === 'require-unlocked') {
      if (!hasEncrypted || !isUnlocked) {
        router.replace('/unlock')
      }
    }

    // unlock guard
    if (mode === 'require-locked') {
      if (hasEncrypted && isUnlocked) {
        router.replace('/dashboard')
      }
    }
  }, [mode, isUnlocked, router])
}

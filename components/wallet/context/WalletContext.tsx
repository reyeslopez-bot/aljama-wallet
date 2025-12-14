// components/wallet/context/WalletContext.tsx
'use client'

import type { ReactNode } from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Wallet } from 'ethers'

import {
  clearEncryptedSession,
  loadEncryptedSession,
  persistEncryptedSession,
} from '@/lib/storage/walletSession'
import { unlockWallet } from '@/lib/wallet'

type WalletState = {
  wallet: Wallet | null
  encryptedPayload: string | null
  persistEncryptedPayload: (payload: string) => void
  unlockWithPassword: (password: string, encryptedOverride?: string) => Promise<Wallet | null>
  clearWallet: () => void
}

const WalletContext = createContext<WalletState>({
  wallet: null,
  encryptedPayload: null,
  persistEncryptedPayload: () => {},
  unlockWithPassword: async () => null,
  clearWallet: () => {},
})

type WalletProviderProps = {
  children: ReactNode
}

export const WalletProvider = ({ children }: WalletProviderProps) => {
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [encryptedPayload, setEncryptedPayload] = useState<string | null>(null)

  useEffect(() => {
    const stored = loadEncryptedSession()
    if (stored) {
      setEncryptedPayload(stored)
    }
  }, [])

  useEffect(() => {
    if (!encryptedPayload || wallet || typeof window === 'undefined') return

    const password = window.prompt('Enter your password to unlock your wallet:')
    if (!password?.trim()) return

    void unlockWithPassword(password)
  }, [encryptedPayload, wallet, unlockWithPassword])

  const persistEncryptedPayload = useCallback((payload: string) => {
    persistEncryptedSession(payload)
    setEncryptedPayload(payload)
  }, [])

  const unlockWithPassword = useCallback(
    async (
      password: string,
      encryptedOverride?: string,
    ): Promise<Wallet | null> => {
      const payload = encryptedOverride ?? encryptedPayload
      if (!payload) return null

      const unlocked = await unlockWallet({ encrypted: payload, password })
      const hydrated = new Wallet(unlocked.privateKey)
      setWallet(hydrated)
      return hydrated
    },
    [encryptedPayload],
  )

  const clearWallet = useCallback(() => {
    clearEncryptedSession()
    setEncryptedPayload(null)
    setWallet(null)
  }, [])

  const value = useMemo(
    () => ({
      wallet,
      encryptedPayload,
      persistEncryptedPayload,
      unlockWithPassword,
      clearWallet,
    }),
    [wallet, encryptedPayload, persistEncryptedPayload, unlockWithPassword, clearWallet],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export const useAljamaWallet = () => useContext(WalletContext)

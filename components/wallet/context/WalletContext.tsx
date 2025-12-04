// components/wallet/context/WalletContext.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Wallet } from 'ethers'

type WalletState = {
  wallet: Wallet | null
  setWalletFromData: (data: { privateKey: string }) => void
  clearWallet: () => void
}

const WalletContext = createContext<WalletState>({
  wallet: null,
  setWalletFromData: () => {},
  clearWallet: () => {},
})

type WalletProviderProps = {
  children: ReactNode
}

export const WalletProvider = ({ children }: WalletProviderProps) => {
  const [wallet, setWallet] = useState<Wallet | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('wallet')
    if (stored) {
      try {
        const { privateKey } = JSON.parse(stored) as { privateKey: string }
        setWallet(new Wallet(privateKey))
      } catch (error) {
        console.warn('Failed to load stored wallet', error)
      }
    }
  }, [])

  const setWalletFromData = ({ privateKey }: { privateKey: string }) => {
    const newWallet = new Wallet(privateKey)
    setWallet(newWallet)
    sessionStorage.setItem('wallet', JSON.stringify({ privateKey }))
  }

  const clearWallet = () => {
    sessionStorage.removeItem('wallet')
    setWallet(null)
  }

  return (
    <WalletContext.Provider value={{ wallet, setWalletFromData, clearWallet }}>
      {children}
    </WalletContext.Provider>
  )
}

export const useAljamaWallet = () => useContext(WalletContext)

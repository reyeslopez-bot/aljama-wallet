// infra/state/walletStore.ts
'use client'

import { create } from 'zustand'

export type UnlockedWallet = {
  address: string
  privateKey: string
}

type WalletState = {
  wallet: UnlockedWallet | null
  setWallet: (wallet: UnlockedWallet) => void
  clearWallet: () => void
}

export const useWalletStore = create<WalletState>((set) => ({
  wallet: null,
  setWallet: (wallet) => set({ wallet }),
  clearWallet: () => set({ wallet: null }),
}))

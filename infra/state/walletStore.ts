// infra/state/walletStore.ts
import { create } from 'zustand'
import type { UnlockedWallet } from '@/lib/wallet'

type WalletState = {
  wallet: UnlockedWallet | null
  setWallet: (wallet: UnlockedWallet | null) => void
  clearWallet: () => void
}

export const useWalletStore = create<WalletState>((set) => ({
  wallet: null,
  setWallet: (wallet) => set({ wallet }),
  clearWallet: () => set({ wallet: null }),
}))

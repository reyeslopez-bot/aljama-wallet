'use client'

import { createContext, useContext, type ReactNode } from 'react'

type ManagedWalletSessionValue = {
  walletId: string | null
}

const ManagedWalletSessionContext = createContext<ManagedWalletSessionValue>({
  walletId: null,
})

export function ManagedWalletSessionProvider({
  children,
  walletId,
}: {
  children: ReactNode
  walletId: string | null
}) {
  return (
    <ManagedWalletSessionContext.Provider value={{ walletId }}>
      {children}
    </ManagedWalletSessionContext.Provider>
  )
}

export function useManagedWalletSession() {
  return useContext(ManagedWalletSessionContext)
}

'use client'

import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import {
  DEFAULT_XRPL_NETWORK_ID,
  type XrplNetworkId,
} from '@/lib/xrpl-networks'

type XrplNetworkState = {
  selectedNetworkId: XrplNetworkId
  setSelectedNetworkId: (id: XrplNetworkId) => void
}

const XRPL_NETWORK_STORAGE_KEY = 'aljama.xrpl.network'

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

function getBrowserStorage(): StateStorage {
  if (typeof window === 'undefined') return noopStorage
  const storage = window.localStorage
  if (!storage || typeof storage.setItem !== 'function') return noopStorage
  return storage
}

export const useXrplNetworkStore = create<XrplNetworkState>()(
  persist(
    (set) => ({
      selectedNetworkId: DEFAULT_XRPL_NETWORK_ID,
      setSelectedNetworkId: (id) =>
        set((state) =>
          state.selectedNetworkId === id ? state : { selectedNetworkId: id },
        ),
    }),
    {
      name: XRPL_NETWORK_STORAGE_KEY,
      storage: createJSONStorage(getBrowserStorage),
      partialize: (state) => ({ selectedNetworkId: state.selectedNetworkId }),
      version: 1,
    },
  ),
)

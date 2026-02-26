import { create } from 'zustand'

type TrackingStatus = 'idle' | 'pending' | 'success' | 'error'
type FlowStatus = 'idle' | 'pending' | 'success' | 'error'

type DynamicUserInfo = {
  name: string
  role: string
  image?: string | null
}

type DynamicWalletInfo = {
  createdAddress: string | null
  connectedAddress: string | null
  chainName: string | null
  connectorName: string | null
}

type DynamicInfoEvent = {
  message: string
  at: number
  kind: 'info' | 'success' | 'warning' | 'error'
}

type DynamicInfoState = {
  user: DynamicUserInfo | null
  wallet: DynamicWalletInfo
  createWalletStatus: FlowStatus
  connectWalletStatus: FlowStatus
  trackingStatus: TrackingStatus
  trackingError: string | null
  lastEvent: DynamicInfoEvent | null
}

type DynamicInfoActions = {
  setUser: (user: DynamicUserInfo | null) => void
  setCreateWalletStatus: (status: FlowStatus, error?: string | null) => void
  setConnectWalletStatus: (status: FlowStatus, error?: string | null) => void
  setTrackingStatus: (status: TrackingStatus, error?: string | null) => void
  setCreatedWalletAddress: (address: string | null) => void
  setConnectedWallet: (input: {
    address: string | null
    chainName?: string | null
    connectorName?: string | null
  }) => void
  pushEvent: (event: Omit<DynamicInfoEvent, 'at'> & { at?: number }) => void
}

const DEFAULT_USER: DynamicUserInfo = { name: 'Guest', role: 'New arrival' }

export const useDynamicInfoStore = create<DynamicInfoState & DynamicInfoActions>((set) => ({
  user: DEFAULT_USER,
  wallet: {
    createdAddress: null,
    connectedAddress: null,
    chainName: null,
    connectorName: null,
  },
  createWalletStatus: 'idle',
  connectWalletStatus: 'idle',
  trackingStatus: 'idle',
  trackingError: null,
  lastEvent: null,

  setUser: (user) => set({ user: user ?? DEFAULT_USER }),

  setCreateWalletStatus: (status, error = null) =>
    set(() => ({
      createWalletStatus: status,
      lastEvent:
        status === 'idle'
          ? null
          : {
              message:
                status === 'pending'
                  ? 'Creating wallet…'
                  : status === 'success'
                    ? 'Wallet created.'
                    : error ?? 'Wallet creation failed.',
              kind: status === 'success' ? 'success' : status === 'error' ? 'error' : 'info',
              at: Date.now(),
            },
    })),

  setConnectWalletStatus: (status, error = null) =>
    set(() => ({
      connectWalletStatus: status,
      lastEvent:
        status === 'idle'
          ? null
          : {
              message:
                status === 'pending'
                  ? 'Connecting wallet…'
                  : status === 'success'
                    ? 'Wallet connected.'
                    : error ?? 'Wallet connection failed.',
              kind: status === 'success' ? 'success' : status === 'error' ? 'error' : 'info',
              at: Date.now(),
            },
    })),

  setTrackingStatus: (status, error = null) =>
    set(() => ({
      trackingStatus: status,
      trackingError: error,
    })),

  setCreatedWalletAddress: (address) =>
    set((state) => ({
      wallet: { ...state.wallet, createdAddress: address },
    })),

  setConnectedWallet: ({ address, chainName = null, connectorName = null }) =>
    set((state) => ({
      wallet: {
        ...state.wallet,
        connectedAddress: address,
        chainName: chainName ?? state.wallet.chainName,
        connectorName: connectorName ?? state.wallet.connectorName,
      },
    })),

  pushEvent: (event) =>
    set(() => ({
      lastEvent: {
        at: event.at ?? Date.now(),
        kind: event.kind,
        message: event.message,
      },
    })),
}))

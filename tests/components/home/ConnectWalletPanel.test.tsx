// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import { ConnectWalletPanel } from '@/components/home/ConnectWalletPanel.client'
import { useConnect, useConnectors, useConnection, useDisconnect } from 'wagmi'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Connector } from 'wagmi'

vi.mock('wagmi', () => ({
  useConnection: vi.fn(),
  useConnect: vi.fn(),
  useConnectors: vi.fn(),
  useDisconnect: vi.fn(),
}))

const mockedUseConnection = vi.mocked(useConnection)
const mockedUseConnect = vi.mocked(useConnect)
const mockedUseConnectors = vi.mocked(useConnectors)
const mockedUseDisconnect = vi.mocked(useDisconnect)

const initialState = useDynamicInfoStore.getState()

const resetStore = () => {
  useDynamicInfoStore.setState(
    {
      ...initialState,
      wallet: { ...initialState.wallet },
    },
    true,
  )
}

describe('ConnectWalletPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    Object.defineProperty(window, 'ethereum', {
      value: {},
      configurable: true,
    })
  })

  it('renders disconnected state and resets store', async () => {
    const connector = { id: 'injected', name: 'Injected' } as Connector

    useDynamicInfoStore.setState({
      connectWalletStatus: 'success',
      wallet: {
        ...initialState.wallet,
        connectedAddress: '0xdead',
      },
    })

    mockedUseConnection.mockReturnValue({
      address: undefined,
      isConnected: false,
      chain: undefined,
      connector: undefined,
    } as any)
    mockedUseConnectors.mockReturnValue([connector])
    mockedUseConnect.mockReturnValue({ mutate: vi.fn(), isPending: false } as any)
    mockedUseDisconnect.mockReturnValue({ mutate: vi.fn() } as any)

    const { getByTestId } = render(<ConnectWalletPanel />)

    expect(getByTestId('connect-wallet-detail').textContent).toContain('No wallet connected')
    expect(getByTestId('connect-wallet-action').textContent).toContain('Connect wallet')

    await waitFor(() => {
      const state = useDynamicInfoStore.getState()
      expect(state.connectWalletStatus).toBe('idle')
      expect(state.wallet.connectedAddress).toBeNull()
    })
  })

  it('updates store when connected and can disconnect', async () => {
    const connector = { id: 'injected', name: 'Injected' } as Connector
    const disconnect = vi.fn()

    mockedUseConnection.mockReturnValue({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chain: { id: 1, name: 'Ethereum' },
      connector: { name: 'MetaMask' },
    } as any)
    mockedUseConnectors.mockReturnValue([connector])
    mockedUseConnect.mockReturnValue({ mutate: vi.fn(), isPending: false } as any)
    mockedUseDisconnect.mockReturnValue({ mutate: disconnect } as any)

    const { getByTestId } = render(<ConnectWalletPanel />)

    expect(getByTestId('connect-wallet-detail').textContent).toContain('Wallet linked')
    expect(getByTestId('connect-wallet-action').textContent).toContain('Disconnect wallet')

    await waitFor(() => {
      const state = useDynamicInfoStore.getState()
      expect(state.connectWalletStatus).toBe('success')
      expect(state.wallet.connectedAddress).toBe(
        '0x1234567890abcdef1234567890abcdef12345678',
      )
      expect(state.wallet.chainName).toBe('Ethereum')
      expect(state.wallet.connectorName).toBe('MetaMask')
    })

    fireEvent.click(getByTestId('connect-wallet-action'))
    expect(disconnect).toHaveBeenCalled()
  })

  it('shows the full address and copies it when connected', async () => {
    const connector = { id: 'injected', name: 'Injected' } as Connector
    const writeText = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    mockedUseConnection.mockReturnValue({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chain: { id: 1, name: 'Ethereum' },
      connector: { name: 'MetaMask' },
    } as any)
    mockedUseConnectors.mockReturnValue([connector])
    mockedUseConnect.mockReturnValue({ mutate: vi.fn(), isPending: false } as any)
    mockedUseDisconnect.mockReturnValue({ mutate: vi.fn() } as any)

    const { getByTestId } = render(<ConnectWalletPanel />)

    expect(getByTestId('connect-wallet-full-address').textContent).toContain(
      '0x1234567890abcdef1234567890abcdef12345678',
    )

    fireEvent.click(getByTestId('connect-wallet-copy-address'))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('0x1234567890abcdef1234567890abcdef12345678')
      expect(getByTestId('connect-wallet-copy-address').textContent).toContain('Copied')
    })
  })

  it('connects when disconnected', () => {
    const connector = { id: 'injected', name: 'Injected' } as Connector
    const connect = vi.fn()

    mockedUseConnection.mockReturnValue({
      address: undefined,
      isConnected: false,
      chain: undefined,
      connector: undefined,
    } as any)
    mockedUseConnectors.mockReturnValue([connector])
    mockedUseConnect.mockReturnValue({ mutate: connect, isPending: false } as any)
    mockedUseDisconnect.mockReturnValue({ mutate: vi.fn() } as any)

    const { getByTestId } = render(<ConnectWalletPanel />)

    fireEvent.click(getByTestId('connect-wallet-action'))

    expect(connect).toHaveBeenCalledWith({ connector })
  })
})

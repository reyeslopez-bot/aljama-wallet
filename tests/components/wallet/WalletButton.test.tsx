// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react'
import WalletButton from '@/components/wallet/ui/WalletButton'
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

describe('WalletButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'ethereum', {
      value: {},
      configurable: true,
    })
  })

  it('connects when disconnected', () => {
    const connector = { id: 'injected', name: 'Injected' } as Connector
    const connect = vi.fn()
    const disconnect = vi.fn()

    mockedUseConnection.mockReturnValue({
      address: undefined,
      isConnected: false,
    } as any)
    mockedUseConnectors.mockReturnValue([connector])
    mockedUseConnect.mockReturnValue({ mutate: connect, isPending: false } as any)
    mockedUseDisconnect.mockReturnValue({ mutate: disconnect } as any)

    const { getByRole } = render(<WalletButton />)
    const button = getByRole('button')

    expect(button.textContent).toBe('Connect')

    fireEvent.click(button)

    expect(connect).toHaveBeenCalledWith({ connector })
    expect(disconnect).not.toHaveBeenCalled()
  })

  it('disconnects when connected and shows short address', () => {
    const connector = { id: 'injected', name: 'Injected' } as Connector
    const connect = vi.fn()
    const disconnect = vi.fn()
    const address = '0x1234567890abcdef1234567890abcdef12345678'

    mockedUseConnection.mockReturnValue({
      address,
      isConnected: true,
    } as any)
    mockedUseConnectors.mockReturnValue([connector])
    mockedUseConnect.mockReturnValue({ mutate: connect, isPending: false } as any)
    mockedUseDisconnect.mockReturnValue({ mutate: disconnect } as any)

    const { getByRole } = render(<WalletButton />)
    const button = getByRole('button')

    expect(button.textContent).toBe('0x1234…5678')

    fireEvent.click(button)

    expect(disconnect).toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
  })
})

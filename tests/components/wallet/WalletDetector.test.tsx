// @vitest-environment jsdom

import { render } from '@testing-library/react'
import WalletDetector from '@/components/wallet/ui/WalletDetector'
import { useConnection } from 'wagmi'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('wagmi', () => ({
  useConnection: vi.fn(),
}))

const mockedUseConnection = vi.mocked(useConnection)

describe('WalletDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when disconnected', () => {
    mockedUseConnection.mockReturnValue({
      address: undefined,
      isConnected: false,
      chain: undefined,
      connector: undefined,
    } as any)

    const { container } = render(<WalletDetector />)

    expect(container.firstChild).toBeNull()
  })

  it('renders connection details when connected', () => {
    mockedUseConnection.mockReturnValue({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chain: { name: 'Ethereum', id: 1 },
      connector: { name: 'MetaMask' },
    } as any)

    const { getByText } = render(<WalletDetector />)

    expect(getByText('Ethereum · MetaMask · 0x1234…5678')).toBeTruthy()
  })
})

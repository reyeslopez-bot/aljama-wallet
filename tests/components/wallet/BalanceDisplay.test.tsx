// @vitest-environment jsdom

import { render } from '@testing-library/react'
import BalanceDisplay from '@/components/wallet/ui/BalanceDisplay'
import { useBalance, useConnection } from 'wagmi'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('wagmi', () => ({
  useConnection: vi.fn(),
  useBalance: vi.fn(),
}))

const mockedUseConnection = vi.mocked(useConnection)
const mockedUseBalance = vi.mocked(useBalance)

describe('BalanceDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows not connected state', () => {
    mockedUseConnection.mockReturnValue({
      address: undefined,
      isConnected: false,
    } as any)

    const { getByText } = render(<BalanceDisplay />)

    expect(getByText('Wallet not connected.')).toBeTruthy()
  })

  it('shows loading state for all chains', () => {
    mockedUseConnection.mockReturnValue({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
    } as any)
    mockedUseBalance.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any)

    const { getAllByText } = render(<BalanceDisplay />)

    expect(getAllByText('Loading…')).toHaveLength(4)
  })

  it('shows error state for all chains', () => {
    mockedUseConnection.mockReturnValue({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
    } as any)
    mockedUseBalance.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as any)

    const { getAllByText } = render(<BalanceDisplay />)

    expect(getAllByText('Error')).toHaveLength(4)
  })

  it('renders balances when data is available', () => {
    mockedUseConnection.mockReturnValue({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
    } as any)
    mockedUseBalance.mockReturnValue({
      data: {
        value: 1234n,
        decimals: 3,
        symbol: 'ETH',
      },
      isLoading: false,
      isError: false,
    } as any)

    const { getAllByText } = render(<BalanceDisplay />)

    expect(getAllByText('1.234 ETH')).toHaveLength(4)
  })
})

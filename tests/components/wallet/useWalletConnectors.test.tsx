// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { useWalletConnectors } from '@/components/wallet/hooks/useWalletConnectors'
import { useConnect, useConnectors } from 'wagmi'
import type { Connector } from 'wagmi'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('wagmi', () => ({
  useConnect: vi.fn(),
  useConnectors: vi.fn(),
}))

const mockedUseConnect = vi.mocked(useConnect)
const mockedUseConnectors = vi.mocked(useConnectors)

describe('useWalletConnectors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes connectors and pending state', () => {
    const connector = { id: 'injected', name: 'Injected' } as Connector
    const mutate = vi.fn()

    mockedUseConnectors.mockReturnValue([connector])
    mockedUseConnect.mockReturnValue({
      mutate,
      status: 'pending',
      error: null,
      variables: { connector },
    } as any)

    const { result } = renderHook(() => useWalletConnectors())

    expect(result.current.connectors).toEqual([connector])
    expect(result.current.connect).toBe(mutate)
    expect(result.current.isLoading).toBe(true)
    expect(result.current.pendingConnector).toBe(connector)
    expect(result.current.error).toBeNull()
    expect(result.current.status).toBe('pending')
  })
})

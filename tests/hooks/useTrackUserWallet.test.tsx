// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react'
import { useTrackUserWallet } from '@/hooks/useTrackUserWallet'
import { useConnection } from 'wagmi'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('wagmi', () => ({
  useConnection: vi.fn(),
}))

const mockedUseConnection = vi.mocked(useConnection)

describe('useTrackUserWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stays idle when disconnected', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    mockedUseConnection.mockReturnValue({
      address: undefined,
      isConnected: false,
      chain: undefined,
      connector: undefined,
    } as any)

    const { result } = renderHook(() => useTrackUserWallet())

    expect(result.current.status).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts payload when connected', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchMock)

    mockedUseConnection.mockReturnValue({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chain: { id: 1, name: 'Ethereum' },
      connector: { id: 'injected', name: 'Injected', type: 'injected' },
    } as any)

    const { result } = renderHook(() => useTrackUserWallet())

    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 1500 })
    await waitFor(() => expect(result.current.status).toBe('success'), {
      timeout: 1500,
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/track-wallet')
    expect(options?.method).toBe('POST')

    const body = JSON.parse(options?.body as string)
    expect(body.address).toBe('0x1234567890abcdef1234567890abcdef12345678')
    expect(body.chain).toEqual({ id: 1, name: 'Ethereum' })
    expect(body.connector).toEqual({
      id: 'injected',
      name: 'Injected',
      type: 'injected',
    })
    expect(body.timestamp).toBeTruthy()
  })

  it('surfaces errors when the request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '21' }),
      json: async () => ({
        ok: false,
        code: 'rate_limited',
        error: 'RATE_LIMITED',
        details: { retryAfter: 21 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    mockedUseConnection.mockReturnValue({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chain: { id: 1, name: 'Ethereum' },
      connector: { id: 'injected', name: 'Injected', type: 'injected' },
    } as any)

    const { result } = renderHook(() => useTrackUserWallet())

    await waitFor(() => expect(result.current.status).toBe('error'), {
      timeout: 1500,
    })

    expect(result.current.error?.message).toBe('Too many attempts. Try again in 21 seconds.')
  })
})

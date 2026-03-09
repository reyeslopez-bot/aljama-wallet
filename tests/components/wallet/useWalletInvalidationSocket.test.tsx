// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWalletInvalidationSocket } from '@/components/wallet/sync/useWalletInvalidationSocket'
import { walletQueryKeys } from '@/components/wallet/sync/wallet-query-keys'

const invalidateQueries = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries,
  }),
}))

const sockets: MockWebSocket[] = []

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readonly url: string
  readonly close = vi.fn()
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null

  constructor(url: string) {
    this.url = url
    sockets.push(this)
  }

  emitOpen() {
    this.onopen?.(new Event('open'))
  }

  emitError() {
    this.onerror?.(new Event('error'))
  }

  emitClose(init?: Partial<CloseEvent>) {
    this.onclose?.({
      code: init?.code ?? 1000,
      reason: init?.reason ?? '',
      wasClean: init?.wasClean ?? true,
    } as CloseEvent)
  }

  emitMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent)
  }
}

function TestSocketClient({
  walletId,
  enabled = true,
}: {
  walletId: string | null
  enabled?: boolean
}) {
  useWalletInvalidationSocket(walletId, enabled)
  return null
}

describe('useWalletInvalidationSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
    sockets.length = 0
  })

  it('warns when the websocket URL is not configured', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(<TestSocketClient walletId="wallet-1" />)

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('[wallet-sync:ws]')
    expect(warnSpy.mock.calls[0]?.[1]).toMatchObject({
      walletId: 'wallet-1',
      error: {
        message:
          'Wallet invalidation socket is disabled because NEXT_PUBLIC_WALLET_INVALIDATION_WS_URL is missing',
      },
    })
    expect(sockets).toHaveLength(0)
  })

  it('warns when the websocket URL is invalid', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('NEXT_PUBLIC_WALLET_INVALIDATION_WS_URL', 'not-a-valid-url')

    render(<TestSocketClient walletId="wallet-1" />)

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('[wallet-sync:ws]')
    expect(warnSpy.mock.calls[0]?.[1]).toMatchObject({
      walletId: 'wallet-1',
      baseUrl: 'not-a-valid-url',
      error: {
        message: 'Wallet invalidation socket URL is invalid',
      },
    })
    expect(sockets).toHaveLength(0)
  })

  it('logs parse failures with a raw message preview', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('NEXT_PUBLIC_WALLET_INVALIDATION_WS_URL', 'wss://example.test/ws')

    render(<TestSocketClient walletId="wallet-1" />)
    sockets[0]?.emitMessage('not-json')

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('[wallet-sync:ws]')
    expect(warnSpy.mock.calls[0]?.[1]).toMatchObject({
      walletId: 'wallet-1',
      socketUrl: 'wss://example.test/ws',
      rawPreview: 'not-json',
      error: {
        name: 'SyntaxError',
      },
    })
  })

  it('invalidates the matching snapshot query and logs the handled event', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.stubEnv('NEXT_PUBLIC_WALLET_INVALIDATION_WS_URL', 'wss://example.test/ws')

    render(<TestSocketClient walletId="wallet-1" />)
    sockets[0]?.emitOpen()
    sockets[0]?.emitMessage(
      JSON.stringify({
        walletId: 'wallet-1',
        query: 'snapshot',
      }),
    )
    sockets[0]?.emitClose({ code: 1001, reason: 'test-complete', wasClean: true })

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: walletQueryKeys.snapshot('wallet-1'),
    })
    expect(
      infoSpy.mock.calls.some((call) =>
        String(call[0]).includes('[wallet-sync:ws] Wallet invalidation socket connected'),
      ),
    ).toBe(true)
    expect(
      infoSpy.mock.calls.some((call) =>
        String(call[0]).includes('[wallet-sync:ws] Invalidating wallet snapshot query'),
      ),
    ).toBe(true)
    expect(
      infoSpy.mock.calls.some((call) =>
        String(call[0]).includes('[wallet-sync:ws] Wallet invalidation socket closed'),
      ),
    ).toBe(true)
  })
})

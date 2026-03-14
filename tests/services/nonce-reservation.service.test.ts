import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('nonce-reservation.service', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    const { resetWalletNonceReservationState } = await import('@/services/nonce-reservation.service')
    resetWalletNonceReservationState()
  })

  it('reserves sequential nonces from the pending chain nonce', async () => {
    const {
      getWalletNonceState,
      reserveWalletNonce,
    } = await import('@/services/nonce-reservation.service')

    const provider = {
      getTransactionCount: vi.fn().mockResolvedValue(7),
    }

    const first = await reserveWalletNonce({
      walletId: 'wallet-1',
      walletAddress: '0x000000000000000000000000000000000000beef',
      chainId: 8453,
      actionId: 'action-1',
      provider,
    })
    const second = await reserveWalletNonce({
      walletId: 'wallet-1',
      walletAddress: '0x000000000000000000000000000000000000beef',
      chainId: 8453,
      actionId: 'action-2',
      provider,
    })
    const state = await getWalletNonceState('wallet-1', 8453)

    expect(first.nonce).toBe(7)
    expect(second.nonce).toBe(8)
    expect(state).toMatchObject({
      walletId: 'wallet-1',
      chainId: 8453,
      nextNonce: 9,
    })
  })

  it('returns the same reservation when the action is replayed', async () => {
    const { reserveWalletNonce } = await import('@/services/nonce-reservation.service')

    const provider = {
      getTransactionCount: vi.fn().mockResolvedValue(4),
    }

    const first = await reserveWalletNonce({
      walletId: 'wallet-1',
      walletAddress: '0x000000000000000000000000000000000000beef',
      chainId: 8453,
      actionId: 'action-1',
      provider,
    })
    const replayed = await reserveWalletNonce({
      walletId: 'wallet-1',
      walletAddress: '0x000000000000000000000000000000000000beef',
      chainId: 8453,
      actionId: 'action-1',
      provider,
    })

    expect(replayed.id).toBe(first.id)
    expect(replayed.nonce).toBe(first.nonce)
  })

  it('tracks reservation lifecycle transitions and rejects stale explicit nonces', async () => {
    const {
      getNonceReservation,
      markNonceReservationConfirmedByTxHash,
      markNonceReservationSubmitted,
      reserveWalletNonce,
    } = await import('@/services/nonce-reservation.service')

    const provider = {
      getTransactionCount: vi.fn().mockResolvedValue(10),
    }

    const reservation = await reserveWalletNonce({
      walletId: 'wallet-1',
      walletAddress: '0x000000000000000000000000000000000000beef',
      chainId: 8453,
      actionId: 'action-1',
      provider,
    })

    await markNonceReservationSubmitted(reservation.id, '0xtxhash')
    await markNonceReservationConfirmedByTxHash('0xtxhash')

    await expect(
      reserveWalletNonce({
        walletId: 'wallet-1',
        walletAddress: '0x000000000000000000000000000000000000beef',
        chainId: 8453,
        actionId: 'action-2',
        provider,
        requestedNonce: 9,
      }),
    ).rejects.toThrow('NONCE_TOO_LOW')

    const updated = await getNonceReservation(reservation.id)
    expect(updated).toMatchObject({
      id: reservation.id,
      status: 'CONFIRMED',
      txHash: '0xtxhash',
    })
  })
})

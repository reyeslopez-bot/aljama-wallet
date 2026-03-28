import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFindFirst,
  mockFindUnique,
  mockUpdateMany,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockFindUnique: vi.fn(),
  mockUpdateMany: vi.fn(),
}))

vi.mock('@/lib/prisma-pg', () => ({
  prismaPg: {
    walletSigningIntent: {
      findFirst: mockFindFirst,
      findUnique: mockFindUnique,
      updateMany: mockUpdateMany,
    },
  },
}))

function buildIntentRow(status: 'queued' | 'approved') {
  return {
    id: 'intent-1',
    chain: 'EVM',
    actionType: 'transfer',
    status,
    walletId: 'wallet-1',
    userId: 'user-1',
    chainId: 8453,
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    traceId: 'trace-1',
    transferLogId: 'log-1',
    txPayload: {
      kind: 'evm-transaction',
      walletId: 'wallet-1',
      chainId: 8453,
      nonceReservationId: 'nonce-1',
      fromAddress: '0x000000000000000000000000000000000000beef',
      toAddress: '0x000000000000000000000000000000000000dead',
      amountWei: '1000',
      txType: 'transfer',
      data: null,
      transferLogId: 'log-1',
      transaction: {
        to: '0x000000000000000000000000000000000000dead',
        nonce: 7,
        gasLimit: '21000',
        maxFeePerGas: '2',
        maxPriorityFeePerGas: '1',
        data: null,
      },
    },
    txPayloadRef: null,
    txPayloadSizeBytes: 96,
    signedPayload: null,
    txHash: null,
    errorCode: null,
    errorDetails: null,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
  }
}

describe('signing-intent.service claimNextQueuedWalletSigningIntent', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('PG_DATABASE_URL', 'postgres://wallet:test@localhost:5432/aljama')
    vi.stubEnv('WALLET_SIGNING_INTENT_INLINE_PAYLOAD_MAX_BYTES', '4096')
    vi.stubEnv('WALLET_SIGNING_INTENT_INLINE_PAYLOAD_HOT_WINDOW_MS', '31536000000')
  })

  it('retries optimistic claims until one succeeds', async () => {
    mockFindFirst.mockResolvedValue(buildIntentRow('queued'))
    mockUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
    mockFindUnique.mockResolvedValue(buildIntentRow('approved'))

    const { claimNextQueuedWalletSigningIntent } = await import('@/services/signing-intent.service')

    const claimed = await claimNextQueuedWalletSigningIntent()

    expect(mockFindFirst).toHaveBeenCalledTimes(2)
    expect(mockUpdateMany).toHaveBeenCalledTimes(2)
    expect(mockFindUnique).toHaveBeenCalledTimes(1)
    expect(claimed).toMatchObject({
      id: 'intent-1',
      status: 'approved',
      walletId: 'wallet-1',
      chainId: 8453,
    })
  })

  it('returns null after five optimistic-claim conflicts', async () => {
    mockFindFirst.mockResolvedValue(buildIntentRow('queued'))
    mockUpdateMany.mockResolvedValue({ count: 0 })

    const { claimNextQueuedWalletSigningIntent } = await import('@/services/signing-intent.service')

    await expect(claimNextQueuedWalletSigningIntent()).resolves.toBeNull()

    expect(mockFindFirst).toHaveBeenCalledTimes(5)
    expect(mockUpdateMany).toHaveBeenCalledTimes(5)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })
})

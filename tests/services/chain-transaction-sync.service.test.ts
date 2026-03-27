import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockProviderGetBlockNumber,
  mockProviderGetBlock,
  mockProviderGetTransaction,
  mockProviderGetTransactionReceipt,
  mockPrismaTransaction,
  mockChainIndexTransactionUpdateMany,
  mockChainLogDeleteMany,
  mockChainTransactionFindMany,
  mockChainTransactionUpdate,
  mockTokenTransferDeleteMany,
  mockUpdateTransferAttemptByTxHash,
  mockMarkNonceReservationConfirmedByTxHash,
  mockMarkNonceReservationFailedByTxHash,
  mockMarkNonceReservationsFailedByTxHashes,
  mockMarkNonceReservationSubmittedByTxHash,
  mockMarkWalletSigningIntentConfirmedByTxHash,
  mockMarkWalletSigningIntentFailedByTxHash,
  mockReopenWalletSigningIntentByTxHash,
  mockResolveWalletIdsByAddresses,
  mockGetEvmProviderForChain,
} = vi.hoisted(() => ({
  mockProviderGetBlockNumber: vi.fn(),
  mockProviderGetBlock: vi.fn(),
  mockProviderGetTransaction: vi.fn(),
  mockProviderGetTransactionReceipt: vi.fn(),
  mockPrismaTransaction: vi.fn(),
  mockChainIndexTransactionUpdateMany: vi.fn(),
  mockChainLogDeleteMany: vi.fn(),
  mockChainTransactionFindMany: vi.fn(),
  mockChainTransactionUpdate: vi.fn(),
  mockTokenTransferDeleteMany: vi.fn(),
  mockUpdateTransferAttemptByTxHash: vi.fn(),
  mockMarkNonceReservationConfirmedByTxHash: vi.fn(),
  mockMarkNonceReservationFailedByTxHash: vi.fn(),
  mockMarkNonceReservationsFailedByTxHashes: vi.fn(),
  mockMarkNonceReservationSubmittedByTxHash: vi.fn(),
  mockMarkWalletSigningIntentConfirmedByTxHash: vi.fn(),
  mockMarkWalletSigningIntentFailedByTxHash: vi.fn(),
  mockReopenWalletSigningIntentByTxHash: vi.fn(),
  mockResolveWalletIdsByAddresses: vi.fn(),
  mockGetEvmProviderForChain: vi.fn(),
}))

vi.mock('ethers', () => ({
  getAddress: (value: string) => value,
  keccak256: () => 'transfer-topic',
  toUtf8Bytes: () => new Uint8Array([1, 2, 3]),
}))

vi.mock('@/lib/evm-rpc', () => ({
  getEvmProviderForChain: mockGetEvmProviderForChain,
}))

vi.mock('@/lib/prisma-crdb', () => ({
  prismaCrdb: {
    $transaction: mockPrismaTransaction,
    chainBlock: {
      upsert: vi.fn(),
    },
    chainIndexTransaction: {
      updateMany: mockChainIndexTransactionUpdateMany,
      upsert: vi.fn(),
    },
    chainLog: {
      deleteMany: mockChainLogDeleteMany,
      upsert: vi.fn(),
    },
    chainTransaction: {
      findMany: mockChainTransactionFindMany,
      update: mockChainTransactionUpdate,
    },
    tokenTransfer: {
      deleteMany: mockTokenTransferDeleteMany,
      upsert: vi.fn(),
    },
  },
}))

vi.mock('@/services/transfer-log.service', () => ({
  replaceTransferAttemptsByTxHashes: vi.fn(),
  updateTransferAttemptByTxHash: mockUpdateTransferAttemptByTxHash,
}))

vi.mock('@/services/wallet.service', () => ({
  resolveWalletIdsByAddresses: mockResolveWalletIdsByAddresses,
}))

vi.mock('@/services/nonce-reservation.service', () => ({
  markNonceReservationConfirmedByTxHash: mockMarkNonceReservationConfirmedByTxHash,
  markNonceReservationFailedByTxHash: mockMarkNonceReservationFailedByTxHash,
  markNonceReservationsFailedByTxHashes: mockMarkNonceReservationsFailedByTxHashes,
  markNonceReservationSubmittedByTxHash: mockMarkNonceReservationSubmittedByTxHash,
}))

vi.mock('@/services/signing-intent.service', () => ({
  markWalletSigningIntentConfirmedByTxHash: mockMarkWalletSigningIntentConfirmedByTxHash,
  markWalletSigningIntentFailedByTxHash: mockMarkWalletSigningIntentFailedByTxHash,
  reopenWalletSigningIntentByTxHash: mockReopenWalletSigningIntentByTxHash,
}))

describe('chain-transaction-sync.service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    mockProviderGetBlockNumber.mockResolvedValue(100)
    mockGetEvmProviderForChain.mockResolvedValue({
      getBlockNumber: mockProviderGetBlockNumber,
      getBlock: mockProviderGetBlock,
      getTransaction: mockProviderGetTransaction,
      getTransactionReceipt: mockProviderGetTransactionReceipt,
    })

    mockPrismaTransaction.mockImplementation(async (operations: unknown) => {
      if (typeof operations === 'function') {
        return operations({
          chainBlock: { upsert: vi.fn() },
          chainIndexTransaction: { updateMany: mockChainIndexTransactionUpdateMany, upsert: vi.fn() },
          chainLog: { deleteMany: mockChainLogDeleteMany, upsert: vi.fn() },
          chainTransaction: { findMany: mockChainTransactionFindMany, update: mockChainTransactionUpdate },
          tokenTransfer: { deleteMany: mockTokenTransferDeleteMany, upsert: vi.fn() },
        })
      }
      if (Array.isArray(operations)) {
        return Promise.all(operations)
      }
      return operations
    })

    mockChainTransactionFindMany.mockResolvedValue([
      {
        chainType: 'EVM',
        networkId: '11155111',
        txHash: '0xtx',
        status: 'confirmed',
        blockHash: '0xold-block',
        blockHeight: 12n,
        createdAt: new Date('2026-03-09T11:00:00.000Z'),
      },
    ])
    mockChainTransactionUpdate.mockResolvedValue(undefined)
    mockChainIndexTransactionUpdateMany.mockResolvedValue({ count: 1 })
    mockChainLogDeleteMany.mockResolvedValue({ count: 2 })
    mockTokenTransferDeleteMany.mockResolvedValue({ count: 1 })
    mockUpdateTransferAttemptByTxHash.mockResolvedValue(undefined)
    mockMarkNonceReservationConfirmedByTxHash.mockResolvedValue(undefined)
    mockMarkNonceReservationFailedByTxHash.mockResolvedValue(undefined)
    mockMarkNonceReservationsFailedByTxHashes.mockResolvedValue(undefined)
    mockMarkNonceReservationSubmittedByTxHash.mockResolvedValue(undefined)
    mockMarkWalletSigningIntentConfirmedByTxHash.mockResolvedValue(undefined)
    mockMarkWalletSigningIntentFailedByTxHash.mockResolvedValue(undefined)
    mockReopenWalletSigningIntentByTxHash.mockResolvedValue(undefined)
    mockResolveWalletIdsByAddresses.mockResolvedValue(new Map())
    mockProviderGetTransactionReceipt.mockResolvedValue(null)
    mockProviderGetBlock.mockResolvedValue({ hash: '0xnew-block' })
    mockProviderGetTransaction.mockResolvedValue({ hash: '0xtx' })
  })

  it('clears indexed receipt data and marks transactions reorged after a canonical block mismatch', async () => {
    const { syncRecentEvmChainTransactions } = await import('@/services/chain-transaction-sync.service')
    const result = await syncRecentEvmChainTransactions({ networkId: '11155111', limit: 10 })

    expect(mockTokenTransferDeleteMany).toHaveBeenCalledWith({
      where: {
        chainType: 'EVM',
        networkId: '11155111',
        txHash: '0xtx',
      },
    })
    expect(mockChainLogDeleteMany).toHaveBeenCalledWith({
      where: {
        chainType: 'EVM',
        networkId: '11155111',
        txHash: '0xtx',
      },
    })
    expect(mockChainIndexTransactionUpdateMany).toHaveBeenCalledWith({
      where: {
        chainType: 'EVM',
        networkId: '11155111',
        txHash: '0xtx',
      },
      data: {
        blockHeight: null,
        blockHash: null,
        transactionIndex: null,
        status: 'reorged',
        effectiveGasPrice: null,
        gasUsed: null,
        confirmationCount: 0,
      },
    })
    expect(mockChainTransactionUpdate).toHaveBeenCalledWith({
      where: {
        chainType_networkId_txHash: {
          chainType: 'EVM',
          networkId: '11155111',
          txHash: '0xtx',
        },
      },
      data: {
        status: 'reorged',
        blockHeight: null,
        blockHash: null,
        gasUsed: null,
        confirmedAt: null,
        confirmationCount: 0,
      },
    })
    expect(mockUpdateTransferAttemptByTxHash).toHaveBeenCalledWith('0xtx', {
      status: 'reorged',
      blockHeight: null,
      blockHash: null,
      gasUsed: null,
      confirmedAt: null,
      confirmationCount: 0,
    })
    expect(mockMarkNonceReservationSubmittedByTxHash).toHaveBeenCalledWith('0xtx')
    expect(mockReopenWalletSigningIntentByTxHash).toHaveBeenCalledWith('0xtx')
    expect(result).toEqual({
      processedCount: 1,
      succeededCount: 1,
      failedCount: 0,
    })
  })

  it('tracks confirmation depth and marks transactions final after twelve confirmations', async () => {
    mockChainTransactionFindMany.mockResolvedValue([
      {
        chainType: 'EVM',
        networkId: '11155111',
        txHash: '0xtx',
        status: 'submitted',
        blockHash: null,
        blockHeight: null,
        createdAt: new Date('2026-03-09T11:00:00.000Z'),
      },
    ])
    mockProviderGetBlockNumber.mockResolvedValue(111)
    mockProviderGetBlock.mockResolvedValue({
      number: 100,
      hash: '0xblock',
      parentHash: '0xparent',
      timestamp: 1_710_000_000,
    })
    mockProviderGetTransaction.mockResolvedValue({
      from: '0xfrom',
      to: '0xto',
      nonce: 7,
      value: 1n,
      gasLimit: 21_000n,
      gasPrice: 2n,
      data: '0x',
      index: 0,
    })
    mockProviderGetTransactionReceipt.mockResolvedValue({
      blockHash: '0xblock',
      blockNumber: 100,
      status: 1,
      gasUsed: 21_000n,
      effectiveGasPrice: 2n,
      logs: [],
      index: 0,
      from: '0xfrom',
      to: '0xto',
    })

    const { syncRecentEvmChainTransactions } = await import('@/services/chain-transaction-sync.service')
    const result = await syncRecentEvmChainTransactions({ networkId: '11155111', limit: 10 })

    expect(mockChainTransactionUpdate).toHaveBeenCalledWith({
      where: {
        chainType_networkId_txHash: {
          chainType: 'EVM',
          networkId: '11155111',
          txHash: '0xtx',
        },
      },
      data: expect.objectContaining({
        status: 'confirmed_final',
        blockHeight: 100n,
        blockHash: '0xblock',
        confirmationCount: 12,
      }),
    })
    expect(mockUpdateTransferAttemptByTxHash).toHaveBeenCalledWith('0xtx', expect.objectContaining({
      status: 'confirmed_final',
      blockHeight: 100n,
      blockHash: '0xblock',
      confirmationCount: 12,
    }))
    expect(mockMarkNonceReservationConfirmedByTxHash).toHaveBeenCalledWith('0xtx')
    expect(mockMarkWalletSigningIntentConfirmedByTxHash).toHaveBeenCalledWith('0xtx')
    expect(result).toEqual({
      processedCount: 1,
      succeededCount: 1,
      failedCount: 0,
    })
  })

  it('groups sync work by network id and resolves providers per chain', async () => {
    mockChainTransactionFindMany.mockResolvedValue([
      {
        chainType: 'EVM',
        networkId: '1',
        txHash: '0xtx-1',
        status: 'submitted',
        blockHash: null,
        blockHeight: null,
        createdAt: new Date('2026-03-09T11:00:00.000Z'),
      },
      {
        chainType: 'EVM',
        networkId: '8453',
        txHash: '0xtx-8453',
        status: 'submitted',
        blockHash: null,
        blockHeight: null,
        createdAt: new Date('2026-03-09T11:00:00.000Z'),
      },
    ])
    mockProviderGetTransactionReceipt.mockResolvedValue(null)

    const { syncRecentEvmChainTransactions } = await import('@/services/chain-transaction-sync.service')
    await syncRecentEvmChainTransactions({ limit: 10 })

    expect(mockGetEvmProviderForChain).toHaveBeenCalledWith(1)
    expect(mockGetEvmProviderForChain).toHaveBeenCalledWith(8453)
  })
})

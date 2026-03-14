import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
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
} = vi.hoisted(() => ({
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
}))

vi.mock('ethers', () => ({
  JsonRpcProvider: class MockJsonRpcProvider {
    getBlock = mockProviderGetBlock
    getTransaction = mockProviderGetTransaction
    getTransactionReceipt = mockProviderGetTransactionReceipt
  },
  getAddress: (value: string) => value,
  keccak256: () => 'transfer-topic',
  toUtf8Bytes: () => new Uint8Array([1, 2, 3]),
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
  resolveWalletIdsByAddresses: vi.fn(),
}))

vi.mock('@/services/nonce-reservation.service', () => ({
  markNonceReservationConfirmedByTxHash: mockMarkNonceReservationConfirmedByTxHash,
  markNonceReservationFailedByTxHash: mockMarkNonceReservationFailedByTxHash,
  markNonceReservationsFailedByTxHashes: mockMarkNonceReservationsFailedByTxHashes,
  markNonceReservationSubmittedByTxHash: mockMarkNonceReservationSubmittedByTxHash,
}))

describe('chain-transaction-sync.service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    vi.stubEnv('EVM_RPC_URL', 'https://rpc.example.test')

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
    mockProviderGetTransactionReceipt.mockResolvedValue(null)
    mockProviderGetBlock.mockResolvedValue({ hash: '0xnew-block' })
    mockProviderGetTransaction.mockResolvedValue({ hash: '0xtx' })
  })

  it('clears indexed receipt data and reverts confirmed transactions to pending after a canonical block mismatch', async () => {
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
        status: 'pending',
        effectiveGasPrice: null,
        gasUsed: null,
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
        status: 'pending',
        blockHeight: null,
        blockHash: null,
        gasUsed: null,
        confirmedAt: null,
      },
    })
    expect(mockUpdateTransferAttemptByTxHash).toHaveBeenCalledWith('0xtx', {
      status: 'pending',
      blockHeight: null,
      blockHash: null,
      gasUsed: null,
      confirmedAt: null,
    })
    expect(mockMarkNonceReservationSubmittedByTxHash).toHaveBeenCalledWith('0xtx')
    expect(result).toEqual({
      processedCount: 1,
      succeededCount: 1,
      failedCount: 0,
    })
  })
})

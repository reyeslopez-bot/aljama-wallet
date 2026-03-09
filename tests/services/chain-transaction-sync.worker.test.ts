import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockSyncRecentEvmChainTransactions,
  mockCollectChainTransactionSyncMetrics,
  mockLogError,
  mockLogInfo,
  mockLogWarn,
  mockObserveChainTransactionSyncPass,
} = vi.hoisted(() => ({
  mockSyncRecentEvmChainTransactions: vi.fn(),
  mockCollectChainTransactionSyncMetrics: vi.fn(),
  mockLogError: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogWarn: vi.fn(),
  mockObserveChainTransactionSyncPass: vi.fn(),
}))

vi.mock('@/services/chain-transaction-sync.service', () => ({
  syncRecentEvmChainTransactions: mockSyncRecentEvmChainTransactions,
}))

vi.mock('@/services/chain-transaction-monitor.service', () => ({
  collectChainTransactionSyncMetrics: mockCollectChainTransactionSyncMetrics,
  observeChainTransactionSyncPass: mockObserveChainTransactionSyncPass,
}))

vi.mock('@/lib/security/logging', () => ({
  logError: mockLogError,
  logInfo: mockLogInfo,
  logWarn: mockLogWarn,
}))

describe('chain-transaction-sync.worker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    mockSyncRecentEvmChainTransactions.mockResolvedValue({
      processedCount: 1,
      succeededCount: 1,
      failedCount: 0,
    })
    mockCollectChainTransactionSyncMetrics.mockResolvedValue({
      processedCount: 1,
      succeededCount: 1,
      failedCount: 0,
      stuckBroadcasted: { count: 0 },
      stuckPending: { count: 0 },
    })
    mockObserveChainTransactionSyncPass.mockResolvedValue(undefined)
  })

  it('runs an immediate sync pass and repeats on the configured interval', async () => {
    vi.stubEnv('CHAIN_TRANSACTION_SYNC_INTERVAL_MS', '1000')
    vi.stubEnv('CHAIN_TRANSACTION_SYNC_LIMIT', '12')
    vi.stubEnv('CHAIN_TRANSACTION_SYNC_NETWORK_ID', '11155111')

    const { startChainTransactionSyncWorker } = await import('@/services/chain-transaction-sync.worker')
    const worker = startChainTransactionSyncWorker()

    expect(mockSyncRecentEvmChainTransactions).toHaveBeenCalledWith({
      networkId: '11155111',
      limit: 12,
    })
    await vi.waitFor(() =>
      expect(mockCollectChainTransactionSyncMetrics).toHaveBeenCalledWith({
        trigger: 'startup',
        networkId: '11155111',
        processedCount: 1,
        succeededCount: 1,
        failedCount: 0,
      }),
    )
    await vi.waitFor(() => expect(mockObserveChainTransactionSyncPass).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(1000)

    expect(mockSyncRecentEvmChainTransactions).toHaveBeenCalledTimes(2)

    worker.stop()
  })

  it('skips an interval pass when the previous sync is still in flight', async () => {
    vi.stubEnv('CHAIN_TRANSACTION_SYNC_INTERVAL_MS', '1000')

    let resolveSync: ((value: { processedCount: number; succeededCount: number; failedCount: number }) => void) | undefined
    mockSyncRecentEvmChainTransactions.mockImplementation(
      () =>
        new Promise<{ processedCount: number; succeededCount: number; failedCount: number }>((resolve) => {
          resolveSync = resolve
        }),
    )

    const { startChainTransactionSyncWorker } = await import('@/services/chain-transaction-sync.worker')
    const worker = startChainTransactionSyncWorker()

    await vi.advanceTimersByTimeAsync(1000)

    expect(mockSyncRecentEvmChainTransactions).toHaveBeenCalledTimes(1)
    expect(mockLogWarn).toHaveBeenCalledWith(
      'chain-tx-sync-worker',
      expect.any(Error),
      { trigger: 'interval' },
    )

    if (resolveSync) {
      resolveSync({
        processedCount: 1,
        succeededCount: 1,
        failedCount: 0,
      })
    }
    await Promise.resolve()
    worker.stop()
  })
})

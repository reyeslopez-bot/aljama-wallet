import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockSyncRecentEvmChainTransactions,
  mockLogError,
  mockLogInfo,
  mockLogWarn,
} = vi.hoisted(() => ({
  mockSyncRecentEvmChainTransactions: vi.fn(),
  mockLogError: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogWarn: vi.fn(),
}))

vi.mock('@/services/chain-transaction-sync.service', () => ({
  syncRecentEvmChainTransactions: mockSyncRecentEvmChainTransactions,
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

    mockSyncRecentEvmChainTransactions.mockResolvedValue(undefined)
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

    await vi.advanceTimersByTimeAsync(1000)

    expect(mockSyncRecentEvmChainTransactions).toHaveBeenCalledTimes(2)

    worker.stop()
  })

  it('skips an interval pass when the previous sync is still in flight', async () => {
    vi.stubEnv('CHAIN_TRANSACTION_SYNC_INTERVAL_MS', '1000')

    let resolveSync: ((value: void | PromiseLike<void>) => void) | undefined
    mockSyncRecentEvmChainTransactions.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
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
      resolveSync(undefined)
    }
    await Promise.resolve()
    worker.stop()
  })
})

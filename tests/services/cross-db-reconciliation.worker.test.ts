import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockReconcileCrossDbState,
  mockReadCrossDbReconciliationConfig,
  mockLogError,
  mockLogInfo,
  mockLogWarn,
} = vi.hoisted(() => ({
  mockReconcileCrossDbState: vi.fn(),
  mockReadCrossDbReconciliationConfig: vi.fn(),
  mockLogError: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogWarn: vi.fn(),
}))

vi.mock('@/services/cross-db-reconciliation.service', () => ({
  reconcileCrossDbState: mockReconcileCrossDbState,
  readCrossDbReconciliationConfig: mockReadCrossDbReconciliationConfig,
}))

vi.mock('@/lib/security/logging', () => ({
  logError: mockLogError,
  logInfo: mockLogInfo,
  logWarn: mockLogWarn,
}))

describe('cross-db-reconciliation.worker', () => {
  type MockResult = {
    skipped: boolean
    openedCount: number
    resolvedCount: number
    transfer: { checkedCount: number; missingCount: number; mismatchCount: number }
    xrpl: { checkedCount: number; missingCount: number; mismatchCount: number }
    risk: { checkedCount: number; missingCount: number; mismatchCount: number }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    mockReadCrossDbReconciliationConfig.mockReturnValue({
      lookbackHours: 24,
      graceMs: 120_000,
      transferLimit: 200,
      xrplLimit: 200,
      riskLimit: 200,
    })
    mockReconcileCrossDbState.mockResolvedValue({
      skipped: false,
      openedCount: 1,
      resolvedCount: 0,
      transfer: {
        checkedCount: 1,
        missingCount: 1,
        mismatchCount: 0,
      },
      xrpl: {
        checkedCount: 0,
        missingCount: 0,
        mismatchCount: 0,
      },
      risk: {
        checkedCount: 0,
        missingCount: 0,
        mismatchCount: 0,
      },
    })
  })

  it('runs an immediate pass and repeats on the configured interval', async () => {
    vi.stubEnv('CROSS_DB_RECONCILIATION_INTERVAL_MS', '1000')

    const { startCrossDbReconciliationWorker } = await import('@/services/cross-db-reconciliation.worker')
    const worker = startCrossDbReconciliationWorker()

    expect(mockReconcileCrossDbState).toHaveBeenCalledWith({
      lookbackHours: 24,
      graceMs: 120_000,
      transferLimit: 200,
      xrplLimit: 200,
      riskLimit: 200,
      intervalMs: 1000,
    })

    await vi.advanceTimersByTimeAsync(1000)

    expect(mockReconcileCrossDbState).toHaveBeenCalledTimes(2)
    worker.stop()
  })

  it('skips interval passes while reconciliation is still in flight', async () => {
    vi.stubEnv('CROSS_DB_RECONCILIATION_INTERVAL_MS', '1000')

    let resolvePass: ((value: MockResult) => void) | undefined

    mockReconcileCrossDbState.mockImplementation(
      () =>
        new Promise<MockResult>((resolve) => {
          resolvePass = resolve
        }),
    )

    const { startCrossDbReconciliationWorker } = await import('@/services/cross-db-reconciliation.worker')
    const worker = startCrossDbReconciliationWorker()

    await vi.advanceTimersByTimeAsync(1000)

    expect(mockReconcileCrossDbState).toHaveBeenCalledTimes(1)
    expect(mockLogWarn).toHaveBeenCalledWith(
      'cross-db-reconciliation-worker',
      expect.any(Error),
      { trigger: 'interval' },
    )

    resolvePass?.({
      skipped: false,
      openedCount: 0,
      resolvedCount: 0,
      transfer: {
        checkedCount: 0,
        missingCount: 0,
        mismatchCount: 0,
      },
      xrpl: {
        checkedCount: 0,
        missingCount: 0,
        mismatchCount: 0,
      },
      risk: {
        checkedCount: 0,
        missingCount: 0,
        mismatchCount: 0,
      },
    })
    await Promise.resolve()
    worker.stop()
  })
})

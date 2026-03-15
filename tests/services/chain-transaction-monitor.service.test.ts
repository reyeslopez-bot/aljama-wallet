import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCount,
  mockFindMany,
  mockEmitSecurityAlert,
  mockRecordTelemetryEvent,
} = vi.hoisted(() => ({
  mockCount: vi.fn(),
  mockFindMany: vi.fn(),
  mockEmitSecurityAlert: vi.fn(),
  mockRecordTelemetryEvent: vi.fn(),
}))

vi.mock('@/lib/prisma-crdb', () => ({
  prismaCrdb: {
    chainTransaction: {
      count: mockCount,
      findMany: mockFindMany,
    },
  },
}))

vi.mock('@/services/security-alert.service', () => ({
  emitSecurityAlert: mockEmitSecurityAlert,
}))

vi.mock('@/services/telemetry.service', () => ({
  recordTelemetryEvent: mockRecordTelemetryEvent,
}))

describe('chain-transaction-monitor.service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-09T12:00:00.000Z'))
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    mockEmitSecurityAlert.mockResolvedValue({ id: 'alert-1' })
    mockRecordTelemetryEvent.mockResolvedValue({ stored: 'memory' })
    mockCount.mockImplementation(async (args?: { where?: { status?: string; updatedAt?: { lte: Date } } }) => {
      const status = args?.where?.status
      const stuck = Boolean(args?.where?.updatedAt?.lte)
      if (status === 'submitted') return stuck ? 2 : 3
      if (status === 'included') return stuck ? 1 : 4
      if (status === 'confirmed_soft') return 5
      if (status === 'confirmed_final') return 6
      if (status === 'reorged') return 1
      return 0
    })
    mockFindMany.mockImplementation(async (args?: { where?: { status?: string } }) => {
      const status = args?.where?.status
      if (status === 'submitted') {
        return [
          { txHash: '0xsubmitted-1', updatedAt: new Date('2026-03-09T11:55:00.000Z') },
          { txHash: '0xsubmitted-2', updatedAt: new Date('2026-03-09T11:56:00.000Z') },
        ]
      }
      if (status === 'included') {
        return [{ txHash: '0xincluded-1', updatedAt: new Date('2026-03-09T11:40:00.000Z') }]
      }
      return []
    })
  })

  it('collects stuck-transaction summaries and aggregate sync counts', async () => {
    vi.stubEnv('CHAIN_TRANSACTION_STUCK_SUBMITTED_MS', '120000')
    vi.stubEnv('CHAIN_TRANSACTION_STUCK_INCLUDED_MS', '900000')

    const { collectChainTransactionSyncMetrics } = await import('@/services/chain-transaction-monitor.service')
    const metrics = await collectChainTransactionSyncMetrics({
      trigger: 'interval',
      networkId: '11155111',
      processedCount: 9,
      succeededCount: 8,
      failedCount: 1,
    })

    expect(metrics.syncableCount).toBe(19)
    expect(metrics.submittedCount).toBe(3)
    expect(metrics.includedCount).toBe(4)
    expect(metrics.confirmedSoftCount).toBe(5)
    expect(metrics.confirmedFinalCount).toBe(6)
    expect(metrics.reorgedCount).toBe(1)
    expect(metrics.stuckSubmitted).toMatchObject({
      count: 2,
      oldestUpdatedAt: '2026-03-09T11:55:00.000Z',
      sampleTxHashes: ['0xsubmitted-1', '0xsubmitted-2'],
    })
    expect(metrics.stuckIncluded).toMatchObject({
      count: 1,
      oldestUpdatedAt: '2026-03-09T11:40:00.000Z',
      sampleTxHashes: ['0xincluded-1'],
    })
  })

  it('records telemetry and emits stuck-transaction alerts for matching thresholds', async () => {
    const { observeChainTransactionSyncPass } = await import('@/services/chain-transaction-monitor.service')

    await observeChainTransactionSyncPass({
      observedAt: '2026-03-09T12:00:00.000Z',
      trigger: 'startup',
      networkId: '11155111',
      processedCount: 5,
      succeededCount: 5,
      failedCount: 0,
      syncableCount: 7,
      submittedCount: 2,
      includedCount: 3,
      confirmedSoftCount: 1,
      confirmedFinalCount: 1,
      reorgedCount: 0,
      stuckSubmitted: {
        count: 2,
        oldestUpdatedAt: '2026-03-09T11:55:00.000Z',
        oldestAgeMs: 300000,
        sampleTxHashes: ['0xsubmitted-1'],
      },
      stuckIncluded: {
        count: 1,
        oldestUpdatedAt: '2026-03-09T11:40:00.000Z',
        oldestAgeMs: 1200000,
        sampleTxHashes: ['0xincluded-1'],
      },
    })

    expect(mockRecordTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: '1',
        event: 'chain_transaction_sync_pass',
        sessionId: 'server:chain-tx-sync-worker',
        deviceId: '11155111',
        path: '/internal/workers/chain-tx-sync',
        context: {
          trigger: 'startup',
          networkId: '11155111',
        },
        payload: expect.objectContaining({
          processedCount: 5,
          stuckSubmitted: expect.objectContaining({ count: 2 }),
          stuckIncluded: expect.objectContaining({ count: 1 }),
        }),
      }),
    )
    expect(mockEmitSecurityAlert).toHaveBeenCalledTimes(2)
    expect(mockEmitSecurityAlert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        ruleId: 'wallet.chain_transaction.stuck_submitted',
        fingerprint: 'chain-tx:11155111:submitted',
      }),
    )
    expect(mockEmitSecurityAlert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        ruleId: 'wallet.chain_transaction.stuck_included',
        fingerprint: 'chain-tx:11155111:included',
      }),
    )
  })
})

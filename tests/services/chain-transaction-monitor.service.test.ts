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
      if (status === 'broadcasted') return stuck ? 2 : 3
      if (status === 'pending') return stuck ? 1 : 4
      if (status === 'confirmed') return 5
      return 0
    })
    mockFindMany.mockImplementation(async (args?: { where?: { status?: string } }) => {
      const status = args?.where?.status
      if (status === 'broadcasted') {
        return [
          { txHash: '0xbroadcast-1', updatedAt: new Date('2026-03-09T11:55:00.000Z') },
          { txHash: '0xbroadcast-2', updatedAt: new Date('2026-03-09T11:56:00.000Z') },
        ]
      }
      if (status === 'pending') {
        return [{ txHash: '0xpending-1', updatedAt: new Date('2026-03-09T11:40:00.000Z') }]
      }
      return []
    })
  })

  it('collects stuck-transaction summaries and aggregate sync counts', async () => {
    vi.stubEnv('CHAIN_TRANSACTION_STUCK_BROADCASTED_MS', '120000')
    vi.stubEnv('CHAIN_TRANSACTION_STUCK_PENDING_MS', '900000')

    const { collectChainTransactionSyncMetrics } = await import('@/services/chain-transaction-monitor.service')
    const metrics = await collectChainTransactionSyncMetrics({
      trigger: 'interval',
      networkId: '11155111',
      processedCount: 9,
      succeededCount: 8,
      failedCount: 1,
    })

    expect(metrics.syncableCount).toBe(12)
    expect(metrics.broadcastedCount).toBe(3)
    expect(metrics.pendingCount).toBe(4)
    expect(metrics.confirmedCount).toBe(5)
    expect(metrics.stuckBroadcasted).toMatchObject({
      count: 2,
      oldestUpdatedAt: '2026-03-09T11:55:00.000Z',
      sampleTxHashes: ['0xbroadcast-1', '0xbroadcast-2'],
    })
    expect(metrics.stuckPending).toMatchObject({
      count: 1,
      oldestUpdatedAt: '2026-03-09T11:40:00.000Z',
      sampleTxHashes: ['0xpending-1'],
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
      broadcastedCount: 2,
      pendingCount: 3,
      confirmedCount: 2,
      stuckBroadcasted: {
        count: 2,
        oldestUpdatedAt: '2026-03-09T11:55:00.000Z',
        oldestAgeMs: 300000,
        sampleTxHashes: ['0xbroadcast-1'],
      },
      stuckPending: {
        count: 1,
        oldestUpdatedAt: '2026-03-09T11:40:00.000Z',
        oldestAgeMs: 1200000,
        sampleTxHashes: ['0xpending-1'],
      },
    })

    expect(mockRecordTelemetryEvent).toHaveBeenCalledWith({
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
        stuckBroadcasted: expect.objectContaining({ count: 2 }),
        stuckPending: expect.objectContaining({ count: 1 }),
      }),
    })
    expect(mockEmitSecurityAlert).toHaveBeenCalledTimes(2)
    expect(mockEmitSecurityAlert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        ruleId: 'wallet.chain_transaction.stuck_broadcasted',
        fingerprint: 'chain-tx:11155111:broadcasted',
      }),
    )
    expect(mockEmitSecurityAlert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        ruleId: 'wallet.chain_transaction.stuck_pending',
        fingerprint: 'chain-tx:11155111:pending',
      }),
    )
  })
})

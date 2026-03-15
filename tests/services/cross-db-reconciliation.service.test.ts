import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockWalletTransferLogFindMany,
  mockWalletSigningIntentFindMany,
  mockRiskDecisionFindMany,
  mockXrplActionFindMany,
  mockReconciliationIssueFindUnique,
  mockReconciliationIssueUpsert,
  mockReconciliationIssueUpdateMany,
  mockChainTransactionFindMany,
  mockXrplTransactionFindMany,
} = vi.hoisted(() => ({
  mockWalletTransferLogFindMany: vi.fn(),
  mockWalletSigningIntentFindMany: vi.fn(),
  mockRiskDecisionFindMany: vi.fn(),
  mockXrplActionFindMany: vi.fn(),
  mockReconciliationIssueFindUnique: vi.fn(),
  mockReconciliationIssueUpsert: vi.fn(),
  mockReconciliationIssueUpdateMany: vi.fn(),
  mockChainTransactionFindMany: vi.fn(),
  mockXrplTransactionFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma-pg', () => ({
  prismaPg: {
    walletTransferLog: {
      findMany: mockWalletTransferLogFindMany,
    },
    walletSigningIntent: {
      findMany: mockWalletSigningIntentFindMany,
    },
    riskDecision: {
      findMany: mockRiskDecisionFindMany,
    },
    xrplAction: {
      findMany: mockXrplActionFindMany,
    },
    reconciliationIssue: {
      findUnique: mockReconciliationIssueFindUnique,
      upsert: mockReconciliationIssueUpsert,
      updateMany: mockReconciliationIssueUpdateMany,
    },
  },
}))

vi.mock('@/lib/prisma-crdb', () => ({
  prismaCrdb: {
    chainTransaction: {
      findMany: mockChainTransactionFindMany,
    },
    xrplTransaction: {
      findMany: mockXrplTransactionFindMany,
    },
  },
}))

describe('cross-db-reconciliation.service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    vi.stubEnv('PG_DATABASE_URL', 'postgres://reconcile')
    vi.stubEnv('CRDB_DATABASE_URL', 'postgres://cockroach')

    mockWalletTransferLogFindMany.mockResolvedValue([])
    mockWalletSigningIntentFindMany.mockResolvedValue([])
    mockRiskDecisionFindMany.mockResolvedValue([])
    mockXrplActionFindMany.mockResolvedValue([])
    mockReconciliationIssueFindUnique.mockResolvedValue(null)
    mockReconciliationIssueUpsert.mockResolvedValue(undefined)
    mockReconciliationIssueUpdateMany.mockResolvedValue({ count: 0 })
    mockChainTransactionFindMany.mockResolvedValue([])
    mockXrplTransactionFindMany.mockResolvedValue([])
  })

  it('opens a transfer issue when a submitted transfer log has no matching Cockroach transaction', async () => {
    mockWalletTransferLogFindMany.mockResolvedValue([
      {
        id: 'log-1',
        walletId: 'wallet-1',
        chainId: 8453,
        toAddress: '0x000000000000000000000000000000000000dead',
        amountWei: 15n,
        status: 'submitted',
        traceId: 'trace-1',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        txHash: '0xabc',
        nonce: '7',
        createdAt: new Date('2020-03-15T10:00:00.000Z'),
        updatedAt: new Date('2020-03-15T10:01:00.000Z'),
      },
    ])

    const { reconcileWalletTransfers } = await import('@/services/cross-db-reconciliation.service')
    const result = await reconcileWalletTransfers({
      lookbackHours: 24,
      graceMs: 0,
      transferLimit: 10,
    })

    expect(mockReconciliationIssueUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scope_kind_refId: {
            scope: 'wallet_transfer_log',
            kind: 'MISSING_CHAIN_TRANSACTION',
            refId: 'log-1',
          },
        },
      }),
    )
    expect(result).toEqual({
      checkedCount: 1,
      missingCount: 1,
      mismatchCount: 0,
    })
    expect(mockReconciliationIssueUpsert).toHaveBeenCalledTimes(1)
  })

  it('opens an XRPL mismatch issue when action status diverges from the stored transaction', async () => {
    mockXrplActionFindMany.mockResolvedValue([
      {
        id: 'action-1',
        status: 'validated',
        networkId: 'xrpl-testnet',
        txHash: 'ABC123',
        engineResult: 'tesSUCCESS',
        traceId: 'trace-xrpl',
        createdAt: new Date('2020-03-15T10:00:00.000Z'),
        updatedAt: new Date('2020-03-15T10:01:00.000Z'),
      },
    ])
    mockXrplTransactionFindMany.mockResolvedValue([
      {
        actionId: 'action-1',
        networkId: 'xrpl-testnet',
        txHash: 'ABC123',
        status: 'failed',
        engineResult: 'tecUNFUNDED_PAYMENT',
      },
    ])

    const { reconcileXrplActions } = await import('@/services/cross-db-reconciliation.service')
    const result = await reconcileXrplActions({
      lookbackHours: 24,
      graceMs: 0,
      xrplLimit: 10,
    })

    expect(mockReconciliationIssueUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scope_kind_refId: {
            scope: 'xrpl_action',
            kind: 'XRPL_TRANSACTION_MISMATCH',
            refId: 'action-1',
          },
        },
      }),
    )
    expect(result).toEqual({
      checkedCount: 1,
      missingCount: 0,
      mismatchCount: 1,
    })
  })

  it('opens a risk mismatch issue when a blocked decision still produced a transfer', async () => {
    mockRiskDecisionFindMany.mockResolvedValue([
      {
        id: 'risk-1',
        walletId: 'wallet-1',
        userId: 'user-1',
        decision: 'deny',
        context: {
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
          chainId: 8453,
        },
        createdAt: new Date('2020-03-15T10:00:00.000Z'),
      },
    ])
    mockWalletTransferLogFindMany.mockResolvedValue([
      {
        id: 'log-1',
        walletId: 'wallet-1',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        status: 'submitted',
        txHash: '0xabc',
        traceId: 'trace-risk',
        createdAt: new Date('2020-03-15T10:01:00.000Z'),
      },
    ])
    mockChainTransactionFindMany.mockResolvedValue([
      {
        networkId: '8453',
        txHash: '0xabc',
        status: 'submitted',
        fromWalletId: 'wallet-1',
        toAddress: '0x000000000000000000000000000000000000dead',
        valueBaseUnits: 1n,
        nonce: '1',
      },
    ])

    const { reconcileSendRiskDecisions } = await import('@/services/cross-db-reconciliation.service')
    const result = await reconcileSendRiskDecisions({
      lookbackHours: 24,
      graceMs: 0,
      riskLimit: 10,
    })

    expect(mockReconciliationIssueUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scope_kind_refId: {
            scope: 'risk_decision',
            kind: 'RISK_DECISION_OUTCOME_MISMATCH',
            refId: 'risk-1',
          },
        },
      }),
    )
    expect(result).toEqual({
      checkedCount: 1,
      missingCount: 0,
      mismatchCount: 1,
    })
  })

  it('resolves existing issues when transfer and chain transaction are aligned', async () => {
    mockWalletTransferLogFindMany.mockResolvedValue([
      {
        id: 'log-1',
        walletId: 'wallet-1',
        chainId: 8453,
        toAddress: '0x000000000000000000000000000000000000dead',
        amountWei: 15n,
        status: 'confirmed_final',
        traceId: 'trace-1',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        txHash: '0xabc',
        nonce: '7',
        createdAt: new Date('2020-03-15T10:00:00.000Z'),
        updatedAt: new Date('2020-03-15T10:10:00.000Z'),
      },
    ])
    mockChainTransactionFindMany.mockResolvedValue([
      {
        networkId: '8453',
        txHash: '0xabc',
        status: 'confirmed_final',
        fromWalletId: 'wallet-1',
        toAddress: '0x000000000000000000000000000000000000dead',
        valueBaseUnits: 15n,
        nonce: '7',
      },
    ])
    mockReconciliationIssueUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValue({ count: 0 })

    const { reconcileWalletTransfers } = await import('@/services/cross-db-reconciliation.service')
    const result = await reconcileWalletTransfers({
      lookbackHours: 24,
      graceMs: 0,
      transferLimit: 10,
    })

    expect(mockReconciliationIssueUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scope: 'wallet_transfer_log',
          kind: 'MISSING_CHAIN_TRANSACTION',
          refId: 'log-1',
          status: 'open',
        },
      }),
    )
    expect(result).toEqual({
      checkedCount: 1,
      missingCount: 0,
      mismatchCount: 0,
    })
    expect(mockReconciliationIssueUpdateMany).toHaveBeenCalledTimes(2)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockSecuritySignalCreate,
  mockSecuritySignalFindMany,
  mockSecurityAnomalyFindMany,
  mockTransaction,
  mockLogWarn,
  mockLogError,
} = vi.hoisted(() => ({
  mockSecuritySignalCreate: vi.fn(),
  mockSecuritySignalFindMany: vi.fn(),
  mockSecurityAnomalyFindMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockLogWarn: vi.fn(),
  mockLogError: vi.fn(),
}))

vi.mock('@/lib/prisma-pg', () => ({
  prismaPg: {
    securitySignalEvent: {
      create: mockSecuritySignalCreate,
      findMany: mockSecuritySignalFindMany,
    },
    securityAnomalyEvent: {
      findMany: mockSecurityAnomalyFindMany,
    },
    $transaction: mockTransaction,
  },
}))

vi.mock('@/lib/security/logging', () => ({
  logWarn: mockLogWarn,
  logError: mockLogError,
}))

vi.mock('@/services/forensic-retention.service', () => ({
  clearForensicRetentionStateForTests: vi.fn(),
  runForensicRetentionMaintenance: vi.fn(),
}))

vi.mock('@/services/security-alert.service', () => ({
  emitSecurityAlert: vi.fn(),
}))

describe('security-anomaly PG schema diagnostics', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()

    mockSecuritySignalCreate.mockResolvedValue(undefined)
    mockSecuritySignalFindMany.mockResolvedValue([])
    mockSecurityAnomalyFindMany.mockResolvedValue([])
    mockTransaction.mockResolvedValue([])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('logs one concise warning and disables PG forensics after a schema mismatch in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('PG_DATABASE_URL', 'postgresql://example.test/aljama')

    const schemaError = Object.assign(
      new Error('The column `schemaVersion` does not exist in the current database.'),
      { code: 'P2022' },
    )
    mockSecuritySignalCreate.mockRejectedValueOnce(schemaError)

    const {
      clearSecurityAnomalyStateForTests,
      getRecentSecuritySignalsForensics,
      recordSecuritySignal,
    } = await import('@/services/security-anomaly.service')

    clearSecurityAnomalyStateForTests()

    const result = await recordSecuritySignal({
      source: 'auth.register',
      outcome: 'success',
    })

    const signals = await getRecentSecuritySignalsForensics(10)

    expect(mockSecuritySignalCreate).toHaveBeenCalledTimes(1)
    expect(mockSecuritySignalFindMany).not.toHaveBeenCalled()
    expect(signals[0]?.id).toBe(result.signal.id)
    expect(mockLogWarn).toHaveBeenCalledTimes(1)
    expect(mockLogWarn).toHaveBeenCalledWith(
      'security-anomaly:pg-schema',
      expect.objectContaining({
        message: expect.stringContaining('Postgres forensic schema is missing or outdated'),
      }),
      expect.objectContaining({
        code: 'P2022',
        target: 'schemaVersion',
        operation: 'forensic_signal_write',
      }),
    )
    expect(mockLogError).not.toHaveBeenCalled()
  })
})

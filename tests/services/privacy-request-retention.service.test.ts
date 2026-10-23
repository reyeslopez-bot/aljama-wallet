import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFindMany,
  mockEventDeleteMany,
  mockRequestDeleteMany,
  mockConsentFindMany,
  mockConsentDeleteMany,
  mockTransaction,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockEventDeleteMany: vi.fn(),
  mockRequestDeleteMany: vi.fn(),
  mockConsentFindMany: vi.fn(),
  mockConsentDeleteMany: vi.fn(),
  mockTransaction: vi.fn(),
}))

vi.mock('@/lib/prisma-pg', () => ({
  prismaPg: {
    privacyRequest: { findMany: mockFindMany },
    consentReceipt: { findMany: mockConsentFindMany, deleteMany: mockConsentDeleteMany },
    $transaction: mockTransaction,
  },
}))

describe('privacy request retention service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('PG_DATABASE_URL', 'postgres://example')
    mockFindMany.mockResolvedValue([{ id: 'request-1' }, { id: 'request-2' }])
    mockEventDeleteMany.mockResolvedValue({ count: 4 })
    mockRequestDeleteMany.mockResolvedValue({ count: 2 })
    mockConsentFindMany.mockResolvedValue([{ id: 'receipt-1' }])
    mockConsentDeleteMany.mockResolvedValue({ count: 1 })
    mockTransaction.mockImplementation((work) =>
      work({
        privacyRequestEvent: { deleteMany: mockEventDeleteMany },
        privacyRequest: { deleteMany: mockRequestDeleteMany },
      }),
    )
  })

  it('deletes resolved requests and their status history after 90 days', async () => {
    const { purgeResolvedPrivacyRequests } = await import('@/services/privacy-request-retention.service')
    const now = new Date('2026-10-23T00:00:00Z')
    const count = await purgeResolvedPrivacyRequests(now)

    expect(count).toBe(2)
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { resolvedAt: { lt: new Date('2026-07-25T00:00:00Z') } },
      select: { id: true },
      orderBy: { resolvedAt: 'asc' },
      take: 500,
    })
    expect(mockEventDeleteMany).toHaveBeenCalledWith({
      where: { requestId: { in: ['request-1', 'request-2'] } },
    })
    expect(mockRequestDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['request-1', 'request-2'] }, resolvedAt: { lt: new Date('2026-07-25T00:00:00Z') } },
    })
  })

  it('does not start a transaction when there are no expired requests', async () => {
    mockFindMany.mockResolvedValue([])
    const { purgeResolvedPrivacyRequests } = await import('@/services/privacy-request-retention.service')

    await expect(purgeResolvedPrivacyRequests()).resolves.toBe(0)
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('requires PostgreSQL rather than silently skipping retention', async () => {
    vi.stubEnv('PG_DATABASE_URL', '')
    vi.stubEnv('POSTGRES_URL', '')
    const { purgeResolvedPrivacyRequests } = await import('@/services/privacy-request-retention.service')

    await expect(purgeResolvedPrivacyRequests()).rejects.toThrow('PostgreSQL must be configured')
  })

  it('purges consent receipts after 90 days from their creation time', async () => {
    const { purgeExpiredConsentReceipts } = await import('@/services/privacy-request-retention.service')
    const now = new Date('2026-10-23T00:00:00Z')
    const count = await purgeExpiredConsentReceipts(now)

    expect(count).toBe(1)
    expect(mockConsentFindMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-07-25T00:00:00Z') } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    })
    expect(mockConsentDeleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['receipt-1'] },
        createdAt: { lt: new Date('2026-07-25T00:00:00Z') },
      },
    })
  })
})

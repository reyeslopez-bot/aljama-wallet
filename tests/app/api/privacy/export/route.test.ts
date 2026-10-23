import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockUserFindUnique,
  mockUserWalletFindMany,
  mockWalletFindMany,
  mockContactRequestFindMany,
  mockTransferFindMany,
  mockSigningIntentFindMany,
  mockPrivacyRequestFindMany,
  mockRequireSession,
  mockUsePgAuth,
  mockBuildRateLimitKey,
  mockRateLimit,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockUserWalletFindMany: vi.fn(),
  mockWalletFindMany: vi.fn(),
  mockContactRequestFindMany: vi.fn(),
  mockTransferFindMany: vi.fn(),
  mockSigningIntentFindMany: vi.fn(),
  mockPrivacyRequestFindMany: vi.fn(),
  mockRequireSession: vi.fn(),
  mockUsePgAuth: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
}))

vi.mock('@/lib/prisma-pg', () => ({
  prismaPg: {
    user: { findUnique: mockUserFindUnique },
    userWallet: { findMany: mockUserWalletFindMany },
    wallet: { findMany: mockWalletFindMany },
    contactRequest: { findMany: mockContactRequestFindMany },
    walletTransferLog: { findMany: mockTransferFindMany },
    walletSigningIntent: { findMany: mockSigningIntentFindMany },
    privacyRequest: { findMany: mockPrivacyRequestFindMany },
  },
}))
vi.mock('@/lib/auth/store', () => ({ usePgAuth: mockUsePgAuth }))
vi.mock('@/lib/security/session', () => ({ requireSession: mockRequireSession }))
vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))

describe('app/api/privacy/export route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockUsePgAuth.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockResolvedValue({ ok: true })
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      name: 'alice',
      email: 'alice@example.com',
      emailVerified: null,
      image: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    })
    mockUserWalletFindMany.mockResolvedValue([{ walletId: 'wallet-1', createdAt: new Date() }])
    mockWalletFindMany.mockResolvedValue([{ id: 'wallet-1', address: '0x123', chain: 'EVM', createdAt: new Date() }])
    mockContactRequestFindMany.mockResolvedValue([])
    mockTransferFindMany.mockResolvedValue([
      { id: 'transfer-1', amountWei: 123n, blockHeight: 10n, txHash: '0xabc' },
    ])
    mockSigningIntentFindMany.mockResolvedValue([])
    mockPrivacyRequestFindMany.mockResolvedValue([])
  })

  it('requires a signed-in account', async () => {
    mockRequireSession.mockResolvedValue(null)
    const { GET } = await import('@/app/api/privacy/export/route')
    const response = await GET(new Request('http://localhost/api/privacy/export'))

    expect(response.status).toBe(401)
  })

  it('fails explicitly when persistent account storage is unavailable', async () => {
    mockUsePgAuth.mockReturnValue(false)
    const { GET } = await import('@/app/api/privacy/export/route')
    const response = await GET(new Request('http://localhost/api/privacy/export'))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'privacy_export_unavailable',
    })
  })

  it('exports linked records while excluding secret fields and serializing big integers', async () => {
    const { GET } = await import('@/app/api/privacy/export/route')
    const response = await GET(new Request('http://localhost/api/privacy/export'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      scope: 'Account-linked records in the configured PostgreSQL database',
      account: { id: 'user-1', email: 'alice@example.com' },
      wallets: [{ id: 'wallet-1', address: '0x123' }],
      transfers: [{ id: 'transfer-1', amountWei: '123', blockHeight: '10' }],
    })
    expect(body.account.passwordHash).toBeUndefined()
    expect(body.wallets[0].encryptedPrivateKey).toBeUndefined()
    expect(body.exclusions).toContain('Authentication secrets, signing payloads, and private keys are excluded.')
    expect(mockUserFindUnique.mock.calls[0]?.[0].select).not.toHaveProperty('passwordHash')
    expect(mockWalletFindMany.mock.calls[0]?.[0].select).not.toHaveProperty('encryptedPrivateKey')
  })
})

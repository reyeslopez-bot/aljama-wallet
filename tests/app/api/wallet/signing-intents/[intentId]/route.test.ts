import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockIsAdminEmail,
  mockGetWalletSigningIntent,
  mockUserOwnsWallet,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockIsAdminEmail: vi.fn(),
  mockGetWalletSigningIntent: vi.fn(),
  mockUserOwnsWallet: vi.fn(),
}))

vi.mock('@/lib/security/session', () => ({
  requireSession: mockRequireSession,
  isAdminEmail: mockIsAdminEmail,
}))

vi.mock('@/services/signing-intent.service', () => ({
  getWalletSigningIntent: mockGetWalletSigningIntent,
}))

vi.mock('@/services/wallet-ownership.service', () => ({
  userOwnsWallet: mockUserOwnsWallet,
}))

function buildContext(intentId: string) {
  return {
    params: Promise.resolve({ intentId }),
  }
}

describe('app/api/wallet/signing-intents/[intentId] route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mockRequireSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
    })
    mockIsAdminEmail.mockReturnValue(false)
    mockUserOwnsWallet.mockResolvedValue(true)
    mockGetWalletSigningIntent.mockResolvedValue({
      id: 'intent-1',
      status: 'broadcasted',
      walletId: 'wallet-1',
      chainId: 8453,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      correlationId: '22222222-2222-4222-8222-222222222222',
      transferLogId: 'log-1',
      txHash: '0xtxhash',
      errorCode: null,
      createdAt: Date.parse('2026-03-14T10:00:00.000Z'),
      updatedAt: Date.parse('2026-03-14T10:01:00.000Z'),
    })
  })

  it('returns 401 when the session is missing', async () => {
    mockRequireSession.mockResolvedValue(null)
    const { GET } = await import('@/app/api/wallet/signing-intents/[intentId]/route')

    const res = await GET(new Request('http://localhost/api/wallet/signing-intents/intent-1'), buildContext('intent-1'))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.code).toBe('unauthorized')
  })

  it('returns 403 when the requester does not own the wallet', async () => {
    mockUserOwnsWallet.mockResolvedValue(false)
    const { GET } = await import('@/app/api/wallet/signing-intents/[intentId]/route')

    const res = await GET(new Request('http://localhost/api/wallet/signing-intents/intent-1'), buildContext('intent-1'))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe('forbidden')
  })

  it('returns the intent status when authorized', async () => {
    const { GET } = await import('@/app/api/wallet/signing-intents/[intentId]/route')

    const res = await GET(new Request('http://localhost/api/wallet/signing-intents/intent-1'), buildContext('intent-1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      intentId: 'intent-1',
      status: 'broadcasted',
      walletId: 'wallet-1',
      chainId: 8453,
      transferLogId: 'log-1',
      txHash: '0xtxhash',
      errorCode: null,
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockIsAdminEmail,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetWalletSnapshotForUser,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockIsAdminEmail: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetWalletSnapshotForUser: vi.fn(),
}))

class MockWalletBoundaryError extends Error {
  code: 'FORBIDDEN' | 'NOT_FOUND'

  constructor(code: 'FORBIDDEN' | 'NOT_FOUND') {
    super(code)
    this.code = code
  }
}

vi.mock('@/lib/security/session', () => ({
  requireSession: mockRequireSession,
  isAdminEmail: mockIsAdminEmail,
}))

vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))

vi.mock('@/services/wallet-boundary.service', () => ({
  WalletBoundaryError: MockWalletBoundaryError,
  getWalletSnapshotForUser: mockGetWalletSnapshotForUser,
}))

function buildContext(id: string) {
  return {
    params: Promise.resolve({ id }),
  }
}

function buildRequest() {
  return new Request('http://localhost/api/wallet/wallet-1', { method: 'GET' })
}

describe('app/api/wallet/[id] route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mockRequireSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
    })
    mockIsAdminEmail.mockReturnValue(false)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 59, resetAt: Date.now() + 60_000 })
    mockGetWalletSnapshotForUser.mockResolvedValue({
      walletId: 'wallet-1',
      address: '0xabc',
      createdAt: new Date().toISOString(),
      authorities: {
        transactional: 'cockroachdb',
        analytics: 'memory',
        chain: 'xrpl',
      },
      summary: {
        transactionalTxCount: 0,
        transferAttemptCount24h: 0,
        lastTransactionalAt: null,
        lastTransferStatus: null,
      },
      reconciliation: {
        source: 'xrpl',
        status: 'not_applicable',
        checkedAt: new Date().toISOString(),
        ledgerIndex: null,
        ledgerHash: null,
      },
      updatedAt: new Date().toISOString(),
    })
  })

  it('returns 401 when session is missing', async () => {
    mockRequireSession.mockResolvedValue(null)
    const { GET } = await import('@/app/api/wallet/[id]/route')

    const res = await GET(buildRequest(), buildContext('wallet-1'))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.code).toBe('unauthorized')
  })

  it('returns 429 when request is rate-limited', async () => {
    mockRateLimit.mockReturnValue({ ok: false, retryAfter: 10, resetAt: Date.now() + 10_000 })
    const { GET } = await import('@/app/api/wallet/[id]/route')

    const res = await GET(buildRequest(), buildContext('wallet-1'))
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.code).toBe('rate_limited')
    expect(res.headers.get('retry-after')).toBe('10')
  })

  it('returns 403 when service denies access', async () => {
    mockGetWalletSnapshotForUser.mockRejectedValue(new MockWalletBoundaryError('FORBIDDEN'))
    const { GET } = await import('@/app/api/wallet/[id]/route')

    const res = await GET(buildRequest(), buildContext('wallet-1'))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe('forbidden')
  })

  it('returns 404 when wallet does not exist', async () => {
    mockGetWalletSnapshotForUser.mockRejectedValue(new MockWalletBoundaryError('NOT_FOUND'))
    const { GET } = await import('@/app/api/wallet/[id]/route')

    const res = await GET(buildRequest(), buildContext('wallet-404'))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.code).toBe('wallet_not_found')
  })

  it('returns normalized snapshot payload', async () => {
    const { GET } = await import('@/app/api/wallet/[id]/route')

    const res = await GET(buildRequest(), buildContext('wallet-1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.wallet.walletId).toBe('wallet-1')
    expect(mockGetWalletSnapshotForUser).toHaveBeenCalledWith({
      walletId: 'wallet-1',
      userId: 'user-1',
      isAdmin: false,
    })
  })
})

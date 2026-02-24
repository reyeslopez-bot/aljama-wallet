import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockIsAdminEmail,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetWalletTransactionsForUser,
  mockIsAllowedOrigin,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockIsAdminEmail: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetWalletTransactionsForUser: vi.fn(),
  mockIsAllowedOrigin: vi.fn(),
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

vi.mock('@/lib/security/origin', () => ({
  isAllowedOrigin: mockIsAllowedOrigin,
}))

vi.mock('@/services/wallet-boundary.service', () => ({
  WalletBoundaryError: MockWalletBoundaryError,
  getWalletTransactionsForUser: mockGetWalletTransactionsForUser,
}))

function buildContext(id: string) {
  return {
    params: Promise.resolve({ id }),
  }
}

describe('app/api/wallet/[id]/transactions route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mockRequireSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
    })
    mockIsAdminEmail.mockReturnValue(false)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 119, resetAt: Date.now() + 60_000 })
    mockIsAllowedOrigin.mockReturnValue(true)
    mockGetWalletTransactionsForUser.mockResolvedValue({
      walletId: 'wallet-1',
      items: [],
      nextCursor: null,
    })
  })

  it('returns 400 for invalid cursor values', async () => {
    const { GET } = await import('@/app/api/wallet/[id]/transactions/route')
    const req = new Request('http://localhost/api/wallet/wallet-1/transactions?cursor=bad-date')

    const res = await GET(req, buildContext('wallet-1'))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('invalid_cursor')
  })

  it('maps forbidden errors to 403', async () => {
    mockGetWalletTransactionsForUser.mockRejectedValue(new MockWalletBoundaryError('FORBIDDEN'))
    const { GET } = await import('@/app/api/wallet/[id]/transactions/route')
    const req = new Request('http://localhost/api/wallet/wallet-1/transactions')

    const res = await GET(req, buildContext('wallet-1'))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe('forbidden')
  })

  it('returns 403 when origin is not allowed', async () => {
    mockIsAllowedOrigin.mockReturnValue(false)
    const { GET } = await import('@/app/api/wallet/[id]/transactions/route')
    const req = new Request('http://localhost/api/wallet/wallet-1/transactions')

    const res = await GET(req, buildContext('wallet-1'))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe('invalid_origin')
  })

  it('returns transactions page payload', async () => {
    const { GET } = await import('@/app/api/wallet/[id]/transactions/route')
    const req = new Request('http://localhost/api/wallet/wallet-1/transactions?limit=10')

    const res = await GET(req, buildContext('wallet-1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.walletId).toBe('wallet-1')
    expect(mockGetWalletTransactionsForUser).toHaveBeenCalledWith({
      walletId: 'wallet-1',
      userId: 'user-1',
      isAdmin: false,
      limit: 10,
      cursor: null,
    })
  })
})

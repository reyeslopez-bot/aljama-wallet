import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetWallets,
  mockGetWalletsByIds,
  mockRequireSession,
  mockIsAdminEmail,
  mockGetWalletIdsForUser,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockIsAllowedOrigin,
} = vi.hoisted(() => ({
  mockGetWallets: vi.fn(),
  mockGetWalletsByIds: vi.fn(),
  mockRequireSession: vi.fn(),
  mockIsAdminEmail: vi.fn(),
  mockGetWalletIdsForUser: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockIsAllowedOrigin: vi.fn(),
}))

vi.mock('@/services/wallet.service', () => ({
  getWallets: mockGetWallets,
  getWalletsByIds: mockGetWalletsByIds,
}))

vi.mock('@/lib/security/session', () => ({
  requireSession: mockRequireSession,
  isAdminEmail: mockIsAdminEmail,
}))

vi.mock('@/services/wallet-ownership.service', () => ({
  getWalletIdsForUser: mockGetWalletIdsForUser,
}))

vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))

vi.mock('@/lib/security/origin', () => ({
  isAllowedOrigin: mockIsAllowedOrigin,
}))

function buildRequest() {
  return new Request('http://localhost/api/wallets', {
    method: 'GET',
    headers: { 'x-forwarded-for': '127.0.0.1' },
  })
}

describe('app/api/wallets route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mockRequireSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
    })
    mockIsAdminEmail.mockReturnValue(false)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 59, resetAt: Date.now() + 60_000 })
    mockIsAllowedOrigin.mockReturnValue(true)
    mockGetWalletIdsForUser.mockResolvedValue(['wallet-1', 'wallet-2'])
    mockGetWalletsByIds.mockResolvedValue([
      { id: 'wallet-1', address: '0x1' },
      { id: 'wallet-2', address: '0x2' },
    ])
    mockGetWallets.mockResolvedValue([
      { id: 'wallet-a', address: '0xa' },
      { id: 'wallet-b', address: '0xb' },
    ])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 401 when no authenticated session exists', async () => {
    mockRequireSession.mockResolvedValue(null)
    const { GET } = await import('@/app/api/wallets/route')

    const res = await GET(buildRequest())
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.code).toBe('unauthorized')
  })

  it('returns 429 when wallet list requests are rate limited', async () => {
    mockRateLimit.mockReturnValue({ ok: false, retryAfter: 15, resetAt: Date.now() + 15_000 })
    const { GET } = await import('@/app/api/wallets/route')

    const res = await GET(buildRequest())
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.code).toBe('rate_limited')
    expect(res.headers.get('retry-after')).toBe('15')
  })

  it('returns 403 when origin is not allowed', async () => {
    mockIsAllowedOrigin.mockReturnValue(false)
    const { GET } = await import('@/app/api/wallets/route')

    const res = await GET(buildRequest())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe('invalid_origin')
  })

  it('returns all wallets for admin users', async () => {
    mockIsAdminEmail.mockReturnValue(true)
    const { GET } = await import('@/app/api/wallets/route')

    const res = await GET(buildRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual([
      { id: 'wallet-a', address: '0xa' },
      { id: 'wallet-b', address: '0xb' },
    ])
    expect(mockGetWallets).toHaveBeenCalledTimes(1)
    expect(mockGetWalletIdsForUser).not.toHaveBeenCalled()
  })

  it('returns only owned wallets for non-admin users', async () => {
    const { GET } = await import('@/app/api/wallets/route')

    const res = await GET(buildRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual([
      { id: 'wallet-1', address: '0x1' },
      { id: 'wallet-2', address: '0x2' },
    ])
    expect(mockGetWalletIdsForUser).toHaveBeenCalledWith('user-1')
    expect(mockGetWalletsByIds).toHaveBeenCalledWith(['wallet-1', 'wallet-2'])
    expect(mockGetWallets).not.toHaveBeenCalled()
  })
})

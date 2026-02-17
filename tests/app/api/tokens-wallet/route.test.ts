import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetTokensByWallet,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockLogError,
} = vi.hoisted(() => ({
  mockGetTokensByWallet: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockLogError: vi.fn(),
}))

vi.mock('@/lib/getTokensByWallet', () => ({
  getTokensByWallet: mockGetTokensByWallet,
}))

vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))

vi.mock('@/lib/security/logging', () => ({
  logError: mockLogError,
}))

describe('app/api/tokens-wallet route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockBuildRateLimitKey.mockReturnValue('ip:127.0.0.1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 59, resetAt: Date.now() + 60_000 })
    mockGetTokensByWallet.mockResolvedValue([{ symbol: 'ETH', balance: '1.0' }])
  })

  it('returns 429 when endpoint is rate limited', async () => {
    mockRateLimit.mockReturnValue({ ok: false, retryAfter: 7, resetAt: Date.now() + 7_000 })
    const { GET } = await import('@/app/api/tokens-wallet/route')

    const res = await GET(
      new Request('http://localhost/api/tokens-wallet?address=0x000000000000000000000000000000000000dEaD'),
    )
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.code).toBe('rate_limited')
    expect(res.headers.get('retry-after')).toBe('7')
  })

  it('returns 400 for invalid wallet addresses', async () => {
    const { GET } = await import('@/app/api/tokens-wallet/route')

    const res = await GET(new Request('http://localhost/api/tokens-wallet?address=not-an-address'))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('invalid_address')
    expect(mockGetTokensByWallet).not.toHaveBeenCalled()
  })

  it('returns token balances for valid address/network', async () => {
    const { GET } = await import('@/app/api/tokens-wallet/route')

    const res = await GET(
      new Request(
        'http://localhost/api/tokens-wallet?address=0x000000000000000000000000000000000000dEaD&network=base-mainnet',
      ),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      address: '0x000000000000000000000000000000000000dEaD',
      network: 'base-mainnet',
      tokens: [{ symbol: 'ETH', balance: '1.0' }],
    })
    expect(mockGetTokensByWallet).toHaveBeenCalledWith(
      '0x000000000000000000000000000000000000dEaD',
      { network: 'base-mainnet' },
    )
  })

  it('maps unsupported network errors to 400', async () => {
    mockGetTokensByWallet.mockRejectedValue(new Error('Network not allowed'))
    const { GET } = await import('@/app/api/tokens-wallet/route')

    const res = await GET(
      new Request(
        'http://localhost/api/tokens-wallet?address=0x000000000000000000000000000000000000dEaD&network=forbidden',
      ),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('tokens_failed')
    expect(body.error).toBe('Network not allowed')
  })
})

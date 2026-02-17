import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetXrplClient,
  mockRequest,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetXrplClient: vi.fn(),
  mockRequest: vi.fn(),
}))

vi.mock('@/lib/security/session', () => ({
  requireSession: mockRequireSession,
}))

vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))

vi.mock('@/infra/xrpl/client', () => ({
  getXrplClient: mockGetXrplClient,
}))

describe('app/api/xrpl/orderbook route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 10, resetAt: Date.now() + 60_000 })
    mockGetXrplClient.mockResolvedValue({ request: mockRequest })
    mockRequest.mockResolvedValue({
      result: {
        offers: [{ Account: 'rA', Sequence: 1, quality: '1.01', TakerGets: '10', TakerPays: '20' }],
      },
    })
  })

  it('returns 400 for invalid network', async () => {
    const { GET } = await import('@/app/api/xrpl/orderbook/route')
    const res = await GET(new Request('http://localhost/api/xrpl/orderbook?network=bad&takerGetsCurrency=XRP&takerPaysCurrency=USD&takerPaysIssuer=rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('xrpl_orderbook_failed')
  })

  it('returns orderbook entries', async () => {
    const { GET } = await import('@/app/api/xrpl/orderbook/route')
    const res = await GET(new Request('http://localhost/api/xrpl/orderbook?takerGetsCurrency=XRP&takerPaysCurrency=USD&takerPaysIssuer=rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.offers).toHaveLength(1)
    expect(mockRequest).toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockListXrplActions,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockListXrplActions: vi.fn(),
}))

vi.mock('@/lib/security/session', () => ({
  requireSession: mockRequireSession,
}))

vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))

vi.mock('@/services/xrpl-action-log.service', () => ({
  listXrplActions: mockListXrplActions,
}))

describe('app/api/xrpl/action-history route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 10, resetAt: Date.now() + 60_000 })
    mockListXrplActions.mockResolvedValue([
      {
        id: 'a1',
        action: 'offer_create',
        status: 'validated',
        txHash: 'ABC',
      },
    ])
  })

  it('returns 401 for missing session', async () => {
    mockRequireSession.mockResolvedValue(null)
    const { GET } = await import('@/app/api/xrpl/action-history/route')
    const res = await GET(new Request('http://localhost/api/xrpl/action-history'))
    expect(res.status).toBe(401)
  })

  it('returns action history for valid request', async () => {
    const { GET } = await import('@/app/api/xrpl/action-history/route')
    const res = await GET(new Request('http://localhost/api/xrpl/action-history?network=testnet&limit=5'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.actions).toHaveLength(1)
    expect(mockListXrplActions).toHaveBeenCalledWith({ limit: 5, networkId: 'testnet' })
  })
})

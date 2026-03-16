import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockIsAllowedOrigin,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetXrplSignerAccount,
  mockReviewXrplIssuerHolder,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockIsAllowedOrigin: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetXrplSignerAccount: vi.fn(),
  mockReviewXrplIssuerHolder: vi.fn(),
}))

vi.mock('@/lib/security/session', () => ({ requireSession: mockRequireSession }))
vi.mock('@/lib/security/origin', () => ({ isAllowedOrigin: mockIsAllowedOrigin }))
vi.mock('@/lib/security/rate-limit', () => ({ buildRateLimitKey: mockBuildRateLimitKey, rateLimit: mockRateLimit }))
vi.mock('@/lib/xrpl-signer', () => ({ getXrplSignerAccount: mockGetXrplSignerAccount }))
vi.mock('@/services/xrpl-issuer-policy.service', () => ({
  XRPL_ISSUER_REVIEWABLE_HOLDER_STATUSES: ['pending', 'approved', 'rejected', 'revoked'],
  reviewXrplIssuerHolder: mockReviewXrplIssuerHolder,
}))

describe('app/api/xrpl/issuer/holder/review route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockIsAllowedOrigin.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 10, resetAt: Date.now() + 60_000 })
    mockGetXrplSignerAccount.mockReturnValue({
      address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
    })
    mockReviewXrplIssuerHolder.mockResolvedValue({
      id: 'holder-1',
      status: 'approved',
    })
  })

  // Reviewing a holder should fail fast when the backing asset registry entry
  // does not exist, because approval records are asset-scoped.
  it('returns a conflict when the asset has not been registered', async () => {
    mockReviewXrplIssuerHolder.mockRejectedValue(new Error('Issuer asset is not registered'))

    const { POST } = await import('@/app/api/xrpl/issuer/holder/review/route')
    const res = await POST(
      new Request('http://localhost/api/xrpl/issuer/holder/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currency: 'RWAUSD',
          holder: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
          status: 'approved',
        }),
      }),
    )

    expect(res.status).toBe(409)
  })

  // The happy path should stamp the review against the normalized asset and
  // holder identifiers, using the configured issuer account by default.
  it('reviews a holder against a registered issuer asset', async () => {
    const { POST } = await import('@/app/api/xrpl/issuer/holder/review/route')
    const res = await POST(
      new Request('http://localhost/api/xrpl/issuer/holder/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currency: 'RWAUSD',
          holder: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
          status: 'approved',
          notes: 'KYC complete',
        }),
      }),
    )

    expect(res.status).toBe(200)
    expect(mockReviewXrplIssuerHolder).toHaveBeenCalledWith({
      networkId: 'testnet',
      issuerAccount: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      currency: 'RWAUSD',
      holderAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      status: 'approved',
      approvedByUserId: 'user-1',
      notes: 'KYC complete',
      reviewContext: undefined,
    })
  })
})

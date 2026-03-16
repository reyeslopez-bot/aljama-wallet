import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockIsAllowedOrigin,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockResolveConfiguredXrplAccount,
  mockUpsertXrplIssuerAsset,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockIsAllowedOrigin: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockResolveConfiguredXrplAccount: vi.fn(),
  mockUpsertXrplIssuerAsset: vi.fn(),
}))

vi.mock('@/lib/security/session', () => ({ requireSession: mockRequireSession }))
vi.mock('@/lib/security/origin', () => ({ isAllowedOrigin: mockIsAllowedOrigin }))
vi.mock('@/lib/security/rate-limit', () => ({ buildRateLimitKey: mockBuildRateLimitKey, rateLimit: mockRateLimit }))
vi.mock('@/services/xrpl-runtime-signer.service', () => ({ resolveConfiguredXrplAccount: mockResolveConfiguredXrplAccount }))
vi.mock('@/services/xrpl-issuer-policy.service', () => ({
  XRPL_ISSUER_ASSET_STATUSES: ['draft', 'active', 'paused', 'archived'],
  XRPL_ISSUER_PROGRAM_STATUSES: ['draft', 'active', 'paused', 'archived'],
  upsertXrplIssuerAsset: mockUpsertXrplIssuerAsset,
}))

describe('app/api/xrpl/issuer/asset route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockIsAllowedOrigin.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 10, resetAt: Date.now() + 60_000 })
    mockResolveConfiguredXrplAccount.mockResolvedValue({
      address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
    })
    mockUpsertXrplIssuerAsset.mockResolvedValue({
      program: { id: 'program-1' },
      asset: { id: 'asset-1', currency: 'RWAUSD' },
    })
  })

  // The registry route should reject XRP because this table is for issued
  // assets, not the native token.
  it('rejects XRP as an issuer asset currency', async () => {
    const { POST } = await import('@/app/api/xrpl/issuer/asset/route')
    const res = await POST(
      new Request('http://localhost/api/xrpl/issuer/asset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currency: 'XRP',
        }),
      }),
    )

    expect(res.status).toBe(400)
    expect(mockUpsertXrplIssuerAsset).not.toHaveBeenCalled()
  })

  // The default issuer should come from the configured signer so the route is
  // usable without forcing the caller to repeat account identity each time.
  it('upserts an issuer asset policy using the signer account by default', async () => {
    const { POST } = await import('@/app/api/xrpl/issuer/asset/route')
    const res = await POST(
      new Request('http://localhost/api/xrpl/issuer/asset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currency: 'RWAUSD',
          displayName: 'RWA USD',
          maxDistributionValue: '1000',
          requiresAuthorizedTrustlines: true,
        }),
      }),
    )

    expect(res.status).toBe(200)
    expect(mockUpsertXrplIssuerAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        networkId: 'testnet',
        issuerAccount: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
        currency: 'RWAUSD',
        displayName: 'RWA USD',
        maxDistributionValue: '1000',
        program: expect.objectContaining({
          requiresAuthorizedTrustlines: true,
        }),
      }),
    )
  })
})

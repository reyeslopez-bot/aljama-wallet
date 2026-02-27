import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetXrplSignerAddress,
  mockGetXrplAccountAssets,
  mockGetAllowedIssuerSet,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetXrplSignerAddress: vi.fn(),
  mockGetXrplAccountAssets: vi.fn(),
  mockGetAllowedIssuerSet: vi.fn(),
}))

vi.mock('@/lib/security/session', () => ({
  requireSession: mockRequireSession,
}))

vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))

vi.mock('@/lib/xrpl-signer', () => ({
  getXrplSignerAddress: mockGetXrplSignerAddress,
}))

vi.mock('@/lib/xrpl-issued-assets', () => ({
  getXrplAccountAssets: mockGetXrplAccountAssets,
  getAllowedIssuerSet: mockGetAllowedIssuerSet,
}))

describe('app/api/xrpl/account-assets route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 10, resetAt: Date.now() + 60_000 })
    mockGetXrplSignerAddress.mockReturnValue('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')
    mockGetAllowedIssuerSet.mockReturnValue({
      enabled: false,
      allowed: new Set(),
    })
    mockGetXrplAccountAssets.mockResolvedValue({
      account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      network: 'testnet',
      assets: [{
        assetType: 'xrp',
        currency: 'XRP',
        issuer: null,
        value: '12.3',
        limit: null,
        qualityIn: null,
        qualityOut: null,
      }],
      filteredOut: 0,
      allowlistEnabled: false,
    })
  })

  it('returns 401 for missing session', async () => {
    mockRequireSession.mockResolvedValue(null)
    const { GET } = await import('@/app/api/xrpl/account-assets/route')
    const res = await GET(new Request('http://localhost/api/xrpl/account-assets'))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.code).toBe('unauthorized')
  })

  it('returns 400 for invalid network', async () => {
    const { GET } = await import('@/app/api/xrpl/account-assets/route')
    const res = await GET(new Request('http://localhost/api/xrpl/account-assets?network=bad-net'))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('invalid_network')
    expect(mockGetXrplAccountAssets).not.toHaveBeenCalled()
  })

  it('loads assets with default signer account', async () => {
    const { GET } = await import('@/app/api/xrpl/account-assets/route')
    const res = await GET(new Request('http://localhost/api/xrpl/account-assets'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockGetXrplAccountAssets).toHaveBeenCalledWith({ networkId: 'testnet', account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh' })
  })

  it('returns empty XRP balance when account is not found on the selected network', async () => {
    mockGetXrplAccountAssets.mockRejectedValue({
      name: 'RippledError',
      message: 'Account not found.',
      data: { error: 'actNotFound', error_message: 'Account not found.' },
    })

    const { GET } = await import('@/app/api/xrpl/account-assets/route')
    const res = await GET(new Request('http://localhost/api/xrpl/account-assets?network=mainnet'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.account).toBe('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')
    expect(body.network).toBe('mainnet')
    expect(body.assets).toEqual([
      {
        assetType: 'xrp',
        currency: 'XRP',
        issuer: null,
        value: '0',
        limit: null,
        qualityIn: null,
        qualityOut: null,
      },
    ])
  })
})

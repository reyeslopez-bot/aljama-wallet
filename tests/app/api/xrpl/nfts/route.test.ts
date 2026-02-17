import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetXrplSignerAddress,
  mockGetXrplClient,
  mockRequest,
  mockDecodeHexUri,
  mockFetchNftMetadata,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetXrplSignerAddress: vi.fn(),
  mockGetXrplClient: vi.fn(),
  mockRequest: vi.fn(),
  mockDecodeHexUri: vi.fn(),
  mockFetchNftMetadata: vi.fn(),
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

vi.mock('@/infra/xrpl/client', () => ({
  getXrplClient: mockGetXrplClient,
}))

vi.mock('@/lib/xrpl-nft-metadata', () => ({
  decodeHexUri: mockDecodeHexUri,
  fetchNftMetadata: mockFetchNftMetadata,
}))

describe('app/api/xrpl/nfts route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 10, resetAt: Date.now() + 60_000 })
    mockGetXrplSignerAddress.mockReturnValue('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')
    mockGetXrplClient.mockResolvedValue({ request: mockRequest })
    mockRequest.mockResolvedValue({
      result: {
        account_nfts: [{ NFTokenID: '0001', URI: '68656c6c6f', Issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' }],
      },
    })
    mockDecodeHexUri.mockReturnValue('https://example.com/meta.json')
    mockFetchNftMetadata.mockResolvedValue({ name: 'NFT', description: 'desc', image: null, externalUrl: null })
  })

  it('returns 401 if session missing', async () => {
    mockRequireSession.mockResolvedValue(null)
    const { GET } = await import('@/app/api/xrpl/nfts/route')
    const res = await GET(new Request('http://localhost/api/xrpl/nfts'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid account', async () => {
    const { GET } = await import('@/app/api/xrpl/nfts/route')
    const res = await GET(new Request('http://localhost/api/xrpl/nfts?account=bad-account'))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('invalid_account')
  })

  it('returns normalized nft payload', async () => {
    const { GET } = await import('@/app/api/xrpl/nfts/route')
    const res = await GET(new Request('http://localhost/api/xrpl/nfts'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.nfts[0].nftokenId).toBe('0001')
  })
})

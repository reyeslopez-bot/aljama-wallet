import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetXrplSignerAccount,
  mockQuoteXrplSwap,
} = vi.hoisted(() => ({
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetXrplSignerAccount: vi.fn(),
  mockQuoteXrplSwap: vi.fn(),
}))

vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))

vi.mock('@/lib/xrpl-signer', () => ({
  getXrplSignerAccount: mockGetXrplSignerAccount,
}))

vi.mock('@/services/xrpl-swap.service', () => ({
  quoteXrplSwap: mockQuoteXrplSwap,
}))

describe('app/api/xrpl/trade/swap/quote route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildRateLimitKey.mockReturnValue('anon')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 10, resetAt: Date.now() + 60_000 })
    mockGetXrplSignerAccount.mockReturnValue({
      address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
    })
    mockQuoteXrplSwap.mockResolvedValue({
      sourceAmount: { currency: 'XRP', value: '50' },
      quotedSourceAmount: { currency: 'XRP', value: '50' },
      destinationAmount: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '45.5' },
      deliverMin: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '45.2725' },
      paths: [],
      pathCount: 0,
      alternativeCount: 2,
      fullReply: true,
      slippageBps: 50,
    })
  })

  it('returns 400 for invalid network', async () => {
    const { GET } = await import('@/app/api/xrpl/trade/swap/quote/route')
    const res = await GET(new Request('http://localhost/api/xrpl/trade/swap/quote?network=bad&sourceCurrency=XRP&sourceValue=50&destinationCurrency=USD&destinationIssuer=rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'))
    expect(res.status).toBe(400)
  })

  it('returns a pathfinding quote', async () => {
    const { GET } = await import('@/app/api/xrpl/trade/swap/quote/route')
    const res = await GET(new Request('http://localhost/api/xrpl/trade/swap/quote?sourceCurrency=XRP&sourceValue=50&destinationCurrency=USD&destinationIssuer=rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe&slippageBps=50'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.quote.destinationAmount.value).toBe('45.5')
    expect(mockQuoteXrplSwap).toHaveBeenCalled()
  })
})

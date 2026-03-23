import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetXrplClient,
  mockGetXrplSignerAccount,
  mockDoesXrplAccountExist,
  mockGetPublicXrplSwapQuote,
  mockQuoteXrplSwap,
} = vi.hoisted(() => ({
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetXrplClient: vi.fn(),
  mockGetXrplSignerAccount: vi.fn(),
  mockDoesXrplAccountExist: vi.fn(),
  mockGetPublicXrplSwapQuote: vi.fn(),
  mockQuoteXrplSwap: vi.fn(),
}))

vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))

vi.mock('@/infra/xrpl/client', () => ({
  getXrplClient: mockGetXrplClient,
}))

vi.mock('@/lib/xrpl/quote/accountExists', () => ({
  doesXrplAccountExist: mockDoesXrplAccountExist,
}))

vi.mock('@/lib/xrpl/quote/publicQuote', () => ({
  getPublicXrplSwapQuote: mockGetPublicXrplSwapQuote,
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
    mockGetXrplClient.mockResolvedValue({ request: vi.fn() })
    mockGetXrplSignerAccount.mockReturnValue({
      address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
    })
    mockDoesXrplAccountExist.mockResolvedValue(true)
    mockGetPublicXrplSwapQuote.mockResolvedValue({
      quoteMode: 'public',
      liquiditySource: 'orderbook',
      sourceAmount: { currency: 'XRP', value: '50' },
      quotedSourceAmount: { currency: 'XRP', value: '50' },
      destinationAmount: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '44.5' },
      deliverMin: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '44.2775' },
      pathCount: 0,
      alternativeCount: 1,
      fullReply: true,
      slippageBps: 50,
      sourceSelection: 'native',
      destinationSelection: 'trusted_policy',
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

  it('returns an account-aware pathfinding quote when the account exists', async () => {
    const { GET } = await import('@/app/api/xrpl/trade/swap/quote/route')
    const res = await GET(new Request('http://localhost/api/xrpl/trade/swap/quote?sourceCurrency=XRP&sourceValue=50&destinationCurrency=USD&destinationIssuer=rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe&slippageBps=50'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.quoteMode).toBe('account')
    expect(body.accountExists).toBe(true)
    expect(body.quote.liquiditySource).toBe('path_find')
    expect(body.quote.destinationAmount.value).toBe('45.5')
    expect(mockQuoteXrplSwap).toHaveBeenCalled()
    expect(mockGetPublicXrplSwapQuote).not.toHaveBeenCalled()
  })

  it('falls back to a public quote when the selected account does not exist on-ledger', async () => {
    mockDoesXrplAccountExist.mockResolvedValue(false)

    const { GET } = await import('@/app/api/xrpl/trade/swap/quote/route')
    const res = await GET(new Request('http://localhost/api/xrpl/trade/swap/quote?network=mainnet&account=rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe&sourceCurrency=XRP&sourceValue=50&destinationCurrency=USD&destinationIssuer=rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.account).toBe('rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe')
    expect(body.accountExists).toBe(false)
    expect(body.quoteMode).toBe('public')
    expect(body.quote.liquiditySource).toBe('orderbook')
    expect(body.quote.destinationAmount.value).toBe('44.5')
    expect(mockQuoteXrplSwap).not.toHaveBeenCalled()
    expect(mockGetPublicXrplSwapQuote).toHaveBeenCalled()
  })

  it('falls back to a public quote when signer config is missing', async () => {
    mockGetXrplSignerAccount.mockImplementation(() => {
      throw new Error('Missing XRPL signer seed (XRPL_SIGNER_SEED or XRPL_DEV_SEED)')
    })

    const { GET } = await import('@/app/api/xrpl/trade/swap/quote/route')
    const res = await GET(new Request('http://localhost/api/xrpl/trade/swap/quote?sourceCurrency=XRP&sourceValue=50&destinationCurrency=USD'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.account).toBeNull()
    expect(body.accountExists).toBe(false)
    expect(body.quoteMode).toBe('public')
    expect(mockDoesXrplAccountExist).not.toHaveBeenCalled()
    expect(mockGetPublicXrplSwapQuote).toHaveBeenCalled()
  })

  it('falls back to a public quote when account-aware quoting is blocked by wallet state', async () => {
    mockQuoteXrplSwap.mockRejectedValue(
      new Error('No trusted USD trustline is configured in this wallet on Testnet.'),
    )

    const { GET } = await import('@/app/api/xrpl/trade/swap/quote/route')
    const res = await GET(new Request('http://localhost/api/xrpl/trade/swap/quote?sourceCurrency=XRP&sourceValue=50&destinationCurrency=USD'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.quoteMode).toBe('public')
    expect(body.quote.liquiditySource).toBe('orderbook')
    expect(mockGetPublicXrplSwapQuote).toHaveBeenCalled()
  })
})

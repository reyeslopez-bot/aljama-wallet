import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockIsAllowedOrigin,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetXrplClient,
  mockDoesXrplAccountExist,
  mockAssessXrplActionRisk,
  mockQuoteXrplSwap,
  mockBuildSwapPaymentTx,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockIsAllowedOrigin: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetXrplClient: vi.fn(),
  mockDoesXrplAccountExist: vi.fn(),
  mockAssessXrplActionRisk: vi.fn(),
  mockQuoteXrplSwap: vi.fn(),
  mockBuildSwapPaymentTx: vi.fn(),
}))

vi.mock('@/lib/security/session', () => ({ requireSession: mockRequireSession }))
vi.mock('@/lib/security/origin', () => ({ isAllowedOrigin: mockIsAllowedOrigin }))
vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))
vi.mock('@/infra/xrpl/client', () => ({ getXrplClient: mockGetXrplClient }))
vi.mock('@/lib/xrpl/quote/accountExists', () => ({
  doesXrplAccountExist: mockDoesXrplAccountExist,
}))
vi.mock('@/services/xrpl-risk.service', () => ({
  assessXrplActionRisk: mockAssessXrplActionRisk,
}))
vi.mock('@/services/xrpl-swap.service', () => ({
  quoteXrplSwap: mockQuoteXrplSwap,
  buildSwapPaymentTx: mockBuildSwapPaymentTx,
}))

const account = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const requestBody = {
  network: 'testnet',
  account,
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
  sourceAmount: { currency: 'XRP', value: '10' },
  destinationAsset: { currency: 'EURC' },
  slippageBps: 50,
}

describe('app/api/xrpl/trade/swap/prepare route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockIsAllowedOrigin.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockResolvedValue({ ok: true, remaining: 10, resetAt: Date.now() + 60_000 })
    mockGetXrplClient.mockResolvedValue({})
    mockDoesXrplAccountExist.mockResolvedValue(true)
    mockAssessXrplActionRisk.mockResolvedValue({ decision: 'allow', score: 0, reasons: [] })
    mockQuoteXrplSwap.mockResolvedValue({
      sourceAmount: { currency: 'XRP', value: '10' },
      quotedSourceAmount: { currency: 'XRP', value: '10' },
      destinationAmount: { currency: 'EURC', issuer: account, value: '9.8' },
      deliverMin: { currency: 'EURC', issuer: account, value: '9.751' },
      paths: [],
      pathCount: 0,
      alternativeCount: 1,
      fullReply: true,
      slippageBps: 50,
    })
    mockBuildSwapPaymentTx.mockReturnValue({
      TransactionType: 'Payment',
      Account: account,
      Destination: account,
      Amount: { currency: 'EURC', issuer: account, value: '9.8' },
      SendMax: '10000000',
      DeliverMin: { currency: 'EURC', issuer: account, value: '9.751' },
      Flags: 393216,
    })
  })

  it('requires an authenticated session', async () => {
    mockRequireSession.mockResolvedValue(null)
    const { POST } = await import('@/app/api/xrpl/trade/swap/prepare/route')
    const response = await POST(new Request('http://localhost/api/xrpl/trade/swap/prepare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    }))

    expect(response.status).toBe(401)
  })

  it('returns an unsigned payment transaction for the customer wallet', async () => {
    const { POST } = await import('@/app/api/xrpl/trade/swap/prepare/route')
    const response = await POST(new Request('http://localhost/api/xrpl/trade/swap/prepare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      network: 'testnet',
      account,
      quote: { destinationAmount: { value: '9.8' }, deliverMin: { value: '9.751' } },
      transaction: { TransactionType: 'Payment', Account: account, Destination: account },
    })
    expect(mockQuoteXrplSwap).toHaveBeenCalledWith({
      networkId: 'testnet',
      account,
      sourceAmount: requestBody.sourceAmount,
      destinationAsset: requestBody.destinationAsset,
      slippageBps: 50,
    })
    expect(mockBuildSwapPaymentTx).toHaveBeenCalled()
  })

  it('does not prepare a payment for an inactive wallet', async () => {
    mockDoesXrplAccountExist.mockResolvedValue(false)
    const { POST } = await import('@/app/api/xrpl/trade/swap/prepare/route')
    const response = await POST(new Request('http://localhost/api/xrpl/trade/swap/prepare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    }))

    expect(response.status).toBe(400)
    expect(mockQuoteXrplSwap).not.toHaveBeenCalled()
    expect(mockBuildSwapPaymentTx).not.toHaveBeenCalled()
  })
})

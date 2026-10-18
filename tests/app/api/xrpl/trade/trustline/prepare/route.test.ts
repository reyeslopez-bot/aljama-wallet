import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockIsAllowedOrigin,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetTrustedIssuersForCurrency,
  mockGetXrplClient,
  mockDoesXrplAccountExist,
  mockAssessXrplActionRisk,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockIsAllowedOrigin: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetTrustedIssuersForCurrency: vi.fn(),
  mockGetXrplClient: vi.fn(),
  mockDoesXrplAccountExist: vi.fn(),
  mockAssessXrplActionRisk: vi.fn(),
}))

vi.mock('@/lib/security/session', () => ({ requireSession: mockRequireSession }))
vi.mock('@/lib/security/origin', () => ({ isAllowedOrigin: mockIsAllowedOrigin }))
vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
}))
vi.mock('@/lib/xrpl-trusted-issuers', () => ({
  getTrustedIssuersForCurrency: mockGetTrustedIssuersForCurrency,
}))
vi.mock('@/infra/xrpl/client', () => ({ getXrplClient: mockGetXrplClient }))
vi.mock('@/lib/xrpl/quote/accountExists', () => ({
  doesXrplAccountExist: mockDoesXrplAccountExist,
}))
vi.mock('@/services/xrpl-risk.service', () => ({
  assessXrplActionRisk: mockAssessXrplActionRisk,
}))

const account = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const issuer = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const body = {
  network: 'testnet',
  account,
  currency: 'EURC',
  limit: '100',
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
}

describe('app/api/xrpl/trade/trustline/prepare route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockIsAllowedOrigin.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockResolvedValue({ ok: true, remaining: 10, resetAt: Date.now() + 60_000 })
    mockGetTrustedIssuersForCurrency.mockReturnValue({ issuers: [issuer], source: 'policy' })
    mockGetXrplClient.mockResolvedValue({
      request: vi.fn().mockResolvedValue({ result: { lines: [] } }),
    })
    mockDoesXrplAccountExist.mockResolvedValue(true)
    mockAssessXrplActionRisk.mockResolvedValue({ decision: 'allow', score: 0, reasons: [] })
  })

  it('returns an unsigned trustline transaction for the customer wallet', async () => {
    const { POST } = await import('@/app/api/xrpl/trade/trustline/prepare/route')
    const response = await POST(new Request('http://localhost/api/xrpl/trade/trustline/prepare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).toMatchObject({
      ok: true,
      type: 'ready',
      network: 'testnet',
      account,
      issuer,
      currency: 'EURC',
      limit: '100',
      transaction: {
        TransactionType: 'TrustSet',
        Account: account,
        LimitAmount: { currency: 'EURC', issuer, value: '100' },
      },
    })
    expect(mockAssessXrplActionRisk).toHaveBeenCalledWith(
      expect.objectContaining({ walletId: account, destinationAddress: issuer, amountUnits: '100' }),
    )
  })

  it('requires an explicit issuer choice when multiple trusted issuers exist', async () => {
    const secondIssuer = 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv'
    mockGetTrustedIssuersForCurrency.mockReturnValue({
      issuers: [issuer, secondIssuer],
      source: 'policy',
    })
    const { POST } = await import('@/app/api/xrpl/trade/trustline/prepare/route')
    const response = await POST(new Request('http://localhost/api/xrpl/trade/trustline/prepare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }))

    expect(await response.json()).toMatchObject({
      ok: true,
      type: 'selection-required',
      issuers: [issuer, secondIssuer],
    })
    expect(mockGetXrplClient).not.toHaveBeenCalled()
  })

  it('rejects an issuer outside the trusted policy', async () => {
    const { POST } = await import('@/app/api/xrpl/trade/trustline/prepare/route')
    const response = await POST(new Request('http://localhost/api/xrpl/trade/trustline/prepare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, issuer: 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv' }),
    }))

    expect(response.status).toBe(403)
    expect(mockAssessXrplActionRisk).not.toHaveBeenCalled()
  })

  it('does not prepare a duplicate trustline', async () => {
    mockGetXrplClient.mockResolvedValue({
      request: vi.fn().mockResolvedValue({
        result: { lines: [{ account: issuer, currency: 'EURC', limit: '200', balance: '0' }] },
      }),
    })
    const { POST } = await import('@/app/api/xrpl/trade/trustline/prepare/route')
    const response = await POST(new Request('http://localhost/api/xrpl/trade/trustline/prepare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }))

    expect(await response.json()).toMatchObject({
      ok: true,
      type: 'already-exists',
      issuer,
      currency: 'EURC',
      currentLimit: '200',
    })
    expect(mockAssessXrplActionRisk).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockIsAllowedOrigin,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetXrplSignerAccount,
  mockCreateXrplAction,
  mockUpdateXrplAction,
  mockAssessXrplActionRisk,
  mockQuoteXrplSwap,
  mockBuildSwapPaymentTx,
  mockSubmitXrplTx,
  mockRecordXrplTransactionSubmission,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockIsAllowedOrigin: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetXrplSignerAccount: vi.fn(),
  mockCreateXrplAction: vi.fn(),
  mockUpdateXrplAction: vi.fn(),
  mockAssessXrplActionRisk: vi.fn(),
  mockQuoteXrplSwap: vi.fn(),
  mockBuildSwapPaymentTx: vi.fn(),
  mockSubmitXrplTx: vi.fn(),
  mockRecordXrplTransactionSubmission: vi.fn(),
}))

vi.mock('@/lib/security/session', () => ({ requireSession: mockRequireSession }))
vi.mock('@/lib/security/origin', () => ({ isAllowedOrigin: mockIsAllowedOrigin }))
vi.mock('@/lib/security/rate-limit', () => ({ buildRateLimitKey: mockBuildRateLimitKey, rateLimit: mockRateLimit }))
vi.mock('@/lib/xrpl-signer', () => ({ getXrplSignerAccount: mockGetXrplSignerAccount }))
vi.mock('@/services/xrpl-action-log.service', () => ({ createXrplAction: mockCreateXrplAction, updateXrplAction: mockUpdateXrplAction }))
vi.mock('@/services/xrpl-risk.service', () => ({ assessXrplActionRisk: mockAssessXrplActionRisk }))
vi.mock('@/services/xrpl-swap.service', () => ({ quoteXrplSwap: mockQuoteXrplSwap, buildSwapPaymentTx: mockBuildSwapPaymentTx }))
vi.mock('@/services/xrpl-tx-submit.service', () => ({ submitXrplTx: mockSubmitXrplTx }))
vi.mock('@/services/xrpl-transaction-store.service', () => ({ recordXrplTransactionSubmission: mockRecordXrplTransactionSubmission }))

describe('app/api/xrpl/trade/swap route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockIsAllowedOrigin.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 10, resetAt: Date.now() + 60_000 })
    const address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
    mockGetXrplSignerAccount.mockReturnValue({
      id: 'xrpl-env',
      accountRef: 'XRPL:ed25519:pubkey',
      chain: 'XRPL',
      address,
      pubKey: 'EDPUBKEY',
      keyType: 'ed25519',
      signerBackend: 'local',
      vaultId: 'public',
      derivationPath: null,
      policy: { requiresSecondFactor: false, requiresPQAttestation: false },
      pqcBinding: null,
      createdAt: new Date(0),
    })
    mockCreateXrplAction.mockResolvedValue({ id: 'act-1', details: {} })
    mockUpdateXrplAction.mockResolvedValue({})
    mockAssessXrplActionRisk.mockResolvedValue({ decision: 'allow', score: 0, reasons: [] })
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
    mockBuildSwapPaymentTx.mockReturnValue({
      TransactionType: 'Payment',
      Destination: address,
      Amount: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '45.5' },
      SendMax: '50000000',
      DeliverMin: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', value: '45.2725' },
      Flags: 393216,
    })
    mockSubmitXrplTx.mockResolvedValue({ txHash: 'ABC', engineResult: 'tesSUCCESS', validated: true, ledgerIndex: 1, sequence: 1 })
    mockRecordXrplTransactionSubmission.mockResolvedValue({})
  })

  it('returns 401 when session missing', async () => {
    mockRequireSession.mockResolvedValue(null)
    const { POST } = await import('@/app/api/xrpl/trade/swap/route')
    const res = await POST(new Request('http://localhost/api/xrpl/trade/swap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }))
    expect(res.status).toBe(401)
  })

  it('submits a payment-based XRPL swap', async () => {
    const { POST } = await import('@/app/api/xrpl/trade/swap/route')
    const res = await POST(new Request('http://localhost/api/xrpl/trade/swap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        sourceAmount: { currency: 'XRP', value: '50' },
        destinationAsset: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' },
        slippageBps: 50,
      }),
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockQuoteXrplSwap).toHaveBeenCalled()
    expect(mockBuildSwapPaymentTx).toHaveBeenCalled()
    expect(mockSubmitXrplTx).toHaveBeenCalled()
    expect(mockRecordXrplTransactionSubmission).toHaveBeenCalled()
  })

  it('returns 400 when the signer account is not funded on the selected network', async () => {
    mockQuoteXrplSwap.mockRejectedValue({
      name: 'RippledError',
      message: 'Account not found.',
      data: { error: 'actNotFound', error_message: 'Account not found.' },
    })

    const { POST } = await import('@/app/api/xrpl/trade/swap/route')
    const res = await POST(new Request('http://localhost/api/xrpl/trade/swap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        network: 'mainnet',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        sourceAmount: { currency: 'XRP', value: '50' },
        destinationAsset: { currency: 'USD', issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' },
        slippageBps: 50,
      }),
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('account_not_funded')
    expect(body.error).toMatch(/mainnet/i)
    expect(body.details).toMatchObject({
      account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      network: 'mainnet',
      sourceCurrency: 'XRP',
      destinationCurrency: 'USD',
      needsFunding: true,
    })
    expect(mockSubmitXrplTx).not.toHaveBeenCalled()
  })
})

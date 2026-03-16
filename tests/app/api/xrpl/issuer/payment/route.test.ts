import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockIsAllowedOrigin,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockResolveConfiguredXrplAccount,
  mockGetConfiguredXrplAccountRef,
  mockCreateXrplAction,
  mockUpdateXrplAction,
  mockAssessXrplActionRisk,
  mockSubmitXrplTx,
  mockRecordXrplTransactionSubmission,
  mockRequireXrplIssuerHolderEligibility,
  mockCreateXrplIssuerDistribution,
  mockUpdateXrplIssuerDistribution,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockIsAllowedOrigin: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockResolveConfiguredXrplAccount: vi.fn(),
  mockGetConfiguredXrplAccountRef: vi.fn(),
  mockCreateXrplAction: vi.fn(),
  mockUpdateXrplAction: vi.fn(),
  mockAssessXrplActionRisk: vi.fn(),
  mockSubmitXrplTx: vi.fn(),
  mockRecordXrplTransactionSubmission: vi.fn(),
  mockRequireXrplIssuerHolderEligibility: vi.fn(),
  mockCreateXrplIssuerDistribution: vi.fn(),
  mockUpdateXrplIssuerDistribution: vi.fn(),
}))

vi.mock('@/lib/security/session', () => ({ requireSession: mockRequireSession }))
vi.mock('@/lib/security/origin', () => ({ isAllowedOrigin: mockIsAllowedOrigin }))
vi.mock('@/lib/security/rate-limit', () => ({ buildRateLimitKey: mockBuildRateLimitKey, rateLimit: mockRateLimit }))
vi.mock('@/services/xrpl-runtime-signer.service', () => ({
  resolveConfiguredXrplAccount: mockResolveConfiguredXrplAccount,
  getConfiguredXrplAccountRef: mockGetConfiguredXrplAccountRef,
}))
vi.mock('@/services/xrpl-action-log.service', () => ({ createXrplAction: mockCreateXrplAction, updateXrplAction: mockUpdateXrplAction }))
vi.mock('@/services/xrpl-risk.service', () => ({ assessXrplActionRisk: mockAssessXrplActionRisk }))
vi.mock('@/services/xrpl-tx-submit.service', () => ({ submitXrplTx: mockSubmitXrplTx }))
vi.mock('@/services/xrpl-transaction-store.service', () => ({ recordXrplTransactionSubmission: mockRecordXrplTransactionSubmission }))
vi.mock('@/services/xrpl-issuer-policy.service', () => ({
  requireXrplIssuerHolderEligibility: mockRequireXrplIssuerHolderEligibility,
  createXrplIssuerDistribution: mockCreateXrplIssuerDistribution,
  updateXrplIssuerDistribution: mockUpdateXrplIssuerDistribution,
}))
vi.mock('@/lib/xrpl-amount', () => ({
  toXrplAmount: vi.fn((value) => value),
  normalizeCurrency: vi.fn((value: string) => value.trim().toUpperCase()),
}))

describe('app/api/xrpl/issuer/payment route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveConfiguredXrplAccount.mockReset()
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockIsAllowedOrigin.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 10, resetAt: Date.now() + 60_000 })
    const distributorAddress = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
    const issuerAddress = 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv'
    mockResolveConfiguredXrplAccount
      .mockResolvedValueOnce({
      id: 'xrpl-env-distributor',
      accountRef: 'XRPL:ed25519:pubkey',
      chain: 'XRPL',
      address: distributorAddress,
      pubKey: 'EDPUBKEY',
      keyType: 'ed25519',
      signerBackend: 'local',
      vaultId: 'public',
      derivationPath: null,
      policy: { requiresSecondFactor: false, requiresPQAttestation: false },
      pqcBinding: null,
      createdAt: new Date(0),
    })
      .mockResolvedValueOnce({
      id: 'xrpl-env-issuer',
      accountRef: 'XRPL:ed25519:issuer',
      chain: 'XRPL',
      address: issuerAddress,
      pubKey: 'EDISSUER',
      keyType: 'ed25519',
      signerBackend: 'local',
      vaultId: 'public',
      derivationPath: null,
      policy: { requiresSecondFactor: false, requiresPQAttestation: false },
      pqcBinding: null,
      createdAt: new Date(0),
    })
    mockGetConfiguredXrplAccountRef.mockImplementation((role: string) => ({ kind: 'xrpl-env', role }))
    mockCreateXrplAction.mockResolvedValue({ id: 'act-1', details: {} })
    mockUpdateXrplAction.mockResolvedValue({})
    mockAssessXrplActionRisk.mockResolvedValue({ decision: 'allow', score: 0, reasons: [] })
    mockSubmitXrplTx.mockResolvedValue({
      txHash: 'ABC',
      engineResult: 'tesSUCCESS',
      validated: true,
      ledgerIndex: 1,
      sequence: 1,
    })
    mockRecordXrplTransactionSubmission.mockResolvedValue({})
    mockRequireXrplIssuerHolderEligibility.mockResolvedValue({})
    mockCreateXrplIssuerDistribution.mockResolvedValue({
      distribution: { id: 'dist-1' },
    })
    mockUpdateXrplIssuerDistribution.mockResolvedValue({})
  })

  // XRP is not an issued token, so a distribution route should reject it before
  // any policy or transaction work begins.
  it('rejects XRP as an issuer distribution currency', async () => {
    const { POST } = await import('@/app/api/xrpl/issuer/payment/route')
    const res = await POST(
      new Request('http://localhost/api/xrpl/issuer/payment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
          destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
          currency: 'XRP',
          value: '100',
        }),
      }),
    )

    expect(res.status).toBe(400)
    expect(mockSubmitXrplTx).not.toHaveBeenCalled()
  })

  // The payment path now has to satisfy both policy and audit requirements:
  // validate holder eligibility, create a distribution record, then update it
  // with the tx result after submit.
  it('submits an issued-asset payment from the distributor account and defaults the amount issuer to the issuer account', async () => {
    const { POST } = await import('@/app/api/xrpl/issuer/payment/route')
    const res = await POST(
      new Request('http://localhost/api/xrpl/issuer/payment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
          destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
          currency: 'RWAUSD',
          value: '100',
        }),
      }),
    )

    expect(res.status).toBe(200)
    expect(mockSubmitXrplTx).toHaveBeenCalledWith(
      expect.objectContaining({
        accountRef: { kind: 'xrpl-env', role: 'distributor' },
        tx: expect.objectContaining({
          TransactionType: 'Payment',
          Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
          Amount: {
            currency: 'RWAUSD',
            issuer: 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv',
            value: '100',
          },
        }),
      }),
    )
    expect(mockRecordXrplTransactionSubmission).toHaveBeenCalled()
    expect(mockRequireXrplIssuerHolderEligibility).toHaveBeenCalledWith({
      networkId: 'testnet',
      issuerAccount: 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv',
      currency: 'RWAUSD',
      holderAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      action: 'distribute',
      amount: '100',
    })
    expect(mockCreateXrplIssuerDistribution).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: 'act-1',
        issuerAccount: 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv',
        currency: 'RWAUSD',
        destinationAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      }),
    )
    expect(mockUpdateXrplIssuerDistribution).toHaveBeenCalledWith(
      expect.objectContaining({
        distributionId: 'dist-1',
        status: 'validated',
        txHash: 'ABC',
      }),
    )
  })

  // RequireAuth-style programs must not distribute before a holder has been
  // explicitly authorized; this is the policy regression that matters most.
  it('rejects distributions to holders without an authorized trustline', async () => {
    mockRequireXrplIssuerHolderEligibility.mockRejectedValue(
      new Error('Holder trustline is not authorized for this asset'),
    )

    const { POST } = await import('@/app/api/xrpl/issuer/payment/route')
    const res = await POST(
      new Request('http://localhost/api/xrpl/issuer/payment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
          destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
          currency: 'RWAUSD',
          value: '100',
        }),
      }),
    )

    expect(res.status).toBe(403)
    expect(mockCreateXrplAction).not.toHaveBeenCalled()
    expect(mockCreateXrplIssuerDistribution).not.toHaveBeenCalled()
    expect(mockSubmitXrplTx).not.toHaveBeenCalled()
  })
})

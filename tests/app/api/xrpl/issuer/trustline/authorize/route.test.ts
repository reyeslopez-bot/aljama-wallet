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
  mockMarkXrplIssuerHolderAuthorized,
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
  mockMarkXrplIssuerHolderAuthorized: vi.fn(),
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
  markXrplIssuerHolderAuthorized: mockMarkXrplIssuerHolderAuthorized,
}))

describe('app/api/xrpl/issuer/trustline/authorize route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSession.mockResolvedValue({ user: { id: 'user-1' } })
    mockIsAllowedOrigin.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 10, resetAt: Date.now() + 60_000 })
    const address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
    mockResolveConfiguredXrplAccount.mockResolvedValue({
      id: 'xrpl-env-issuer',
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
    mockGetConfiguredXrplAccountRef.mockReturnValue({ kind: 'xrpl-env', role: 'issuer' })
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
    mockRequireXrplIssuerHolderEligibility.mockResolvedValue({
      asset: { id: 'asset-1' },
    })
    mockMarkXrplIssuerHolderAuthorized.mockResolvedValue({})
  })

  // XRP is the native currency, so it must never be treated like an issuer-
  // controlled token that can be authorized with TrustSet.
  it('rejects XRP as an authorization currency', async () => {
    const { POST } = await import('@/app/api/xrpl/issuer/trustline/authorize/route')
    const res = await POST(
      new Request('http://localhost/api/xrpl/issuer/trustline/authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
          holder: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
          currency: 'XRP',
        }),
      }),
    )

    expect(res.status).toBe(400)
    expect(mockSubmitXrplTx).not.toHaveBeenCalled()
  })

  // The happy path now has two side effects: enforce local approval policy
  // before submit, then mark the holder as authorized after a successful tx.
  it('submits a TrustSet authorization transaction', async () => {
    const { POST } = await import('@/app/api/xrpl/issuer/trustline/authorize/route')
    const res = await POST(
      new Request('http://localhost/api/xrpl/issuer/trustline/authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
          holder: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
          currency: 'RWAUSD',
        }),
      }),
    )

    expect(res.status).toBe(200)
    expect(mockSubmitXrplTx).toHaveBeenCalledWith(
      expect.objectContaining({
        accountRef: { kind: 'xrpl-env', role: 'issuer' },
        tx: expect.objectContaining({
          TransactionType: 'TrustSet',
          LimitAmount: {
            currency: 'RWAUSD',
            issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
            value: '0',
          },
          Flags: 65536,
        }),
      }),
    )
    expect(mockRecordXrplTransactionSubmission).toHaveBeenCalled()
    expect(mockRequireXrplIssuerHolderEligibility).toHaveBeenCalledWith({
      networkId: 'testnet',
      issuerAccount: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      currency: 'RWAUSD',
      holderAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      action: 'authorize',
    })
    expect(mockMarkXrplIssuerHolderAuthorized).toHaveBeenCalledWith({
      assetId: 'asset-1',
      holderAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
    })
  })

  // This is the policy gate we actually wanted: a wallet cannot be authorized
  // on-ledger until the app has an approval record for that asset.
  it('rejects holders that have not been approved for the asset', async () => {
    mockRequireXrplIssuerHolderEligibility.mockRejectedValue(new Error('Holder is not approved for this asset'))

    const { POST } = await import('@/app/api/xrpl/issuer/trustline/authorize/route')
    const res = await POST(
      new Request('http://localhost/api/xrpl/issuer/trustline/authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
          holder: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
          currency: 'RWAUSD',
        }),
      }),
    )

    expect(res.status).toBe(403)
    expect(mockCreateXrplAction).not.toHaveBeenCalled()
    expect(mockSubmitXrplTx).not.toHaveBeenCalled()
  })
})

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
  mockSubmitXrplTx: vi.fn(),
  mockRecordXrplTransactionSubmission: vi.fn(),
}))

vi.mock('@/lib/security/session', () => ({ requireSession: mockRequireSession }))
vi.mock('@/lib/security/origin', () => ({ isAllowedOrigin: mockIsAllowedOrigin }))
vi.mock('@/lib/security/rate-limit', () => ({ buildRateLimitKey: mockBuildRateLimitKey, rateLimit: mockRateLimit }))
vi.mock('@/lib/xrpl-signer', () => ({ getXrplSignerAccount: mockGetXrplSignerAccount }))
vi.mock('@/services/xrpl-action-log.service', () => ({ createXrplAction: mockCreateXrplAction, updateXrplAction: mockUpdateXrplAction }))
vi.mock('@/services/xrpl-risk.service', () => ({ assessXrplActionRisk: mockAssessXrplActionRisk }))
vi.mock('@/services/xrpl-tx-submit.service', () => ({ submitXrplTx: mockSubmitXrplTx }))
vi.mock('@/services/xrpl-transaction-store.service', () => ({ recordXrplTransactionSubmission: mockRecordXrplTransactionSubmission }))

describe('app/api/xrpl/issuer/account-set route', () => {
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
    mockSubmitXrplTx.mockResolvedValue({
      txHash: 'ABC',
      engineResult: 'tesSUCCESS',
      validated: true,
      ledgerIndex: 1,
      sequence: 1,
    })
    mockRecordXrplTransactionSubmission.mockResolvedValue({})
  })

  it('requires at least one account setting', async () => {
    const { POST } = await import('@/app/api/xrpl/issuer/account-set/route')
    const res = await POST(
      new Request('http://localhost/api/xrpl/issuer/account-set', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
        }),
      }),
    )

    expect(res.status).toBe(400)
    expect(mockSubmitXrplTx).not.toHaveBeenCalled()
  })

  it('submits an AccountSet transaction with issuer settings', async () => {
    const { POST } = await import('@/app/api/xrpl/issuer/account-set/route')
    const res = await POST(
      new Request('http://localhost/api/xrpl/issuer/account-set', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
          domain: 'issuer.example.com',
          transferFeeBps: 50,
          tickSize: 10,
          setFlag: 'default_ripple',
        }),
      }),
    )

    expect(res.status).toBe(200)
    expect(mockSubmitXrplTx).toHaveBeenCalledWith(
      expect.objectContaining({
        tx: expect.objectContaining({
          TransactionType: 'AccountSet',
          Domain: '6973737565722E6578616D706C652E636F6D',
          TransferRate: 1005000000,
          TickSize: 10,
          SetFlag: 8,
        }),
      }),
    )
    expect(mockRecordXrplTransactionSubmission).toHaveBeenCalled()
  })
})

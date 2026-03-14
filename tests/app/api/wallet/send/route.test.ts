import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockApproveTransfer,
  mockBuildUnsignedEvmTx,
  mockGetWalletSigningAccount,
  mockGetSpentTodayWei,
  mockGetWalletDailyLimitWei,
  mockEvaluateStoredWalletPolicies,
  mockRecordPolicyEvents,
  mockRequireSession,
  mockIsAdminEmail,
  mockIsAllowedOrigin,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetClientIp,
  mockReserveIdempotencyKey,
  mockUserOwnsWallet,
  mockAssessTransferRisk,
  mockRecordTransferAttempt,
  mockUpdateTransferStatus,
  mockLogError,
  mockProviderCtor,
  mockProviderGetNetwork,
  mockProviderGetTransactionCount,
  mockProviderGetFeeData,
  mockProviderEstimateGas,
  mockGetAddress,
  mockCreateWalletSigningIntent,
  mockBuildEvmTransactionSigningIntentPayload,
} = vi.hoisted(() => ({
  mockApproveTransfer: vi.fn(),
  mockBuildUnsignedEvmTx: vi.fn(),
  mockGetWalletSigningAccount: vi.fn(),
  mockGetSpentTodayWei: vi.fn(),
  mockGetWalletDailyLimitWei: vi.fn(),
  mockEvaluateStoredWalletPolicies: vi.fn(),
  mockRecordPolicyEvents: vi.fn(),
  mockRequireSession: vi.fn(),
  mockIsAdminEmail: vi.fn(),
  mockIsAllowedOrigin: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetClientIp: vi.fn(),
  mockReserveIdempotencyKey: vi.fn(),
  mockUserOwnsWallet: vi.fn(),
  mockAssessTransferRisk: vi.fn(),
  mockRecordTransferAttempt: vi.fn(),
  mockUpdateTransferStatus: vi.fn(),
  mockLogError: vi.fn(),
  mockProviderCtor: vi.fn(),
  mockProviderGetNetwork: vi.fn(),
  mockProviderGetTransactionCount: vi.fn(),
  mockProviderGetFeeData: vi.fn(),
  mockProviderEstimateGas: vi.fn(),
  mockGetAddress: vi.fn(),
  mockCreateWalletSigningIntent: vi.fn(),
  mockBuildEvmTransactionSigningIntentPayload: vi.fn(),
}))

vi.mock('@/infra/agentic/wallet-policy', () => ({
  approveTransfer: mockApproveTransfer,
}))

vi.mock('@/services/wallet.service', () => ({
  getWalletSigningAccount: mockGetWalletSigningAccount,
  getSpentTodayWei: mockGetSpentTodayWei,
}))

vi.mock('@/services/policy.service', () => ({
  getWalletDailyLimitWei: mockGetWalletDailyLimitWei,
  evaluateStoredWalletPolicies: mockEvaluateStoredWalletPolicies,
  recordPolicyEvents: mockRecordPolicyEvents,
}))

vi.mock('@/services/evm-tx.service', () => ({
  buildUnsignedEvmTx: mockBuildUnsignedEvmTx,
}))

vi.mock('@/lib/security/session', () => ({
  requireSession: mockRequireSession,
  isAdminEmail: mockIsAdminEmail,
}))

vi.mock('@/lib/security/origin', () => ({
  isAllowedOrigin: mockIsAllowedOrigin,
}))

vi.mock('@/lib/security/rate-limit', () => ({
  buildRateLimitKey: mockBuildRateLimitKey,
  rateLimit: mockRateLimit,
  getClientIp: mockGetClientIp,
}))

vi.mock('@/services/idempotency.service', () => ({
  reserveIdempotencyKey: mockReserveIdempotencyKey,
}))

vi.mock('@/services/wallet-ownership.service', () => ({
  userOwnsWallet: mockUserOwnsWallet,
}))

vi.mock('@/lib/security/runtime', () => ({
  isStrictMode: false,
}))

vi.mock('@/services/transfer-risk.service', () => ({
  assessTransferRisk: mockAssessTransferRisk,
}))

vi.mock('@/services/transfer-log.service', () => ({
  recordTransferAttempt: mockRecordTransferAttempt,
  updateTransferStatus: mockUpdateTransferStatus,
}))

vi.mock('@/services/signing-intent.service', () => ({
  createWalletSigningIntent: mockCreateWalletSigningIntent,
  buildEvmTransactionSigningIntentPayload: mockBuildEvmTransactionSigningIntentPayload,
}))

vi.mock('@/lib/security/logging', () => ({
  logError: mockLogError,
}))

vi.mock('ethers', () => {
  class JsonRpcProvider {
    constructor(url: string) {
      mockProviderCtor(url)
    }

    getNetwork = mockProviderGetNetwork
    getTransactionCount = mockProviderGetTransactionCount
    getFeeData = mockProviderGetFeeData
    estimateGas = mockProviderEstimateGas
  }

  return {
    getAddress: mockGetAddress,
    JsonRpcProvider,
  }
})

function buildRequest(overrides: Partial<Record<string, unknown>> = {}) {
  const body = {
    walletId: 'wallet-1',
    to: '0x000000000000000000000000000000000000dEaD',
    amountWei: '1000000000000000',
    chainId: 8453,
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    ...overrides,
  }

  return new Request('http://localhost/api/wallet/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('app/api/wallet/send route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('EVM_RPC_URL', 'https://rpc.example')
    vi.stubEnv('WALLET_ALLOWED_CHAIN_IDS', '1,8453')

    mockRequireSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
    })
    mockIsAdminEmail.mockReturnValue(false)
    mockIsAllowedOrigin.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 9, resetAt: Date.now() + 60_000 })
    mockGetClientIp.mockReturnValue('127.0.0.1')
    mockUserOwnsWallet.mockResolvedValue(true)

    mockProviderGetNetwork.mockResolvedValue({ chainId: 8453n })
    mockProviderGetTransactionCount.mockResolvedValue(7)
    mockProviderGetFeeData.mockResolvedValue({
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
      gasPrice: 2n,
    })
    mockProviderEstimateGas.mockResolvedValue(21_000n)
    mockGetAddress.mockImplementation((value: string) => value.toLowerCase())

    mockGetWalletSigningAccount.mockResolvedValue({
      address: '0x000000000000000000000000000000000000beef',
      chain: 'EVM',
      accountRef: 'EVM:secp256k1:pubkey',
      pubKey: '0xpubkey',
      keyType: 'secp256k1',
      signerBackend: 'local',
      vaultId: 'public',
      derivationPath: "m/44'/60'/0'/0/0",
      policy: { requiresSecondFactor: false, requiresPQAttestation: false },
      pqcBinding: null,
      id: 'wallet-1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
    mockBuildUnsignedEvmTx.mockResolvedValue({
      to: '0x000000000000000000000000000000000000dead',
      nonce: 7,
      gasLimit: 21_000n,
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
    })
    mockGetSpentTodayWei.mockResolvedValue(0n)
    mockAssessTransferRisk.mockResolvedValue({
      score: 0,
      decision: 'allow',
      reasons: [],
      features: {},
    })
    mockApproveTransfer.mockImplementation((intent: any) => ({
      type: 'Transfer',
      fromWalletId: intent.fromWalletId,
      chainId: intent.chainId,
      to: intent.to,
      amountWei: intent.amountWei,
      maxFeePerGasWei: intent.maxFeePerGasWei,
      nonce: intent.nonce,
      idempotencyKey: intent.idempotencyKey,
      correlationId: intent.correlationId,
    }))
    mockReserveIdempotencyKey.mockResolvedValue(undefined)
    mockRecordTransferAttempt.mockResolvedValue({ id: 'log-1' })
    mockUpdateTransferStatus.mockResolvedValue(undefined)
    mockGetWalletDailyLimitWei.mockResolvedValue(1000000000000000000n)
    mockEvaluateStoredWalletPolicies.mockResolvedValue({
      decision: 'allow',
      reasons: [],
      triggeredPolicies: [],
    })
    mockRecordPolicyEvents.mockResolvedValue(undefined)
    mockBuildEvmTransactionSigningIntentPayload.mockImplementation((input: Record<string, unknown>) => input)
    mockCreateWalletSigningIntent.mockResolvedValue({
      id: 'intent-1',
      status: 'queued',
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 401 when the user session is missing', async () => {
    mockRequireSession.mockResolvedValue(null)
    const { POST } = await import('@/app/api/wallet/send/route')

    const res = await POST(buildRequest())
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.code).toBe('unauthorized')
    expect(res.headers.get('x-request-id')).toBeTruthy()
    expect(mockIsAllowedOrigin).not.toHaveBeenCalled()
  })

  it('returns 403 when origin validation fails', async () => {
    mockIsAllowedOrigin.mockReturnValue(false)
    const { POST } = await import('@/app/api/wallet/send/route')

    const res = await POST(buildRequest())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe('invalid_origin')
  })

  it('returns 429 when rate limit is exceeded', async () => {
    mockRateLimit.mockReturnValue({ ok: false, retryAfter: 42, resetAt: Date.now() + 42_000 })
    const { POST } = await import('@/app/api/wallet/send/route')

    const res = await POST(buildRequest())
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.code).toBe('rate_limited')
    expect(res.headers.get('retry-after')).toBe('42')
  })

  it('returns 403 when a non-admin does not own the wallet', async () => {
    mockUserOwnsWallet.mockResolvedValue(false)
    const { POST } = await import('@/app/api/wallet/send/route')

    const res = await POST(buildRequest())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe('forbidden')
  })

  it('returns chain_denied when requested chain is outside allowlist', async () => {
    vi.stubEnv('WALLET_ALLOWED_CHAIN_IDS', '1')
    const { POST } = await import('@/app/api/wallet/send/route')

    const res = await POST(buildRequest({ chainId: 8453 }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('chain_denied')
    expect(mockProviderGetNetwork).not.toHaveBeenCalled()
  })

  it('returns chain_mismatch when RPC chain differs from request chain', async () => {
    vi.stubEnv('WALLET_ALLOWED_CHAIN_IDS', '8453')
    mockProviderGetNetwork.mockResolvedValue({ chainId: 1n })
    const { POST } = await import('@/app/api/wallet/send/route')

    const res = await POST(buildRequest({ chainId: 8453 }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('chain_mismatch')
  })

  it('returns 409 for idempotency replay attempts', async () => {
    mockReserveIdempotencyKey.mockRejectedValue(new Error('IDEMPOTENCY_REPLAY'))
    const { POST } = await import('@/app/api/wallet/send/route')

    const res = await POST(buildRequest())
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe('idempotency_replay')
  })

  it('queues a signing intent instead of signing in-request', async () => {
    const { POST } = await import('@/app/api/wallet/send/route')

    const res = await POST(buildRequest())
    const body = await res.json()

    expect(res.status).toBe(202)
    expect(body).toMatchObject({
      ok: true,
      intentId: 'intent-1',
      status: 'queued',
      walletId: 'wallet-1',
      to: '0x000000000000000000000000000000000000dead',
      amountWei: '1000000000000000',
      chainId: 8453,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      transferLogId: 'log-1',
    })
    expect(mockBuildEvmTransactionSigningIntentPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: 'wallet-1',
        chainId: 8453,
        fromAddress: '0x000000000000000000000000000000000000beef',
        toAddress: '0x000000000000000000000000000000000000dead',
        amountWei: '1000000000000000',
        txType: 'transfer',
        transferLogId: 'log-1',
      }),
    )
    expect(mockCreateWalletSigningIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: 'wallet-1',
        userId: 'user-1',
        chainId: 8453,
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        transferLogId: 'log-1',
      }),
    )
    expect(mockUpdateTransferStatus).toHaveBeenCalledWith('log-1', 'pending_broadcast', {
      nonce: '7',
      txType: 'transfer',
      data: null,
      gasLimit: '21000',
      gasPrice: null,
      maxFeePerGas: '2',
      maxPriorityFeePerGas: '1',
    })
  })
})

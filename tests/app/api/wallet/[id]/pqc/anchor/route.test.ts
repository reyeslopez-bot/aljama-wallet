import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequireSession,
  mockIsAdminEmail,
  mockIsAllowedOrigin,
  mockBuildRateLimitKey,
  mockRateLimit,
  mockGetWalletSigningAccount,
  mockSetWalletPqcBindingHash,
  mockUserOwnsWallet,
  mockReserveIdempotencyKey,
  mockBuildUnsignedEvmContractTx,
  mockSignUnsignedEvmTx,
  mockDeriveSignedEvmTxHash,
  mockSubmitSignedEvmTx,
  mockCreateWalletPqcAnchorRecord,
  mockProviderCtor,
  mockProviderGetNetwork,
  mockGetAddress,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockIsAdminEmail: vi.fn(),
  mockIsAllowedOrigin: vi.fn(),
  mockBuildRateLimitKey: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetWalletSigningAccount: vi.fn(),
  mockSetWalletPqcBindingHash: vi.fn(),
  mockUserOwnsWallet: vi.fn(),
  mockReserveIdempotencyKey: vi.fn(),
  mockBuildUnsignedEvmContractTx: vi.fn(),
  mockSignUnsignedEvmTx: vi.fn(),
  mockDeriveSignedEvmTxHash: vi.fn(),
  mockSubmitSignedEvmTx: vi.fn(),
  mockCreateWalletPqcAnchorRecord: vi.fn(),
  mockProviderCtor: vi.fn(),
  mockProviderGetNetwork: vi.fn(),
  mockGetAddress: vi.fn(),
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
}))

vi.mock('@/services/wallet.service', () => ({
  getWalletSigningAccount: mockGetWalletSigningAccount,
  setWalletPqcBindingHash: mockSetWalletPqcBindingHash,
}))

vi.mock('@/services/wallet-ownership.service', () => ({
  userOwnsWallet: mockUserOwnsWallet,
}))

vi.mock('@/services/idempotency.service', () => ({
  reserveIdempotencyKey: mockReserveIdempotencyKey,
}))

vi.mock('@/services/evm-tx.service', () => ({
  buildUnsignedEvmContractTx: mockBuildUnsignedEvmContractTx,
  signUnsignedEvmTx: mockSignUnsignedEvmTx,
  deriveSignedEvmTxHash: mockDeriveSignedEvmTxHash,
  submitSignedEvmTx: mockSubmitSignedEvmTx,
}))

vi.mock('@/services/wallet-pqc-anchor.service', () => ({
  createWalletPqcAnchorRecord: mockCreateWalletPqcAnchorRecord,
}))

vi.mock('@/lib/security/runtime', () => ({
  isStrictMode: false,
}))

vi.mock('ethers', async () => {
  const actual = await vi.importActual<typeof import('ethers')>('ethers')

  class JsonRpcProvider {
    constructor(url: string) {
      mockProviderCtor(url)
    }

    getNetwork = mockProviderGetNetwork
  }

  return {
    ...actual,
    JsonRpcProvider,
    getAddress: mockGetAddress,
  }
})

function buildContext(id: string) {
  return {
    params: Promise.resolve({ id }),
  }
}

function buildRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/wallet/wallet-1/pqc/anchor', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('app/api/wallet/[id]/pqc/anchor route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    vi.stubEnv('EVM_RPC_URL', 'https://rpc.example')
    vi.stubEnv(
      'WALLET_PQC_REGISTRY_ADDRESSES',
      '8453:0x000000000000000000000000000000000000bEEF',
    )
    vi.stubEnv('PQC_BINDING_PUBLIC_BASE_URL', 'https://app.example.com')

    mockRequireSession.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
    })
    mockIsAdminEmail.mockReturnValue(false)
    mockIsAllowedOrigin.mockReturnValue(true)
    mockBuildRateLimitKey.mockReturnValue('user:user-1')
    mockRateLimit.mockReturnValue({ ok: true, remaining: 9, resetAt: Date.now() + 60_000 })
    mockUserOwnsWallet.mockResolvedValue(true)
    mockReserveIdempotencyKey.mockResolvedValue(undefined)
    mockProviderGetNetwork.mockResolvedValue({ chainId: 8453n })
    mockGetAddress.mockImplementation((value: string) => value.toLowerCase())
    mockBuildUnsignedEvmContractTx.mockResolvedValue({ nonce: 7 })
    mockSignUnsignedEvmTx.mockResolvedValue('0xsigned')
    mockDeriveSignedEvmTxHash.mockReturnValue('0xderived')
    mockSubmitSignedEvmTx.mockResolvedValue('0xtxhash')
    mockCreateWalletPqcAnchorRecord.mockResolvedValue({ id: 'anchor-1' })
    mockSetWalletPqcBindingHash.mockResolvedValue({ id: 'wallet-1', pqcBindingHash: '0xhash' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 403 when a non-admin does not own the wallet', async () => {
    mockUserOwnsWallet.mockResolvedValue(false)
    const { POST } = await import('@/app/api/wallet/[id]/pqc/anchor/route')

    const res = await POST(
      buildRequest({
        chainId: 8453,
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
      }),
      buildContext('wallet-1'),
    )
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe('forbidden')
  })

  it('returns 409 when the wallet has no PQ binding', async () => {
    mockGetWalletSigningAccount.mockResolvedValue({
      id: 'wallet-1',
      accountRef: 'EVM:secp256k1:0xabc',
      chain: 'EVM',
      address: '0x000000000000000000000000000000000000beef',
      pubKey: '0x04abcd',
      keyType: 'secp256k1',
      signerBackend: 'local',
      vaultId: 'public',
      derivationPath: "m/44'/60'/0'/0/0",
      policy: { requiresSecondFactor: false, requiresPQAttestation: false },
      pqcBinding: null,
      pqcBindingHash: null,
      createdAt: new Date('2026-03-03T00:00:00Z'),
    })
    const { POST } = await import('@/app/api/wallet/[id]/pqc/anchor/route')

    const res = await POST(
      buildRequest({
        chainId: 8453,
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
      }),
      buildContext('wallet-1'),
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe('pqc_binding_missing')
  })

  it('returns 400 when the target chain has no configured registry', async () => {
    vi.stubEnv('WALLET_PQC_REGISTRY_ADDRESSES', '')
    mockGetWalletSigningAccount.mockResolvedValue({
      id: 'wallet-1',
      accountRef: 'EVM:secp256k1:0xabc',
      chain: 'EVM',
      address: '0x000000000000000000000000000000000000beef',
      pubKey: '0x04abcd',
      keyType: 'secp256k1',
      signerBackend: 'local',
      vaultId: 'public',
      derivationPath: "m/44'/60'/0'/0/0",
      policy: { requiresSecondFactor: false, requiresPQAttestation: false },
      pqcBinding: {
        version: 1,
        role: 'vault-identity',
        scheme: 'ml-dsa-65',
        provider: 'noble',
        publicKey: 'cHVibGljLWtleQ==',
        publicKeyFormat: 'raw-base64',
        subject: {
          accountRef: 'EVM:secp256k1:0xabc',
          chain: 'EVM',
          address: '0xabc',
          keyType: 'secp256k1',
          scheme: 'ecdsa',
          publicKey: '0x04abcd',
          publicKeyFormat: 'hex',
        },
        challenge: {
          type: 'classical-key-binding',
          statement: '{"version":1}',
          statementFormat: 'utf8-json',
        },
        proof: {
          signature: 'c2ln',
          signatureFormat: 'raw-base64',
          attestedAt: '2026-03-03T00:00:00.000Z',
        },
      },
      pqcBindingHash: null,
      createdAt: new Date('2026-03-03T00:00:00Z'),
    })
    const { POST } = await import('@/app/api/wallet/[id]/pqc/anchor/route')

    const res = await POST(
      buildRequest({
        chainId: 8453,
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
      }),
      buildContext('wallet-1'),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('registry_not_configured')
  })

  it('encodes the registry calldata and persists the anchor record', async () => {
    const { createWalletPqcEncryptedMaterial } = await import('@/lib/pqc/provider')
    const { buildPqcBindingHashes } = await import('@/lib/pqc/commitment')
    const { encodeCommitPqcBindingCalldata } = await import('@/lib/contracts/pqc-binding-registry')
    const { POST } = await import('@/app/api/wallet/[id]/pqc/anchor/route')

    const material = await createWalletPqcEncryptedMaterial({
      subject: {
        accountRef: 'EVM:secp256k1:0xabc',
        chain: 'EVM',
        address: '0x000000000000000000000000000000000000beef',
        keyType: 'secp256k1',
        scheme: 'ecdsa',
        publicKey: '0x04abcd',
        publicKeyFormat: 'hex',
      },
    })
    const provisionalHashes = buildPqcBindingHashes(material.binding)
    const canonicalUri = `https://app.example.com/api/public/pqc-bindings/${provisionalHashes.bindingHash}`
    const hashes = buildPqcBindingHashes(material.binding, canonicalUri)

    mockGetWalletSigningAccount.mockResolvedValue({
      id: 'wallet-1',
      accountRef: 'EVM:secp256k1:0xabc',
      chain: 'EVM',
      address: '0x000000000000000000000000000000000000beef',
      pubKey: '0x04abcd',
      keyType: 'secp256k1',
      signerBackend: 'local',
      vaultId: 'public',
      derivationPath: "m/44'/60'/0'/0/0",
      policy: { requiresSecondFactor: false, requiresPQAttestation: false },
      pqcBinding: material.binding,
      pqcBindingHash: null,
      createdAt: new Date('2026-03-03T00:00:00Z'),
    })

    const res = await POST(
      buildRequest({
        chainId: 8453,
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        uri: canonicalUri,
      }),
      buildContext('wallet-1'),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.bindingHash).toBe(hashes.bindingHash)
    expect(body.txHash).toBe('0xtxhash')
    expect(mockSetWalletPqcBindingHash).toHaveBeenCalledWith('wallet-1', hashes.bindingHash)
    expect(mockBuildUnsignedEvmContractTx).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '0x000000000000000000000000000000000000beef',
        chainId: 8453,
        data: encodeCommitPqcBindingCalldata({
          statementHash: hashes.statementHash,
          signatureHash: hashes.signatureHash,
          publicKeyHash: hashes.publicKeyHash,
          uriHash: hashes.uriHash!,
          uri: canonicalUri,
        }),
      }),
      '0x000000000000000000000000000000000000beef',
      expect.any(Object),
    )
    expect(mockCreateWalletPqcAnchorRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: 'wallet-1',
        chainType: 'EVM',
        networkId: '8453',
        bindingHash: hashes.bindingHash,
        statementHash: hashes.statementHash,
        signatureHash: hashes.signatureHash,
        publicKeyHash: hashes.publicKeyHash,
        uri: canonicalUri,
        uriHash: hashes.uriHash,
        txHash: '0xtxhash',
        status: 'submitted',
      }),
    )
  })
})

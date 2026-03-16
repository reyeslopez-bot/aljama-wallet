import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const { mockCreateWalletRecord, mockGetWalletById, mockCreateXrplWalletFromSeed } = vi.hoisted(() => ({
  mockCreateWalletRecord: vi.fn(),
  mockGetWalletById: vi.fn(),
  mockCreateXrplWalletFromSeed: vi.fn(),
}))

vi.mock('@/services/wallet.service', () => ({
  createWalletRecord: mockCreateWalletRecord,
  getWalletById: mockGetWalletById,
  getWalletSigningAccount: vi.fn(),
}))

vi.mock('@/infra/xrpl/client', () => ({
  createXrplWalletFromSeed: mockCreateXrplWalletFromSeed,
}))

describe('prepareManagedWalletProvisioning', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    const keyHex = '11'.repeat(32)
    const fingerprint = crypto.createHash('sha256').update(Buffer.from(keyHex, 'hex')).digest('hex')

    vi.stubEnv('WALLET_KEY_PROVIDER', 'env')
    vi.stubEnv('WALLET_ENCRYPTION_KEY_ACTIVE_VERSION', '1')
    vi.stubEnv('WALLET_ENCRYPTION_KEY_V1', keyHex)
    vi.stubEnv('WALLET_ENCRYPTION_KEY_FINGERPRINT_V1', fingerprint)

    mockGetWalletById.mockResolvedValue(null)
    mockCreateWalletRecord.mockResolvedValue({
      id: 'wallet-1',
      address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
      createdAt: new Date('2026-03-03T00:00:00Z'),
    })
    mockCreateXrplWalletFromSeed.mockImplementation((seed: string) => ({
      publicKey: `PUB-${seed}`,
      classicAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      sign: vi.fn(() => ({ tx_blob: 'blob', hash: 'hash' })),
    }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('derives deterministic ML-DSA-65 material from mnemonic and path', async () => {
    const { verifyWalletPqcBinding } = await import('@/lib/pqc/provider')
    const { unlockWalletWithSecurityProfile } = await import('@/lib/wallet')
    const { prepareManagedWalletProvisioning } = await import('@/services/signer.service')

    const first = await prepareManagedWalletProvisioning({
      password: 'StrongPassphrase1!',
      mnemonic: TEST_MNEMONIC,
      vaultId: 'public',
    })
    const second = await prepareManagedWalletProvisioning({
      password: 'StrongPassphrase1!',
      mnemonic: TEST_MNEMONIC,
      vaultId: 'public',
    })

    const unlockedFirst = await unlockWalletWithSecurityProfile({
      encrypted: first.encrypted,
      password: 'StrongPassphrase1!',
    })
    const unlockedSecond = await unlockWalletWithSecurityProfile({
      encrypted: second.encrypted,
      password: 'StrongPassphrase1!',
    })

    expect(unlockedFirst.postQuantum?.binding.derivation).toMatchObject({
      vaultId: 'public',
      chain: 'ETH',
      path: "m/44'/60'/0'/0/0",
      account: 0,
      change: 0,
      index: 0,
    })
    expect(unlockedFirst.postQuantum?.binding.publicKey).toBe(
      unlockedSecond.postQuantum?.binding.publicKey,
    )
    await expect(verifyWalletPqcBinding(unlockedFirst.postQuantum!.binding)).resolves.toBe(true)

    await first.persist()

    expect(mockCreateWalletRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        pqcBinding: expect.objectContaining({
          publicKey: unlockedFirst.postQuantum?.binding.publicKey,
          derivation: expect.objectContaining({
            vaultId: 'public',
            chain: 'ETH',
          }),
        }),
      }),
    )
  })

  it('provisions a managed XRPL wallet record from a seed', async () => {
    mockCreateWalletRecord.mockResolvedValue({
      id: 'wallet-xrpl-1',
      address: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      createdAt: new Date('2026-03-03T00:00:00Z'),
    })

    const { prepareManagedXrplWalletProvisioning } = await import('@/services/signer.service')
    const prepared = await prepareManagedXrplWalletProvisioning({
      seed: 'sEd7ExampeSeedForDistribuor111111',
      keyType: 'ed25519',
      vaultId: 'vault',
      networkId: 'testnet',
    })

    expect(prepared.address).toBe('rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe')
    expect(prepared.publicKey).toBe('PUB-sEd7ExampeSeedForDistribuor111111')

    await prepared.persist()

    expect(mockCreateWalletRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: 'XRPL',
        networkId: 'testnet',
        address: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        pubKey: 'PUB-sEd7ExampeSeedForDistribuor111111',
        keyType: 'ed25519',
        vaultId: 'vault',
      }),
    )
  })

  it('signs managed XRPL transactions when the encrypted signer material stores a seed', async () => {
    const signMock = vi.fn(() => ({ tx_blob: 'blob-seed', hash: 'hash-seed' }))
    mockCreateXrplWalletFromSeed.mockReturnValue({
      publicKey: 'EDPUBKEY',
      classicAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      sign: signMock,
    })
    const { encryptPrivateKey } = await import('@/lib/crypto/wallet-crypto')
    const encrypted = encryptPrivateKey('sEd7ExampeSeedForDistribuor111111', {
      address: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
    })
    mockGetWalletById.mockResolvedValue({
      id: 'wallet-xrpl-1',
      accountRef: 'XRPL:ed25519:edpubkey',
      chain: 'XRPL',
      address: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      pubKey: 'EDPUBKEY',
      keyType: 'ed25519',
      signerBackend: 'local',
      vaultId: 'vault',
      derivationPath: null,
      policy: { requiresSecondFactor: false, requiresPQAttestation: false },
      pqcBinding: null,
      pqcBindingHash: null,
      encryptedPrivateKey: encrypted.encryptedPrivateKey,
      encryptionIv: encrypted.encryptionIv,
      keyVersion: encrypted.keyVersion,
      createdAt: new Date(0),
    })

    const { getSigner } = await import('@/services/signer.service')
    const result = await getSigner().sign(
      {
        kind: 'xrpl-transaction',
        preparedTransaction: { TransactionType: 'Payment', Account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' } as any,
      },
      { kind: 'managed', walletId: 'wallet-xrpl-1' },
    )

    expect(result).toMatchObject({
      kind: 'xrpl-transaction',
      txBlob: 'blob-seed',
      txHash: 'hash-seed',
      publicKey: 'EDPUBKEY',
    })
    expect(mockCreateXrplWalletFromSeed).toHaveBeenCalledWith(
      'sEd7ExampeSeedForDistribuor111111',
      'ed25519',
    )
    expect(signMock).toHaveBeenCalled()
  })
})

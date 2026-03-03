import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

const { mockCreateWalletRecord, mockGetWalletById } = vi.hoisted(() => ({
  mockCreateWalletRecord: vi.fn(),
  mockGetWalletById: vi.fn(),
}))

vi.mock('@/services/wallet.service', () => ({
  createWalletRecord: mockCreateWalletRecord,
  getWalletById: mockGetWalletById,
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
})

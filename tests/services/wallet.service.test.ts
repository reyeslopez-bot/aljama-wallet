import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockWalletCreate, mockWalletAddressUpsert, mockPolicyUpsert, mockTransaction } = vi.hoisted(() => ({
  mockWalletCreate: vi.fn(),
  mockWalletAddressUpsert: vi.fn(),
  mockPolicyUpsert: vi.fn(),
  mockTransaction: vi.fn(),
}))

vi.mock('@/lib/prisma-crdb', () => ({
  prismaCrdb: {
    $transaction: mockTransaction,
    wallet: {
      create: mockWalletCreate,
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    walletAddress: {
      findMany: vi.fn(),
      upsert: mockWalletAddressUpsert,
    },
    policy: {
      findMany: vi.fn(),
      upsert: mockPolicyUpsert,
    },
    internalOperation: {
      aggregate: vi.fn(),
      create: vi.fn(),
    },
    chainTransaction: {
      aggregate: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/services/summary.service', () => ({
  incrementDailySummary: vi.fn(),
}))

vi.mock('@/lib/security/logging', () => ({
  logWarn: vi.fn(),
}))

describe('wallet.service createWalletRecord', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        wallet: { create: mockWalletCreate },
        walletAddress: { upsert: mockWalletAddressUpsert },
        policy: { upsert: mockPolicyUpsert },
      }),
    )
    mockWalletCreate.mockResolvedValue({
      id: 'wallet-1',
      accountRef: 'EVM:secp256k1:0xabc',
      chain: 'EVM',
      address: '0x000000000000000000000000000000000000bEEF',
      pubKey: '0x04abcd',
      keyType: 'secp256k1',
      signerBackend: 'local',
      vaultId: 'public',
      createdAt: new Date('2026-03-03T00:00:00Z'),
    })
    mockWalletAddressUpsert.mockResolvedValue(undefined)
    mockPolicyUpsert.mockResolvedValue(undefined)
  })

  it('rejects EVM wallet records that try to use ed25519', async () => {
    const { createWalletRecord } = await import('@/services/wallet.service')

    await expect(
      createWalletRecord({
        address: '0x000000000000000000000000000000000000beef',
        chain: 'EVM',
        keyType: 'ed25519',
        signerBackend: 'local',
        encryptedPrivateKey: new Uint8Array([1, 2, 3]),
        encryptionIv: new Uint8Array(12).fill(7),
        keyVersion: 1,
      }),
    ).rejects.toThrow(/unsupported EVM keyType/i)

    expect(mockWalletCreate).not.toHaveBeenCalled()
  })

  it('allows classical secp256k1 EVM wallet records', async () => {
    const { createWalletRecord } = await import('@/services/wallet.service')

    await createWalletRecord({
      address: '0x000000000000000000000000000000000000beef',
      chain: 'EVM',
      keyType: 'secp256k1',
      signerBackend: 'local',
      encryptedPrivateKey: new Uint8Array([1, 2, 3]),
      encryptionIv: new Uint8Array(12).fill(7),
      keyVersion: 1,
    })

    expect(mockWalletCreate).toHaveBeenCalledTimes(1)
  })
})

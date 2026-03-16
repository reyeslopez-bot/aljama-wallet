import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockWalletCreate,
  mockWalletFindMany,
  mockWalletAddressFindMany,
  mockWalletAddressUpsert,
  mockPolicyUpsert,
  mockTransaction,
} = vi.hoisted(() => ({
  mockWalletCreate: vi.fn(),
  mockWalletFindMany: vi.fn(),
  mockWalletAddressFindMany: vi.fn(),
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
      findMany: mockWalletFindMany,
      update: vi.fn(),
      delete: vi.fn(),
    },
    walletAddress: {
      findMany: mockWalletAddressFindMany,
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
    mockWalletFindMany.mockResolvedValue([])
    mockWalletAddressFindMany.mockResolvedValue([])
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

  it('allows XRPL wallet records with classic addresses without applying EVM normalization', async () => {
    const { createWalletRecord } = await import('@/services/wallet.service')

    await createWalletRecord({
      address: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      chain: 'XRPL',
      pubKey: 'EDPUBKEY',
      keyType: 'ed25519',
      signerBackend: 'local',
      encryptedPrivateKey: new Uint8Array([1, 2, 3]),
      encryptionIv: new Uint8Array(12).fill(7),
      keyVersion: 1,
    })

    expect(mockWalletCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chain: 'XRPL',
          address: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
          pubKey: 'EDPUBKEY',
          keyType: 'ed25519',
        }),
      }),
    )
  })

  it('prefers wallet-address ownership over the primary wallet address for network-scoped lookups', async () => {
    mockWalletFindMany.mockResolvedValue([
      {
        id: 'wallet-primary',
        address: '0x000000000000000000000000000000000000bEEF',
      },
    ])
    mockWalletAddressFindMany.mockResolvedValue([
      {
        walletId: 'wallet-wildcard',
        address: '0x000000000000000000000000000000000000bEEF',
        networkId: '*',
      },
      {
        walletId: 'wallet-network-specific',
        address: '0x000000000000000000000000000000000000bEEF',
        networkId: '11155111',
      },
    ])

    const { resolveWalletIdsByAddresses } = await import('@/services/wallet.service')
    const walletIdByAddress = await resolveWalletIdsByAddresses({
      addresses: ['0x000000000000000000000000000000000000beef'],
      chainType: 'EVM',
      networkId: '11155111',
    })

    expect(walletIdByAddress.get('0x000000000000000000000000000000000000bEEF')).toBe(
      'wallet-network-specific',
    )
  })

  it('falls back to the primary wallet address when no wallet-address row matches', async () => {
    mockWalletFindMany.mockResolvedValue([
      {
        id: 'wallet-primary',
        address: '0x000000000000000000000000000000000000bEEF',
      },
    ])

    const { resolveWalletIdsByAddresses } = await import('@/services/wallet.service')
    const walletIdByAddress = await resolveWalletIdsByAddresses({
      addresses: ['0x000000000000000000000000000000000000beef'],
      chainType: 'EVM',
      networkId: '11155111',
    })

    expect(walletIdByAddress.get('0x000000000000000000000000000000000000bEEF')).toBe(
      'wallet-primary',
    )
  })
})

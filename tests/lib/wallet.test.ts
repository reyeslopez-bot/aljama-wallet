// tests/lib/wallet.test.ts
import { describe, it, expect } from 'vitest'
import { encodeWalletToEncrypted, unlockWallet } from '@/lib/wallet'
import {
  mockEncryptedWallet,
  mockEncryptedWalletMissingMaterial,
  mockAccounts,
} from '@/tests/helpers/walletMocks'

describe('unlockWallet', () => {
  it('returns expected wallet for correct password', async () => {
    const password = 'test-password'
    const encrypted = await mockEncryptedWallet(password)

    const wallet = await unlockWallet({ encrypted, password })

    expect(wallet.address).toBe(mockAccounts.primary.address)
    expect(wallet.privateKey).toBe(mockAccounts.primary.privateKey)
  })

  it('accepts passwords with leading/trailing whitespace', async () => {
    const password = 'trimmed-pass'
    const encrypted = await mockEncryptedWallet(password)

    const wallet = await unlockWallet({
      encrypted,
      password: `  ${password}  `,
    })

    expect(wallet.address).toBe(mockAccounts.primary.address)
    expect(wallet.privateKey).toBe(mockAccounts.primary.privateKey)
  })

  it('throws on wrong password', async () => {
    const encrypted = await mockEncryptedWallet('correct')

    await expect(
      unlockWallet({ encrypted, password: 'wrong' }),
    ).rejects.toThrow(/Invalid password/)
  })

  it('throws on malformed payload', async () => {
    await expect(
      unlockWallet({ encrypted: 'not-base64', password: 'x' }),
    ).rejects.toThrow(/Malformed encrypted wallet payload/)
  })

  it.each(['privateKey', 'address'] as const)(
    'throws when %s is missing',
    async (missingField) => {
      const encrypted = await mockEncryptedWalletMissingMaterial(missingField)

      await expect(
        unlockWallet({ encrypted, password: 'anything' }),
      ).rejects.toThrow(/Encrypted payload missing wallet material/)
    },
  )

  it('trims password hints when encoding wallet payloads', async () => {
    const encrypted = await encodeWalletToEncrypted(
      {
        address: mockAccounts.primary.address,
        privateKey: mockAccounts.primary.privateKey,
      },
      '  trimmed-pass  ',
    )

    const decoded = JSON.parse(
      Buffer.from(encrypted, 'base64').toString('utf-8'),
    ) as { iterations: number; salt: string }

    expect(decoded.iterations).toBeGreaterThan(100_000)
    expect(decoded.salt).toBeTruthy()
  })

  it('throws when encoding with a blank password', async () => {
    await expect(
      encodeWalletToEncrypted(
        {
          address: mockAccounts.primary.address,
          privateKey: mockAccounts.primary.privateKey,
        },
        '   ',
      ),
    ).rejects.toThrow(/Password is required/)
  })
})

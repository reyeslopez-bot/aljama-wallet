// tests/lib/wallet.test.ts
import { describe, it, expect } from 'vitest'
import { unlockWallet } from '@/lib/wallet'
import { mockEncryptedWallet, mockAccounts } from '@/tests/helpers/walletMocks'

describe('unlockWallet', () => {
  it('returns expected wallet for correct password', async () => {
    const password = 'test-password'
    const encrypted = mockEncryptedWallet(password)

    const wallet = await unlockWallet({ encrypted, password })

    expect(wallet.address).toBe(mockAccounts.primary.address)
    expect(wallet.privateKey).toBe(mockAccounts.primary.privateKey)
  })

  it('throws on wrong password', async () => {
    const encrypted = mockEncryptedWallet('correct')

    await expect(
      unlockWallet({ encrypted, password: 'wrong' }),
    ).rejects.toThrow(/Invalid password/)
  })

  it('throws on malformed payload', async () => {
    await expect(
      unlockWallet({ encrypted: 'not-base64', password: 'x' }),
    ).rejects.toThrow(/Malformed encrypted wallet payload/)
  })
})

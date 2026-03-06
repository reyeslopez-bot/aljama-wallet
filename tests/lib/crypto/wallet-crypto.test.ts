import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ACTIVE_KEY_HEX = '11'.repeat(32)
const ACTIVE_KEY = Buffer.from(ACTIVE_KEY_HEX, 'hex')
const ACTIVE_FINGERPRINT = crypto.createHash('sha256').update(ACTIVE_KEY).digest('hex')
const CONTEXT = {
  address: ' 0x000000000000000000000000000000000000dEaD ',
}
const NORMALIZED_CONTEXT = {
  address: '0x000000000000000000000000000000000000dead',
}
const OTHER_CONTEXT = {
  address: '0x000000000000000000000000000000000000beef',
}

function stubWalletCryptoEnv(options?: {
  strict?: boolean
  allowLegacy?: boolean
  activeVersion?: string
  keyHex?: string
  fingerprint?: string
}) {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('WALLET_KEY_PROVIDER', 'env')
  vi.stubEnv('SECURITY_STRICT_MODE', options?.strict === false ? 'false' : 'true')
  vi.stubEnv('WALLET_CRYPTO_ALLOW_LEGACY', options?.allowLegacy ? 'true' : 'false')
  vi.stubEnv('WALLET_ENCRYPTION_KEY_ACTIVE_VERSION', options?.activeVersion ?? '1')
  vi.stubEnv('WALLET_ENCRYPTION_KEY_V1', options?.keyHex ?? ACTIVE_KEY_HEX)
  vi.stubEnv('WALLET_ENCRYPTION_KEY_FINGERPRINT_V1', options?.fingerprint ?? ACTIVE_FINGERPRINT)
}

function createLegacyEncryptedPrivateKey(privateKey: string, key: Buffer, iv: Buffer) {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()])
  return Buffer.concat([ciphertext, cipher.getAuthTag()])
}

describe('wallet-crypto', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('round-trips encrypted private keys with normalized address context binding', async () => {
    stubWalletCryptoEnv()
    const { encryptPrivateKey, decryptPrivateKey } = await import('@/lib/crypto/wallet-crypto')

    const encrypted = encryptPrivateKey('0xabc123', CONTEXT)
    const decrypted = decryptPrivateKey(
      encrypted.encryptedPrivateKey,
      encrypted.encryptionIv,
      encrypted.keyVersion,
      NORMALIZED_CONTEXT,
    )

    expect(encrypted.keyVersion).toBe(1)
    expect(encrypted.encryptionIv).toHaveLength(12)
    expect(decrypted).toBe('0xabc123')
  })

  it('rejects decryption when the wallet address context does not match', async () => {
    stubWalletCryptoEnv()
    const { encryptPrivateKey, decryptPrivateKey } = await import('@/lib/crypto/wallet-crypto')

    const encrypted = encryptPrivateKey('0xabc123', NORMALIZED_CONTEXT)

    expect(() =>
      decryptPrivateKey(
        encrypted.encryptedPrivateKey,
        encrypted.encryptionIv,
        encrypted.keyVersion,
        OTHER_CONTEXT,
      ),
    ).toThrow()
  })

  it('rejects tampered ciphertext in strict mode', async () => {
    stubWalletCryptoEnv()
    const { encryptPrivateKey, decryptPrivateKey } = await import('@/lib/crypto/wallet-crypto')

    const encrypted = encryptPrivateKey('0xabc123', NORMALIZED_CONTEXT)
    const tampered = Buffer.from(encrypted.encryptedPrivateKey)
    tampered[0] ^= 0x01

    expect(() =>
      decryptPrivateKey(tampered, encrypted.encryptionIv, encrypted.keyVersion, NORMALIZED_CONTEXT),
    ).toThrow()
  })

  it('rejects malformed IVs and ciphertext buffers before decryption', async () => {
    stubWalletCryptoEnv()
    const { decryptPrivateKey } = await import('@/lib/crypto/wallet-crypto')

    expect(() => decryptPrivateKey(Buffer.alloc(17), Buffer.alloc(11), 1, NORMALIZED_CONTEXT)).toThrow(
      /encryptionIv invalid/,
    )
    expect(() => decryptPrivateKey(Buffer.alloc(16), Buffer.alloc(12), 1, NORMALIZED_CONTEXT)).toThrow(
      /encryptedPrivateKey invalid/,
    )
  })

  it('fails fast when the active key fingerprint does not match', async () => {
    stubWalletCryptoEnv({
      fingerprint: 'ff'.repeat(32),
    })
    const { encryptPrivateKey } = await import('@/lib/crypto/wallet-crypto')

    expect(() => encryptPrivateKey('0xabc123', NORMALIZED_CONTEXT)).toThrow(/fingerprint mismatch/i)
  })

  it('requires the fingerprint in strict mode', async () => {
    stubWalletCryptoEnv({
      fingerprint: '',
    })
    const { encryptPrivateKey } = await import('@/lib/crypto/wallet-crypto')

    expect(() => encryptPrivateKey('0xabc123', NORMALIZED_CONTEXT)).toThrow(
      /WALLET_ENCRYPTION_KEY_FINGERPRINT_V1 not set/,
    )
  })

  it('rejects encryption keys that are not 32 bytes long', async () => {
    stubWalletCryptoEnv({
      keyHex: '11'.repeat(16),
    })
    const { encryptPrivateKey } = await import('@/lib/crypto/wallet-crypto')

    expect(() => encryptPrivateKey('0xabc123', NORMALIZED_CONTEXT)).toThrow(/must be 32 bytes/)
  })

  it('rejects invalid active key versions', async () => {
    stubWalletCryptoEnv({
      activeVersion: '0',
    })
    const { encryptPrivateKey } = await import('@/lib/crypto/wallet-crypto')

    expect(() => encryptPrivateKey('0xabc123', NORMALIZED_CONTEXT)).toThrow(/positive integer/)
  })

  it('supports decrypting legacy AES-GCM payloads only when legacy fallback is enabled', async () => {
    const iv = Buffer.alloc(12, 7)
    const legacyEncryptedPrivateKey = createLegacyEncryptedPrivateKey('0xlegacy', ACTIVE_KEY, iv)

    stubWalletCryptoEnv({
      allowLegacy: true,
    })
    let walletCrypto = await import('@/lib/crypto/wallet-crypto')

    expect(
      walletCrypto.decryptPrivateKey(legacyEncryptedPrivateKey, iv, 1, NORMALIZED_CONTEXT),
    ).toBe('0xlegacy')

    vi.resetModules()
    stubWalletCryptoEnv({
      allowLegacy: false,
    })
    walletCrypto = await import('@/lib/crypto/wallet-crypto')

    expect(() => walletCrypto.decryptPrivateKey(legacyEncryptedPrivateKey, iv, 1, NORMALIZED_CONTEXT)).toThrow()
  })
})

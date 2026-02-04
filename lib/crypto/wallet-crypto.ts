// lib/crypto/wallet-crypto.ts
import crypto from "node:crypto"

const ALGO = "aes-256-gcm"

function getKeyForVersion(version: number): Buffer {
  const keyHex = process.env[`WALLET_ENCRYPTION_KEY_V${version}`]
  if (!keyHex) throw new Error(`WALLET_ENCRYPTION_KEY_V${version} not set`)

  const key = Buffer.from(keyHex.trim(), "hex")
  if (key.length !== 32) {
    throw new Error(`WALLET_ENCRYPTION_KEY_V${version} must be 32 bytes hex (64 chars)`)
  }
  return key
}

function getActiveVersion(): number {
  const raw = process.env.WALLET_ENCRYPTION_KEY_ACTIVE_VERSION ?? "1"
  const v = Number(raw)
  if (!Number.isInteger(v) || v <= 0) {
    throw new Error("WALLET_ENCRYPTION_KEY_ACTIVE_VERSION must be a positive integer")
  }
  return v
}

function fingerprintKey(key: Buffer): string {
  return crypto.createHash("sha256").update(key).digest("hex")
}

function assertFingerprintMatches(version: number, key: Buffer) {
  const expected = process.env[`WALLET_ENCRYPTION_KEY_FINGERPRINT_V${version}`]
  if (!expected) {
    throw new Error(`WALLET_ENCRYPTION_KEY_FINGERPRINT_V${version} not set`)
  }
  const actual = fingerprintKey(key)
  if (actual !== expected.trim()) {
    throw new Error(`WALLET_ENCRYPTION_KEY fingerprint mismatch for V${version}. Refusing to start.`)
  }
}

// ---- fail-fast validation at module load ----
const __ACTIVE_VERSION = getActiveVersion()
const __ACTIVE_KEY = getKeyForVersion(__ACTIVE_VERSION)
assertFingerprintMatches(__ACTIVE_VERSION, __ACTIVE_KEY)

export function encryptPrivateKey(privateKey: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, __ACTIVE_KEY, iv)

  const ciphertext = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    encryptedPrivateKey: Buffer.concat([ciphertext, tag]),
    encryptionIv: iv,
    keyVersion: __ACTIVE_VERSION,
  }
}

export function decryptPrivateKey(encryptedPrivateKey: Buffer, iv: Buffer, keyVersion: number) {
  if (encryptedPrivateKey.length < 17) throw new Error("encryptedPrivateKey invalid")

  const key = getKeyForVersion(keyVersion)

  const tag = encryptedPrivateKey.subarray(encryptedPrivateKey.length - 16)
  const data = encryptedPrivateKey.subarray(0, encryptedPrivateKey.length - 16)

  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)

  const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
  return plaintext.toString("utf8")
}

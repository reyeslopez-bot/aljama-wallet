// lib/crypto/wallet-crypto.ts
import crypto from "node:crypto"
import { isStrictMode } from "@/lib/security/runtime"
import { loadKeyForVersion } from "@/lib/security/key-provider"

const ALGO = "aes-256-gcm"
const AAD_PREFIX = "aljama-wallet:pk:v1"

let cachedActiveVersion: number | null = null
let cachedActiveKey: Buffer | null = null

function getKeyForVersion(version: number): Buffer {
  const { key } = loadKeyForVersion(version)
  if (key.length !== 32) {
    throw new Error(`WALLET_ENCRYPTION_KEY_V${version} must be 32 bytes`)
  }
  assertFingerprintMatches(version, key)
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
    if (isStrictMode) {
      throw new Error(`WALLET_ENCRYPTION_KEY_FINGERPRINT_V${version} not set`)
    }
    return
  }
  const actual = fingerprintKey(key)
  if (actual !== expected.trim()) {
    throw new Error(`WALLET_ENCRYPTION_KEY fingerprint mismatch for V${version}. Refusing to start.`)
  }
}

function getActiveKey(): { version: number; key: Buffer } {
  if (cachedActiveVersion !== null && cachedActiveKey) {
    return { version: cachedActiveVersion, key: cachedActiveKey }
  }

  const version = getActiveVersion()
  const key = getKeyForVersion(version)

  cachedActiveVersion = version
  cachedActiveKey = key
  return { version, key }
}

export type WalletEncryptionContext = {
  address: string
}

function normalizeContextAddress(address: string): string {
  return address.trim().toLowerCase()
}

function deriveKeyForContext(baseKey: Buffer, version: number, context: WalletEncryptionContext) {
  const salt = crypto.createHash("sha256").update(normalizeContextAddress(context.address)).digest()
  const info = Buffer.from(`aljama-wallet:pk:${version}`)
  return crypto.hkdfSync("sha256", baseKey, salt, info, 32)
}

function buildAad(version: number, context: WalletEncryptionContext): Buffer {
  return Buffer.from(`${AAD_PREFIX}:${version}:${normalizeContextAddress(context.address)}`)
}

function decryptLegacy(
  encryptedPrivateKey: Buffer,
  iv: Buffer,
  key: Buffer,
) {
  const tag = encryptedPrivateKey.subarray(encryptedPrivateKey.length - 16)
  const data = encryptedPrivateKey.subarray(0, encryptedPrivateKey.length - 16)

  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)

  const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
  return plaintext.toString("utf8")
}

export function encryptPrivateKey(privateKey: string, context: WalletEncryptionContext) {
  const active = getActiveKey()
  const iv = crypto.randomBytes(12)
  const derivedKey = deriveKeyForContext(active.key, active.version, context)
  const cipher = crypto.createCipheriv(ALGO, derivedKey, iv)
  cipher.setAAD(buildAad(active.version, context))

  const ciphertext = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    encryptedPrivateKey: Buffer.concat([ciphertext, tag]),
    encryptionIv: iv,
    keyVersion: active.version,
  }
}

export function decryptPrivateKey(
  encryptedPrivateKey: Buffer,
  iv: Buffer,
  keyVersion: number,
  context: WalletEncryptionContext,
) {
  if (encryptedPrivateKey.length < 17) throw new Error("encryptedPrivateKey invalid")
  if (iv.length !== 12) throw new Error("encryptionIv invalid")

  const key = getKeyForVersion(keyVersion)
  const derivedKey = deriveKeyForContext(key, keyVersion, context)

  const tag = encryptedPrivateKey.subarray(encryptedPrivateKey.length - 16)
  const data = encryptedPrivateKey.subarray(0, encryptedPrivateKey.length - 16)

  try {
    const decipher = crypto.createDecipheriv(ALGO, derivedKey, iv)
    decipher.setAAD(buildAad(keyVersion, context))
    decipher.setAuthTag(tag)

    const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
    return plaintext.toString("utf8")
  } catch (error) {
    const allowLegacy = process.env.WALLET_CRYPTO_ALLOW_LEGACY === "true" || !isStrictMode
    if (!allowLegacy) throw error
    return decryptLegacy(encryptedPrivateKey, iv, key)
  }
}

// lib/crypto/wallet-crypto.ts
import crypto from "node:crypto"

const ALGO = "aes-256-gcm"
const KEY_VERSION = 1

function getKey(): Buffer {
  const keyHex = process.env.WALLET_ENCRYPTION_KEY
  if (!keyHex) throw new Error("WALLET_ENCRYPTION_KEY not set")
  const key = Buffer.from(keyHex, "hex")
  if (key.length !== 32) throw new Error("WALLET_ENCRYPTION_KEY must be 32 bytes hex (64 chars)")
  return key
}

export function encryptPrivateKey(privateKey: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)

  const ciphertext = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag() // 16 bytes

  return {
    encryptedPrivateKey: Buffer.concat([ciphertext, tag]),
    encryptionIv: iv,
    keyVersion: KEY_VERSION,
  }
}

export function decryptPrivateKey(encryptedPrivateKey: Buffer, iv: Buffer) {
  if (encryptedPrivateKey.length < 17) throw new Error("encryptedPrivateKey invalid")
  const tag = encryptedPrivateKey.subarray(encryptedPrivateKey.length - 16)
  const data = encryptedPrivateKey.subarray(0, encryptedPrivateKey.length - 16)

  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)

  const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
  return plaintext.toString("utf8")
}
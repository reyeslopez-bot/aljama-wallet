// lib/wallet.ts
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

export type UnlockWalletParams = {
  encrypted: string
  password: string
}

export type UnlockedWallet = {
  address: string
  privateKey: string
}

const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

const ENCRYPTION_VERSION = 2
const KDF = 'PBKDF2'
const DIGEST = 'SHA-256'
const ITERATIONS = 310_000
const SALT_BYTES = 16
const IV_BYTES = 12
const AAD_TEXT = 'aljama-wallet:v2'

function isStrictBase64(input: string): boolean {
  const normalized = input.trim()

  if (!normalized || normalized.length % 4 !== 0 || !BASE64_PATTERN.test(normalized)) {
    return false
  }

  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(normalized, 'base64').toString('base64') === normalized
    }

    if (typeof atob === 'function' && typeof btoa === 'function') {
      return btoa(atob(normalized)) === normalized
    }
  } catch {
    return false
  }

  return false
}

function decodeBase64(input: string): string {
  if (!isStrictBase64(input)) {
    throw new Error('Malformed encrypted wallet payload')
  }

  try {
    if (typeof atob === 'function') {
      return atob(input.trim())
    }
    // Node/SSR fallback
    return Buffer.from(input.trim(), 'base64').toString('utf-8')
  } catch {
    throw new Error('Malformed encrypted wallet payload')
  }
}

function encodeBase64(input: string): string {
  if (typeof btoa === 'function') {
    return btoa(input)
  }
  // Node/SSR fallback
  return Buffer.from(input, 'utf-8').toString('base64')
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }

  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary)
}

function base64ToBytes(input: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(input, 'base64'))
  }

  const binary = atob(input)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function getCrypto() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error('WebCrypto unavailable')
  }
  return globalThis.crypto
}

function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function utf8Decode(bytes: ArrayBuffer | Uint8Array): string {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return new TextDecoder().decode(buffer)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const crypto = getCrypto()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(utf8Encode(password)),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations,
      hash: DIGEST,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// internal representation of the stored blob
export type EncryptedWalletPayload = {
  v: typeof ENCRYPTION_VERSION
  kdf: typeof KDF
  digest: typeof DIGEST
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

async function encryptPayload(payload: Record<string, unknown>, password: string): Promise<string> {
  const normalizedPassword = password.trim()
  if (!normalizedPassword) {
    throw new Error('Password is required')
  }

  const crypto = getCrypto()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(normalizedPassword, salt, ITERATIONS)

  const plaintext = utf8Encode(JSON.stringify(payload))

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(utf8Encode(AAD_TEXT)),
    },
    key,
    toArrayBuffer(plaintext),
  )

  const envelope: EncryptedWalletPayload = {
    v: ENCRYPTION_VERSION,
    kdf: KDF,
    digest: DIGEST,
    iterations: ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }

  return encodeBase64(JSON.stringify(envelope))
}

async function decryptPayload(encrypted: string, password: string): Promise<Record<string, unknown>> {
  if (!encrypted?.trim()) {
    throw new Error('Encrypted payload is required')
  }

  const normalizedPassword = password.trim()
  if (!normalizedPassword) {
    throw new Error('Password is required')
  }

  let decodedJson: string
  try {
    decodedJson = decodeBase64(encrypted)
  } catch {
    throw new Error('Malformed encrypted wallet payload')
  }

  let decoded: EncryptedWalletPayload
  try {
    decoded = JSON.parse(decodedJson) as EncryptedWalletPayload
  } catch {
    throw new Error('Malformed encrypted JSON structure')
  }

  if (
    decoded.v !== ENCRYPTION_VERSION ||
    decoded.kdf !== KDF ||
    decoded.digest !== DIGEST ||
    !decoded.salt ||
    !decoded.iv ||
    !decoded.ciphertext ||
    !Number.isInteger(decoded.iterations)
  ) {
    throw new Error('Malformed encrypted wallet payload')
  }

  const salt = base64ToBytes(decoded.salt)
  const iv = base64ToBytes(decoded.iv)
  const ciphertext = base64ToBytes(decoded.ciphertext)

  const key = await deriveKey(normalizedPassword, salt, decoded.iterations)

  try {
    const plaintext = await getCrypto().subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(utf8Encode(AAD_TEXT)),
      },
      key,
      toArrayBuffer(ciphertext),
    )

    return JSON.parse(utf8Decode(plaintext)) as Record<string, unknown>
  } catch {
    throw new Error('Invalid password')
  }
}

/**
 * Unlocks a previously encrypted wallet.
 */
export async function unlockWallet({
  encrypted,
  password,
}: UnlockWalletParams): Promise<UnlockedWallet> {
  const payload = await decryptPayload(encrypted, password)

  const address = payload.address
  const privateKey = payload.privateKey

  if (typeof address !== 'string' || typeof privateKey !== 'string' || !address || !privateKey) {
    throw new Error('Encrypted payload missing wallet material')
  }

  return {
    address,
    privateKey,
  }
}

export type WalletMaterial = {
  address: string
  privateKey: string
}

export async function encodeWalletToEncrypted(
  wallet: WalletMaterial,
  password: string,
): Promise<string> {
  return encryptPayload({
    address: wallet.address,
    privateKey: wallet.privateKey,
  }, password)
}

// Test helper to create encrypted payloads with missing material.
export async function encodePayloadToEncrypted(
  payload: Record<string, unknown>,
  password: string,
): Promise<string> {
  return encryptPayload(payload, password)
}

/**
 * Creates a new wallet and returns:
 * - the encrypted blob you store (sessionStorage, etc.)
 * - the unlocked wallet object for immediate use
 */
export async function createEncryptedWallet(
  password: string,
): Promise<{ encrypted: string; wallet: UnlockedWallet }> {
  if (!password?.trim()) {
    throw new Error('Password is required')
  }

  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)

  const wallet: UnlockedWallet = {
    address: account.address,
    privateKey,
  }

  const encrypted = await encodeWalletToEncrypted(wallet, password.trim())

  return { encrypted, wallet }
}

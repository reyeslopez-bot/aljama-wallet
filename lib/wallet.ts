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

// internal representation of the stored blob
type EncryptedWalletPayload = {
  address: string
  privateKey: string
  passwordHint?: string
  // allow future fields without using `any`
  [key: string]: unknown
}

/**
 * Unlocks a previously "encrypted" wallet.
 * NOTE: this is still toy crypto (base64 + passwordHint), NOT production security.
 */
export async function unlockWallet({
  encrypted,
  password,
}: UnlockWalletParams): Promise<UnlockedWallet> {
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
    decoded.passwordHint &&
    decoded.passwordHint.trim() !== normalizedPassword
  ) {
    throw new Error('Invalid password')
  }

  if (!decoded.privateKey || !decoded.address) {
    throw new Error('Encrypted payload missing wallet material')
  }

  return {
    address: decoded.address,
    privateKey: decoded.privateKey,
  }
}

export type WalletMaterial = {
  address: string
  privateKey: string
}

export function encodeWalletToEncrypted(
  wallet: WalletMaterial,
  password: string,
): string {
  const normalizedPassword = password.trim()

  if (!normalizedPassword) {
    throw new Error('Password is required')
  }

  const payload: EncryptedWalletPayload = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    passwordHint: normalizedPassword,
  }

  return encodeBase64(JSON.stringify(payload))
}

/**
 * Creates a new wallet and returns:
 * - the "encrypted" base64 blob you store (sessionStorage, etc.)
 * - the unlocked wallet object for immediate use
 *
 * Still toy crypto: passwordHint is used instead of real KDF + encryption.
 */
export function createEncryptedWallet(
  password: string,
): { encrypted: string; wallet: UnlockedWallet } {
  if (!password?.trim()) {
    throw new Error('Password is required')
  }

  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)

  const wallet: UnlockedWallet = {
    address: account.address,
    privateKey,
  }

  const encrypted = encodeWalletToEncrypted(wallet, password.trim())

  return { encrypted, wallet }
}

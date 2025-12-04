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

function decodeBase64(input: string): string {
  if (typeof atob === 'function') {
    return atob(input)
  }
  // Node/SSR fallback
  return Buffer.from(input, 'base64').toString('utf-8')
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

  if (!password?.trim()) {
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

  if (decoded.passwordHint && decoded.passwordHint !== password) {
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
  const payload: EncryptedWalletPayload = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    passwordHint: password,
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

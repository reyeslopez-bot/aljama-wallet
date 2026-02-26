// lib/storage/walletSession.ts

const STORAGE_KEY = 'aljama.encryptedWallet'
const WALLET_ID_KEY = 'aljama.walletId'
const PATH_LOCKS_KEY = 'aljama.pathLocks'

export function persistEncryptedSession(payload: string) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(STORAGE_KEY, payload)
}

export function loadEncryptedSession(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(STORAGE_KEY)
}

export function clearEncryptedSession() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(STORAGE_KEY)
}

export function persistWalletId(walletId: string) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(WALLET_ID_KEY, walletId)
}

export function loadWalletId(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(WALLET_ID_KEY)
}

export function clearWalletId() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(WALLET_ID_KEY)
}

export function persistPathLocks(pathLocks: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(PATH_LOCKS_KEY, JSON.stringify(pathLocks))
}

export function loadPathLocks<T extends Record<string, unknown> = Record<string, unknown>>(): T | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(PATH_LOCKS_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function clearPathLocks() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(PATH_LOCKS_KEY)
}

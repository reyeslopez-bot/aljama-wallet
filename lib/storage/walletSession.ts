// lib/storage/walletSession.ts

const STORAGE_KEY = 'aljama.encryptedWallet'

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

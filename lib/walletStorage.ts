// lib/walletStorage.ts

const STORAGE_KEY = 'aljama.encryptedWallet'

export function saveEncryptedWallet(payload: string) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(STORAGE_KEY, payload)
}

export function loadEncryptedWallet(): string {
  if (typeof window === 'undefined') return ''
  return sessionStorage.getItem(STORAGE_KEY) ?? ''
}

export function clearEncryptedWallet() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(STORAGE_KEY)
}

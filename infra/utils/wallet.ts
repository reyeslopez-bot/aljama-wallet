// infra/utils/wallet.ts
const isBrowser = () => typeof window !== "undefined"

export function loadEncryptedKey(): string | null {
  if (!isBrowser()) return null
  return localStorage.getItem("encryptedKey")
}

export function persistEncryptedKey(v: string) {
  if (!isBrowser()) return
  localStorage.setItem("encryptedKey", v)
}

export function clearEncryptedKey() {
  if (!isBrowser()) return
  localStorage.removeItem("encryptedKey")
}

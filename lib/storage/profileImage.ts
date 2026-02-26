const PROFILE_IMAGE_KEY_PREFIX = 'aljama.profileImage.'

function keyForUsername(username: string): string {
  return `${PROFILE_IMAGE_KEY_PREFIX}${username.trim().toLowerCase()}`
}

export function persistProfileImageForUsername(username: string, image: string | null): void {
  if (typeof window === 'undefined') return

  const normalized = username.trim().toLowerCase()
  if (!normalized) return

  const key = keyForUsername(normalized)
  const value = image?.trim() ?? ''

  if (!value) {
    window.localStorage.removeItem(key)
    return
  }

  window.localStorage.setItem(key, value)
}

export function loadProfileImageForUsername(username: string): string | null {
  if (typeof window === 'undefined') return null

  const normalized = username.trim().toLowerCase()
  if (!normalized) return null

  const value = window.localStorage.getItem(keyForUsername(normalized))
  return value?.trim() || null
}

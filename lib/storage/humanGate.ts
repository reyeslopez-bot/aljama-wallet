// lib/storage/humanGate.ts
const KEY = 'aljama_human_ok_v1'

export function setHumanOk() {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(KEY, '1')
}

export function getHumanOk(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(KEY) === '1'
}

export function clearHumanOk() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(KEY)
}

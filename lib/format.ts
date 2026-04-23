export function formatShortAddress(address: string | undefined | null): string {
  if (!address) return '—'
  const trimmed = address.trim()
  if (trimmed.length <= 12) return trimmed
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`
}

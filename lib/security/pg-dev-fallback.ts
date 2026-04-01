const globalForPgDevFallback = globalThis as typeof globalThis & {
  pgDevDisabledFeatures?: Map<string, string>
}

const disabledFeatures = globalForPgDevFallback.pgDevDisabledFeatures ?? new Map<string, string>()

if (process.env.NODE_ENV !== 'production') {
  globalForPgDevFallback.pgDevDisabledFeatures = disabledFeatures
}

export function isPgFeatureDisabledInDev(feature: string): boolean {
  if (process.env.NODE_ENV === 'production') return false
  return disabledFeatures.has(feature)
}

export function disablePgFeatureInDev(feature: string, reason: string): boolean {
  if (process.env.NODE_ENV === 'production') return false
  if (disabledFeatures.has(feature)) return false
  disabledFeatures.set(feature, reason)
  return true
}

export function clearPgDevFallbackStateForTests() {
  disabledFeatures.clear()
}

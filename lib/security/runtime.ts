export const isProduction = process.env.NODE_ENV === 'production'
export const isStrictMode = process.env.SECURITY_STRICT_MODE === 'true' || isProduction

export function requireEnv(name: string): string | null {
  const value = process.env[name]
  if (isStrictMode && (!value || !value.trim())) {
    throw new Error(`Missing required env: ${name}`)
  }
  return value ?? null
}

export function hasEnv(name: string): boolean {
  const value = process.env[name]
  return Boolean(value && value.trim())
}

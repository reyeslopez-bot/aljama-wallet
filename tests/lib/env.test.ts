import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { assertEnvOrExit, validateEnv } from '@/lib/env'

const CRITICAL_KEYS = [
  'NEXTAUTH_SECRET',
  'NEXTAUTH_DEV_SECRET',
  'NEXTAUTH_URL',
  'NEXT_PUBLIC_SITE_URL',
  'POSTGRES_URL',
  'COCKROACH_URL',
  'DATABASE_URL_PG',
  'CRDB_DATABASE_URL',
  'AUTH_MODE',
] as const

function clearCriticalEnv(): void {
  for (const key of CRITICAL_KEYS) {
    vi.stubEnv(key, '')
  }
}

describe('validateEnv', () => {
  beforeEach(() => {
    clearCriticalEnv()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('test mode is always ok and silent', () => {
    vi.stubEnv('NODE_ENV', 'test')
    const result = validateEnv()
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  test('production fails without NEXTAUTH_SECRET, NEXTAUTH_URL, NEXT_PUBLIC_SITE_URL, and DB', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const result = validateEnv()
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('NEXTAUTH_SECRET'))).toBe(true)
    expect(result.errors.some((e) => e.includes('NEXTAUTH_URL'))).toBe(true)
    expect(result.errors.some((e) => e.includes('NEXT_PUBLIC_SITE_URL'))).toBe(true)
    expect(result.errors.some((e) => e.includes('database'))).toBe(true)
  })

  test('production rejects short NEXTAUTH_SECRET', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXTAUTH_SECRET', 'too-short')
    vi.stubEnv('NEXTAUTH_URL', 'https://app.example.com')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.example.com')
    vi.stubEnv('POSTGRES_URL', 'postgresql://u:p@h:5432/d')
    const result = validateEnv()
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('NEXTAUTH_SECRET'))).toBe(true)
  })

  test('production passes with all required fields', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXTAUTH_SECRET', 'a'.repeat(32))
    vi.stubEnv('NEXTAUTH_URL', 'https://app.example.com')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.example.com')
    vi.stubEnv('POSTGRES_URL', 'postgresql://u:p@h:5432/d')
    const result = validateEnv()
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  test.each(['POSTGRES_URL', 'COCKROACH_URL', 'DATABASE_URL_PG', 'CRDB_DATABASE_URL'] as const)(
    'production accepts %s as the DB URL',
    (key) => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('NEXTAUTH_SECRET', 'a'.repeat(32))
      vi.stubEnv('NEXTAUTH_URL', 'https://app.example.com')
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.example.com')
      vi.stubEnv(key, 'postgresql://u:p@h:5432/d')
      expect(validateEnv().ok).toBe(true)
    },
  )

  test('development warns but does not fail when auth and DB are missing', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const result = validateEnv()
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => w.includes('NEXTAUTH_SECRET'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('database'))).toBe(true)
  })

  test('development suppresses DB warning when AUTH_MODE=memory', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('AUTH_MODE', 'memory')
    vi.stubEnv('NEXTAUTH_DEV_SECRET', 'dev')
    const result = validateEnv()
    expect(result.warnings.some((w) => w.includes('database'))).toBe(false)
  })
})

describe('assertEnvOrExit', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    clearCriticalEnv()
    warn.mockClear()
    error.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('throws in production when invalid', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => assertEnvOrExit()).toThrow(/refusing to boot/)
  })

  test('does not throw in development even when warnings exist', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(() => assertEnvOrExit()).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })
})

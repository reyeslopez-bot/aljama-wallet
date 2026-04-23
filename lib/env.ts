import { z } from 'zod'

const ProductionEnvSchema = z.object({
  NEXTAUTH_SECRET: z
    .string()
    .min(32, 'must be at least 32 characters'),
  NEXTAUTH_URL: z.string().url(),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
})

function hasDatabaseUrl(): boolean {
  return Boolean(
    process.env.POSTGRES_URL?.trim() ||
      process.env.COCKROACH_URL?.trim() ||
      process.env.DATABASE_URL_PG?.trim() ||
      process.env.CRDB_DATABASE_URL?.trim(),
  )
}

export type EnvValidationResult = {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export function validateEnv(): EnvValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const nodeEnv = process.env.NODE_ENV
  const isProduction = nodeEnv === 'production'
  const isTest = nodeEnv === 'test'

  if (isTest) {
    return { ok: true, errors, warnings }
  }

  if (isProduction) {
    const parsed = ProductionEnvSchema.safeParse(process.env)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '<root>'
        errors.push(`${key}: ${issue.message}`)
      }
    }
    if (!hasDatabaseUrl()) {
      errors.push(
        'database: set one of POSTGRES_URL, COCKROACH_URL, DATABASE_URL_PG, or CRDB_DATABASE_URL',
      )
    }
  } else {
    if (!process.env.NEXTAUTH_SECRET && !process.env.NEXTAUTH_DEV_SECRET) {
      warnings.push(
        'neither NEXTAUTH_SECRET nor NEXTAUTH_DEV_SECRET set — auth flows will fail',
      )
    }
    if (!hasDatabaseUrl() && process.env.AUTH_MODE !== 'memory') {
      warnings.push(
        'no database URL configured — persistence-backed routes will fail',
      )
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}

export function assertEnvOrExit(): void {
  const result = validateEnv()

  for (const warning of result.warnings) {
    console.warn(`[env] ${warning}`)
  }

  if (result.ok) return

  console.error('[env] configuration is invalid:')
  for (const error of result.errors) {
    console.error(`  - ${error}`)
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Invalid environment configuration — refusing to boot')
  }
}

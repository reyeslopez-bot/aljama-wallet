import { z } from 'zod'

const MAX_SECURITY_SIGNAL_BATCH = 200

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
)

const jsonRecordSchema = z.record(z.string(), jsonValueSchema)

const SENSITIVE_FREE_FORM_KEYS = new Set(
  [
    'access_token',
    'api_key',
    'authorization',
    'bearer_token',
    'client_secret',
    'cookie',
    'cvv',
    'cvc',
    'email',
    'mnemonic',
    'passphrase',
    'password',
    'phone',
    'phone_number',
    'private_key',
    'recovery_phrase',
    'refresh_token',
    'secret',
    'seed',
    'seed_phrase',
    'session_token',
    'set_cookie',
    'social_security_number',
    'ssn',
  ].map(normalizeSensitiveKey),
)

function normalizeSensitiveKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizePath(path: string[]) {
  return path.map((segment) => normalizeSensitiveKey(segment)).join('.')
}

function collectSensitiveFieldPaths(
  value: unknown,
  path: string[],
  allowlistedPaths: ReadonlySet<string>,
  issues: string[],
) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      collectSensitiveFieldPaths(value[index], [...path, String(index)], allowlistedPaths, issues)
    }
    return
  }

  if (!value || typeof value !== 'object') {
    return
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nextPath = [...path, key]
    const normalizedPath = normalizePath(nextPath)
    if (
      SENSITIVE_FREE_FORM_KEYS.has(normalizeSensitiveKey(key)) &&
      !allowlistedPaths.has(normalizedPath)
    ) {
      issues.push(nextPath.join('.'))
    }
    collectSensitiveFieldPaths(nestedValue, nextPath, allowlistedPaths, issues)
  }
}

function addSensitiveFieldIssues(
  field: 'context' | 'payload' | 'details',
  value: Record<string, JsonValue> | undefined,
  ctx: z.core.$RefinementCtx<unknown>,
  allowlistedPaths: ReadonlySet<string>,
) {
  if (!value) return

  const issues: string[] = []
  collectSensitiveFieldPaths(value, [field], allowlistedPaths, issues)

  for (const issuePath of issues) {
    const relativePath = issuePath.split('.').slice(1)
    ctx.addIssue({
      code: 'custom',
      path: [field, ...relativePath],
      message: `Sensitive free-form field "${issuePath}" must be explicitly allowlisted.`,
    })
  }
}

function buildAllowlistedPaths(
  field: 'context' | 'payload' | 'details',
  paths?: readonly string[],
): ReadonlySet<string> {
  return new Set((paths ?? []).map((path) => normalizePath([field, ...path.split('.')].filter(Boolean))))
}

const telemetryContextAllowlist = buildAllowlistedPaths('context')
const telemetryPayloadAllowlist = buildAllowlistedPaths('payload')
const securitySignalDetailsAllowlist = buildAllowlistedPaths('details')

export const telemetryEventV1Schema = z
  .object({
    schemaVersion: z.literal('1'),
    event: z.string().trim().min(1).max(64).regex(/^[a-z0-9._:-]+$/i),
    ts: z.string().datetime(),
    traceId: z.string().trim().min(8).max(128),
    sessionId: z.string().trim().min(8).max(64),
    deviceId: z.string().trim().min(8).max(64),
    path: z.string().trim().min(1).max(512).optional(),
    context: jsonRecordSchema.optional().default({}),
    payload: jsonRecordSchema.optional().default({}),
  })
  .strict()
  .superRefine((value, ctx) => {
    addSensitiveFieldIssues('context', value.context, ctx, telemetryContextAllowlist)
    addSensitiveFieldIssues('payload', value.payload, ctx, telemetryPayloadAllowlist)
  })

const securitySignalV1Schema = z
  .object({
    source: z.string().trim().min(1).max(128).regex(/^[a-z0-9._:-]+$/i),
    route: z.string().trim().min(1).max(512).optional(),
    outcome: z.enum(['success', 'failure', 'blocked']).optional(),
    statusCode: z.number().int().min(100).max(599).optional(),
    status: z.number().int().min(100).max(599).optional(),
    ipHash: z.string().trim().min(16).max(128).optional(),
    ip: z.string().trim().min(3).max(64).optional(),
    userId: z.string().trim().min(1).max(128).optional(),
    sessionId: z.string().trim().min(1).max(128).optional(),
    deviceId: z.string().trim().min(1).max(128).optional(),
    principal: z.string().trim().min(1).max(256).optional(),
    country: z.string().trim().min(2).max(3).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    userAgent: z.string().trim().min(1).max(512).optional(),
    traceId: z.string().trim().min(8).max(128).optional(),
    details: jsonRecordSchema.optional().default({}),
    detectedAt: z.union([z.string().datetime(), z.number().int().positive()]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status !== undefined && value.statusCode !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Provide only one of "status" or "statusCode".',
      })
    }

    if (value.outcome === undefined && value.status === undefined && value.statusCode === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['outcome'],
        message: 'Either "outcome" or an HTTP status code is required.',
      })
    }

    addSensitiveFieldIssues('details', value.details, ctx, securitySignalDetailsAllowlist)
  })

export const securitySignalsBatchV1Schema = z
  .object({
    schemaVersion: z.literal('1'),
    enqueue: z.boolean().optional(),
    transport: z.enum(['direct', 'api', 'queue', 'event_bus']).optional(),
    signals: z.array(securitySignalV1Schema).min(1).max(MAX_SECURITY_SIGNAL_BATCH),
  })
  .strict()

export function assertNoSensitiveFreeFormFields(
  field: 'context' | 'payload' | 'details',
  value: Record<string, unknown> | null | undefined,
) {
  if (!value) return

  const allowlistedPaths =
    field === 'context'
      ? telemetryContextAllowlist
      : field === 'payload'
        ? telemetryPayloadAllowlist
        : securitySignalDetailsAllowlist

  const issues: string[] = []
  collectSensitiveFieldPaths(value, [field], allowlistedPaths, issues)

  if (issues.length === 0) return

  const [firstIssue] = issues
  throw new Error(`Sensitive free-form field "${firstIssue}" must be explicitly allowlisted.`)
}

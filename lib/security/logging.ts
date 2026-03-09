import { getErrorCode, getErrorMessage } from './errors'

type LogLevel = 'error' | 'warn' | 'info'
type LogDetails = Record<string, unknown>

const MAX_STACK_LINES = 8
const MAX_OBJECT_DEPTH = 4
const MAX_OBJECT_KEYS = 20
const MAX_ARRAY_ITEMS = 10
const MAX_STRING_LENGTH = 400

function isBrowserRuntime() {
  return typeof window !== 'undefined'
}

function trimString(value: string) {
  if (value.length <= MAX_STRING_LENGTH) return value
  return `${value.slice(0, MAX_STRING_LENGTH)}…`
}

function trimStack(stack: string | null | undefined) {
  if (!stack) return null
  return stack
    .split('\n')
    .slice(0, MAX_STACK_LINES)
    .join('\n')
}

function compactObject(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Record<string, unknown>
}

function normalizeValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    return trimString(value)
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value === 'function') {
    return `[function ${(value as { name?: string }).name || 'anonymous'}]`
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value instanceof Error) {
    return normalizeError(value)
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[circular]'
    }

    if (depth >= MAX_OBJECT_DEPTH) {
      return '[max_depth]'
    }

    seen.add(value as object)

    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => normalizeValue(item, depth + 1, seen))
      if (value.length > MAX_ARRAY_ITEMS) {
        items.push(`[+${value.length - MAX_ARRAY_ITEMS} more items]`)
      }
      return items
    }

    const entries = Object.entries(value as Record<string, unknown>)
    const normalizedEntries = entries
      .slice(0, MAX_OBJECT_KEYS)
      .map(([key, entryValue]) => [key, normalizeValue(entryValue, depth + 1, seen)] as const)

    if (entries.length > MAX_OBJECT_KEYS) {
      normalizedEntries.push(['_truncatedKeys', entries.length - MAX_OBJECT_KEYS])
    }

    return Object.fromEntries(normalizedEntries)
  }

  return String(value)
}

function normalizeCause(cause: unknown) {
  if (cause == null) return undefined

  if (cause instanceof Error) {
    return compactObject({
      name: cause.name || 'Error',
      message: getErrorMessage(cause, 'Unknown cause'),
      code: getErrorCode(cause),
      stack: trimStack(cause.stack),
    })
  }

  if (typeof cause === 'object') {
    return normalizeValue(cause)
  }

  return { message: String(cause) }
}

export function normalizeError(error: unknown) {
  const message = getErrorMessage(error, 'Unknown error')

  if (error instanceof Error) {
    const context = normalizeValue(
      Object.fromEntries(
        Object.entries(error as unknown as Record<string, unknown>).filter(
          ([key]) => !['name', 'message', 'stack', 'cause', 'code'].includes(key),
        ),
      ),
    )

    return compactObject({
      name: error.name || 'Error',
      message,
      code: getErrorCode(error),
      stack: trimStack(error.stack),
      cause: normalizeCause((error as Error & { cause?: unknown }).cause),
      ...(context &&
      typeof context === 'object' &&
      !Array.isArray(context) &&
      Object.keys(context as Record<string, unknown>).length > 0
        ? { context }
        : {}),
    })
  }

  if (typeof error === 'object' && error !== null) {
    const objectValue = error as Record<string, unknown>
    const context = normalizeValue(
      Object.fromEntries(
        Object.entries(objectValue).filter(([key]) => !['name', 'message', 'stack', 'cause', 'code'].includes(key)),
      ),
    )

    return compactObject({
      name: typeof objectValue.name === 'string' ? objectValue.name : 'ErrorLike',
      message,
      code: getErrorCode(objectValue),
      stack: typeof objectValue.stack === 'string' ? trimStack(objectValue.stack) : undefined,
      cause: normalizeCause(objectValue.cause),
      ...(context &&
      typeof context === 'object' &&
      !Array.isArray(context) &&
      Object.keys(context as Record<string, unknown>).length > 0
        ? { context }
        : {}),
    })
  }

  return compactObject({
    message,
    context: normalizeValue(error),
  })
}

function baseLogDetails(level: LogLevel, scope: string) {
  return compactObject({
    level,
    scope,
    timestamp: new Date().toISOString(),
    runtime: isBrowserRuntime() ? 'browser' : 'server',
    nodeEnv: typeof process !== 'undefined' ? process.env.NODE_ENV ?? null : null,
    pid: typeof process !== 'undefined' && typeof process.pid === 'number' ? process.pid : null,
  })
}

function composeLogDetails(level: LogLevel, scope: string, details?: LogDetails, error?: unknown) {
  return compactObject({
    ...baseLogDetails(level, scope),
    ...(details ? (normalizeValue(details) as LogDetails) : {}),
    ...(error !== undefined ? { error: normalizeError(error) } : {}),
  })
}

export function logError(scope: string, error: unknown, details?: Record<string, unknown>) {
  const message = getErrorMessage(error, 'Unknown error')
  console.error(`[${scope}] ${message}`, composeLogDetails('error', scope, details, error))
}

export function logWarn(scope: string, error: unknown, details?: Record<string, unknown>) {
  const message = getErrorMessage(error, 'Unknown warning')
  console.warn(`[${scope}] ${message}`, composeLogDetails('warn', scope, details, error))
}

export function logInfo(scope: string, message: string, details?: Record<string, unknown>) {
  console.info(`[${scope}] ${message}`, composeLogDetails('info', scope, details))
}

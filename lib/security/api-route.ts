import { errorJson } from '@/lib/security/api-response'
import { getErrorMessage } from '@/lib/security/errors'
import { logError, logWarn } from '@/lib/security/logging'

const DEFAULT_TIMEOUT_MS = 15_000
const REQUEST_ID_HEADER = 'x-request-id'
const RESPONSE_TIME_HEADER = 'x-response-time-ms'

export type ApiRouteContext = {
  requestId: string
  startedAt: number
  timeoutMs: number
}

type ApiRouteHandler<TArgs extends unknown[]> = (
  req: Request,
  context: ApiRouteContext,
  ...args: TArgs
) => Promise<Response> | Response

type ApiRouteErrorHandler<TArgs extends unknown[]> = (
  error: unknown,
  context: ApiRouteContext,
  req: Request,
  ...args: TArgs
) => Promise<Response> | Response

type ApiRouteOptions<TArgs extends unknown[]> = {
  scope: string
  timeoutMs?: number
  onError?: ApiRouteErrorHandler<TArgs>
}

class ApiRouteTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Route timed out after ${timeoutMs}ms`)
    this.name = 'ApiRouteTimeoutError'
  }
}

function getRequestPath(req: Request) {
  try {
    return new URL(req.url).pathname
  } catch {
    return null
  }
}

function buildApiLogDetails(
  req: Request,
  context: ApiRouteContext,
  details?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    requestId: context.requestId,
    timeoutMs: context.timeoutMs,
    durationMs: Math.max(0, Date.now() - context.startedAt),
    method: req.method,
    path: getRequestPath(req),
    ...details,
  }
}

function resolveRequestId(req: Request): string {
  const candidates = [req.headers.get('x-request-id'), req.headers.get('x-correlation-id')]

  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed && trimmed.length <= 128) {
      return trimmed
    }
  }

  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function appendApiRouteHeaders(response: Response, context: ApiRouteContext): Response {
  response.headers.set(REQUEST_ID_HEADER, context.requestId)
  response.headers.set(RESPONSE_TIME_HEADER, String(Math.max(0, Date.now() - context.startedAt)))
  return response
}

async function runWithTimeout<T>(work: () => Promise<T> | T, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new ApiRouteTimeoutError(timeoutMs)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

export function withApiRoute<TArgs extends unknown[]>(
  options: ApiRouteOptions<TArgs>,
  handler: ApiRouteHandler<TArgs>,
) {
  return async (req?: Request, ...args: TArgs): Promise<Response> => {
    const request = req ?? new Request('http://localhost')
    const context: ApiRouteContext = {
      requestId: resolveRequestId(request),
      startedAt: Date.now(),
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    }

    try {
      const response = await runWithTimeout(() => handler(request, context, ...args), context.timeoutMs)
      return appendApiRouteHeaders(response, context)
    } catch (error) {
      if (error instanceof ApiRouteTimeoutError) {
        logWarn(options.scope, error, {
          ...buildApiLogDetails(request, context),
        })
        return appendApiRouteHeaders(errorJson(504, 'request_timeout', 'REQUEST_TIMEOUT'), context)
      }

      if (options.onError) {
        const response = await options.onError(error, context, request, ...args)
        return appendApiRouteHeaders(response, context)
      }

      logError(options.scope, error, buildApiLogDetails(request, context))
      return appendApiRouteHeaders(
        errorJson(
          500,
          'server_error',
          process.env.NODE_ENV === 'production'
            ? 'SERVER_ERROR'
            : getErrorMessage(error, 'Unexpected error'),
        ),
        context,
      )
    }
  }
}

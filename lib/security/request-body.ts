import { errorJson } from '@/lib/security/api-response'

const DEFAULT_MAX_BYTES = 16_384

type ReadJsonOptions = {
  maxBytes?: number
  allowEmpty?: boolean
}

type ReadTextResult =
  | { ok: true; data: string }
  | { ok: false; response: Response }

type ReadJsonResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; response: Response }

function getContentType(req: Request): string | null {
  const value = req.headers.get('content-type')
  if (!value) return null
  return value.toLowerCase()
}

function toUtf8ByteLength(input: string): number {
  return new TextEncoder().encode(input).length
}

export async function readJsonTextBody(
  req: Request,
  options?: ReadJsonOptions,
): Promise<ReadTextResult> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES
  const allowEmpty = options?.allowEmpty ?? true

  const contentType = getContentType(req)
  if (contentType && !contentType.includes('application/json')) {
    return {
      ok: false,
      response: errorJson(415, 'unsupported_media_type', 'Body must be application/json'),
    }
  }

  const declaredSize = req.headers.get('content-length')
  if (declaredSize && Number.isFinite(Number(declaredSize)) && Number(declaredSize) > maxBytes) {
    return {
      ok: false,
      response: errorJson(413, 'payload_too_large', 'Request body exceeds limit'),
    }
  }

  const raw = await req.text()
  if (toUtf8ByteLength(raw) > maxBytes) {
    return {
      ok: false,
      response: errorJson(413, 'payload_too_large', 'Request body exceeds limit'),
    }
  }

  if (!raw.trim()) {
    if (!allowEmpty) {
      return {
        ok: false,
        response: errorJson(400, 'empty_body', 'Request body is required'),
      }
    }
    return { ok: true, data: '' }
  }

  return { ok: true, data: raw }
}

export async function readJsonBody<T = unknown>(
  req: Request,
  options?: ReadJsonOptions,
): Promise<ReadJsonResult<T>> {
  const rawResult = await readJsonTextBody(req, options)
  if (!rawResult.ok) {
    return rawResult
  }

  const raw = rawResult.data
  if (!raw.trim()) {
    return { ok: true, data: {} as T }
  }

  try {
    return { ok: true, data: JSON.parse(raw) as T }
  } catch {
    return {
      ok: false,
      response: errorJson(400, 'invalid_json', 'Body must be valid JSON'),
    }
  }
}

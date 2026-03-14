import crypto from 'node:crypto'

type SecuritySignalProducerConfig = {
  secret: string
  type: string
}

export type SecuritySignalProducerAudit = {
  producerId: string | null
  producerType: string | null
  signatureVerified: boolean
  ingestVersion: string | null
}

export type VerifiedSecuritySignalProducer = {
  producerId: string
  producerType: string
  signatureVerified: true
  ingestVersion: typeof SECURITY_SIGNAL_INGEST_VERSION
}

type SecuritySignalProducerRegistry =
  | { ok: true; producers: Map<string, SecuritySignalProducerConfig> }
  | { ok: false; reason: 'disabled' | 'invalid_config' }

type SecuritySignalProducerAuthSuccess = {
  ok: true
  producer: VerifiedSecuritySignalProducer
}

type SecuritySignalProducerAuthFailure = {
  ok: false
  status: 401
  code: 'unauthorized'
  message: 'UNAUTHORIZED'
  reason:
    | 'missing_producer_id'
    | 'unknown_producer'
    | 'missing_signature'
    | 'invalid_signature'
  audit: SecuritySignalProducerAudit
}

export const SECURITY_SIGNAL_INGEST_VERSION = 'hmac-sha256-v1'

const DEFAULT_PRODUCER_TYPE = 'service'

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function extractHeader(req: Request, names: string[]): string | null {
  for (const name of names) {
    const value = normalizeString(req.headers.get(name))
    if (value) return value
  }
  return null
}

function parseProducerConfig(value: unknown): SecuritySignalProducerConfig | null {
  const secretValue = normalizeString(value)
  if (secretValue) {
    return {
      secret: secretValue,
      type: DEFAULT_PRODUCER_TYPE,
    }
  }

  const record = asRecord(value)
  if (!record) return null

  const secret = normalizeString(record.secret)
  if (!secret) return null

  return {
    secret,
    type: normalizeString(record.type) ?? DEFAULT_PRODUCER_TYPE,
  }
}

function parseProducerRegistry(raw: string): SecuritySignalProducerRegistry {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'invalid_config' }
  }

  const record = asRecord(parsed)
  if (!record) {
    return { ok: false, reason: 'invalid_config' }
  }

  const producers = new Map<string, SecuritySignalProducerConfig>()
  for (const [producerId, entry] of Object.entries(record)) {
    const normalizedProducerId = normalizeString(producerId)
    const config = parseProducerConfig(entry)
    if (!normalizedProducerId || !config) {
      return { ok: false, reason: 'invalid_config' }
    }
    producers.set(normalizedProducerId, config)
  }

  if (producers.size === 0) {
    return { ok: false, reason: 'disabled' }
  }

  return { ok: true, producers }
}

function normalizeSignature(value: string | null): Buffer | null {
  const signature = normalizeString(value)
  if (!signature) return null

  const normalized = signature.toLowerCase().startsWith('sha256=')
    ? signature.slice('sha256='.length).trim()
    : signature
  if (!/^[a-fA-F0-9]{64}$/.test(normalized)) {
    return null
  }

  return Buffer.from(normalized, 'hex')
}

function buildAudit(
  producerId: string | null,
  producerType: string | null,
  signatureVerified: boolean,
): SecuritySignalProducerAudit {
  return {
    producerId,
    producerType,
    signatureVerified,
    ingestVersion: SECURITY_SIGNAL_INGEST_VERSION,
  }
}

export function createSecuritySignalIngestSignature(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
}

export function getSecuritySignalProducerRegistry(): SecuritySignalProducerRegistry {
  const raw =
    normalizeString(process.env.SECURITY_SIGNAL_INGEST_HMAC_PRODUCERS) ??
    normalizeString(process.env.SECURITY_SIGNAL_INGEST_PRODUCERS)
  if (!raw) {
    return { ok: false, reason: 'disabled' }
  }

  return parseProducerRegistry(raw)
}

export function authenticateSecuritySignalProducer(
  req: Request,
  rawBody: string,
  producers: Map<string, SecuritySignalProducerConfig>,
): SecuritySignalProducerAuthSuccess | SecuritySignalProducerAuthFailure {
  const producerId = extractHeader(req, ['x-security-producer-id', 'x-producer-id'])
  if (!producerId) {
    return {
      ok: false,
      status: 401,
      code: 'unauthorized',
      message: 'UNAUTHORIZED',
      reason: 'missing_producer_id',
      audit: buildAudit(null, null, false),
    }
  }

  const producer = producers.get(producerId)
  if (!producer) {
    return {
      ok: false,
      status: 401,
      code: 'unauthorized',
      message: 'UNAUTHORIZED',
      reason: 'unknown_producer',
      audit: buildAudit(producerId, null, false),
    }
  }

  const providedSignature = normalizeSignature(
    extractHeader(req, ['x-security-signature', 'x-signature']),
  )
  if (!providedSignature) {
    return {
      ok: false,
      status: 401,
      code: 'unauthorized',
      message: 'UNAUTHORIZED',
      reason: 'missing_signature',
      audit: buildAudit(producerId, producer.type, false),
    }
  }

  const expectedSignature = Buffer.from(
    createSecuritySignalIngestSignature(rawBody, producer.secret),
    'hex',
  )
  if (expectedSignature.length !== providedSignature.length) {
    return {
      ok: false,
      status: 401,
      code: 'unauthorized',
      message: 'UNAUTHORIZED',
      reason: 'invalid_signature',
      audit: buildAudit(producerId, producer.type, false),
    }
  }

  if (!crypto.timingSafeEqual(expectedSignature, providedSignature)) {
    return {
      ok: false,
      status: 401,
      code: 'unauthorized',
      message: 'UNAUTHORIZED',
      reason: 'invalid_signature',
      audit: buildAudit(producerId, producer.type, false),
    }
  }

  return {
    ok: true,
    producer: {
      producerId,
      producerType: producer.type,
      signatureVerified: true,
      ingestVersion: SECURITY_SIGNAL_INGEST_VERSION,
    },
  }
}

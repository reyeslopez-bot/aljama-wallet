import crypto from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { gunzip as gunzipCallback, gzip as gzipCallback } from 'node:zlib'

const gzip = promisify(gzipCallback)
const gunzip = promisify(gunzipCallback)

const DEFAULT_INLINE_MAX_BYTES = 4 * 1024
const DEFAULT_HOT_WINDOW_MS = 60 * 60 * 1000
const DEFAULT_ARCHIVE_DIR = path.join(process.cwd(), '.data', 'wallet-signing-intents')

export type WalletSigningIntentPayloadArchivePolicy = {
  inlineMaxBytes: number
  hotWindowMs: number
}

function sanitizePathSegment(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 96)
  return normalized || fallback
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return Math.floor(parsed)
}

function resolveArchiveDir(): string {
  const configured = process.env.WALLET_SIGNING_INTENT_ARCHIVE_DIR?.trim()
  return configured ? path.resolve(configured) : DEFAULT_ARCHIVE_DIR
}

export function resolveWalletSigningIntentPayloadArchivePolicy(): WalletSigningIntentPayloadArchivePolicy {
  return {
    inlineMaxBytes: parsePositiveInteger(
      process.env.WALLET_SIGNING_INTENT_INLINE_PAYLOAD_MAX_BYTES,
      DEFAULT_INLINE_MAX_BYTES,
    ),
    hotWindowMs: parsePositiveInteger(
      process.env.WALLET_SIGNING_INTENT_INLINE_PAYLOAD_HOT_WINDOW_MS,
      DEFAULT_HOT_WINDOW_MS,
    ),
  }
}

export function measureWalletSigningIntentPayloadBytes(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8')
}

export async function archiveWalletSigningIntentPayload(input: {
  walletId: string
  chainId: number
  idempotencyKey: string
  actionType: string
  payload: unknown
}): Promise<{ payloadRef: string; payloadSizeBytes: number }> {
  const payloadJson = JSON.stringify(input.payload)
  const payloadSizeBytes = Buffer.byteLength(payloadJson, 'utf8')
  const hash = crypto.createHash('sha256').update(payloadJson).digest('hex')
  const archiveDir = path.join(
    resolveArchiveDir(),
    sanitizePathSegment(input.walletId, 'wallet'),
    sanitizePathSegment(String(input.chainId), 'chain'),
    sanitizePathSegment(input.idempotencyKey, 'idempotency'),
  )
  const fileName = `${sanitizePathSegment(input.actionType, 'intent')}-${hash.slice(0, 24)}.json.gz`
  const filePath = path.join(archiveDir, fileName)

  await mkdir(archiveDir, { recursive: true })
  await writeFile(filePath, await gzip(Buffer.from(payloadJson, 'utf8')))

  return {
    payloadRef: pathToFileURL(filePath).href,
    payloadSizeBytes,
  }
}

export async function readWalletSigningIntentPayload<T>(payloadRef: string): Promise<T> {
  const url = new URL(payloadRef)
  if (url.protocol !== 'file:') {
    throw new Error(`Unsupported wallet signing intent payload ref: ${url.protocol}`)
  }

  const compressed = await readFile(fileURLToPath(url))
  const payloadJson = (await gunzip(compressed)).toString('utf8')
  return JSON.parse(payloadJson) as T
}

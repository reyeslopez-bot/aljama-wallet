const DEFAULT_ALLOWED_SCHEMES = ['https', 'http', 'ipfs']
const DEFAULT_IPFS_GATEWAY = 'https://ipfs.io/ipfs/'

export type XrplNftMetadata = {
  name: string | null
  description: string | null
  image: string | null
  externalUrl: string | null
}

function allowedSchemes(): Set<string> {
  const raw = process.env.XRPL_NFT_METADATA_SCHEMES
  if (!raw || !raw.trim()) {
    return new Set(DEFAULT_ALLOWED_SCHEMES)
  }
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
}

function ipfsGateway(): string {
  const raw = process.env.XRPL_IPFS_GATEWAY?.trim()
  if (!raw) return DEFAULT_IPFS_GATEWAY
  return raw.endsWith('/') ? raw : `${raw}/`
}

export function decodeHexUri(uriHex: string | null | undefined): string | null {
  if (!uriHex) return null
  const trimmed = uriHex.trim()
  if (!trimmed) return null
  if (!/^[0-9a-fA-F]+$/.test(trimmed) || trimmed.length % 2 !== 0) return null
  try {
    return Buffer.from(trimmed, 'hex').toString('utf8').trim() || null
  } catch {
    return null
  }
}

function resolveMetadataUrl(rawUri: string): string | null {
  const uri = rawUri.trim()
  if (!uri) return null

  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace(/^ipfs:\/\//, '').replace(/^ipfs\//, '')
    if (!cid) return null
    return `${ipfsGateway()}${cid}`
  }

  try {
    const parsed = new URL(uri)
    if (!allowedSchemes().has(parsed.protocol.replace(':', '').toLowerCase())) {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const globalForNftMetadata = globalThis as unknown as {
  xrplNftMetadataCache?: Map<string, { data: XrplNftMetadata; expiresAt: number }>
}

const metadataCache = globalForNftMetadata.xrplNftMetadataCache ?? new Map<string, { data: XrplNftMetadata; expiresAt: number }>()
if (!globalForNftMetadata.xrplNftMetadataCache) {
  globalForNftMetadata.xrplNftMetadataCache = metadataCache
}

const CACHE_TTL_MS = 60_000

function readCache(url: string): XrplNftMetadata | null {
  const hit = metadataCache.get(url)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    metadataCache.delete(url)
    return null
  }
  return hit.data
}

function writeCache(url: string, data: XrplNftMetadata) {
  metadataCache.set(url, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

export async function fetchNftMetadata(rawUri: string | null | undefined): Promise<XrplNftMetadata | null> {
  if (!rawUri) return null
  const resolved = resolveMetadataUrl(rawUri)
  if (!resolved) return null

  const cached = readCache(resolved)
  if (cached) return cached

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2500)
    const res = await fetch(resolved, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        accept: 'application/json,text/plain,*/*',
      },
    })
    clearTimeout(timeout)
    if (!res.ok) return null

    const json = (await res.json()) as Record<string, unknown>
    const data: XrplNftMetadata = {
      name: asNullableString(json.name),
      description: asNullableString(json.description),
      image: asNullableString(json.image),
      externalUrl: asNullableString(json.external_url),
    }
    writeCache(resolved, data)
    return data
  } catch {
    return null
  }
}

export function isAllowedNftUri(rawUri: string): boolean {
  const resolved = resolveMetadataUrl(rawUri)
  return Boolean(resolved)
}

export function utf8ToHex(input: string): string {
  return Buffer.from(input, 'utf8').toString('hex').toUpperCase()
}

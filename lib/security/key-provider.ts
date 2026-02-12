import fs from 'node:fs'

export type KeySource = {
  key: Buffer
  version: number
}

function isHex(value: string): boolean {
  return /^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0
}

function parseKeyMaterial(raw: string): Buffer {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('Empty key material')

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex')
  }

  if (isHex(trimmed)) {
    return Buffer.from(trimmed, 'hex')
  }

  return Buffer.from(trimmed, 'base64')
}

function readKeyFromFile(path: string): Buffer {
  const raw = fs.readFileSync(path, 'utf8').trim()
  if (!raw) throw new Error('Empty key file')

  if (raw.startsWith('{')) {
    const parsed = JSON.parse(raw) as { key?: string; encoding?: 'hex' | 'base64' }
    if (!parsed.key) throw new Error('Invalid key file JSON')
    if (parsed.encoding === 'hex') return Buffer.from(parsed.key.trim(), 'hex')
    if (parsed.encoding === 'base64') return Buffer.from(parsed.key.trim(), 'base64')
    return parseKeyMaterial(parsed.key)
  }

  return parseKeyMaterial(raw)
}

export function loadKeyForVersion(version: number): KeySource {
  const provider = (process.env.WALLET_KEY_PROVIDER ?? 'env').toLowerCase()

  if (provider === 'file') {
    const path = process.env[`WALLET_KEY_FILE_V${version}`]
    if (!path) throw new Error(`WALLET_KEY_FILE_V${version} not set`)
    return { version, key: readKeyFromFile(path) }
  }

  if (provider !== 'env') {
    throw new Error(`Unsupported WALLET_KEY_PROVIDER: ${provider}`)
  }

  const keyHex = process.env[`WALLET_ENCRYPTION_KEY_V${version}`]
  if (!keyHex) throw new Error(`WALLET_ENCRYPTION_KEY_V${version} not set`)
  return { version, key: parseKeyMaterial(keyHex) }
}

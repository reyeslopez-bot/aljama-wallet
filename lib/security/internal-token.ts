import crypto from 'node:crypto'

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function extractToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('x-internal-token')
  if (!header) return null
  if (header.startsWith('Bearer ')) return header.slice(7).trim()
  return header.trim()
}

export function hasValidInternalToken(req: Request, expected?: string | null): boolean {
  if (!expected) return false
  const token = extractToken(req)
  if (!token) return false
  return safeEqual(token, expected)
}

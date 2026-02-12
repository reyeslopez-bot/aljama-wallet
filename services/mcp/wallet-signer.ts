// services/mcp/wallet-signer.ts

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { z } from 'zod'
import { Transaction, Wallet, verifyMessage } from 'ethers'
import { prismaCrdb } from '@/lib/prisma-crdb'
import { decryptPrivateKey } from '@/lib/crypto/wallet-crypto'
import crypto from 'node:crypto'

const requestSchema = z.object({
  tool: z.enum(['wallet.signTx', 'wallet.deriveAddress', 'wallet.verifySignature']),
  input: z.record(z.string(), z.unknown()),
})
type RequestTool = z.infer<typeof requestSchema>['tool']

const signTxSchema = z.object({
  walletId: z.string().min(3),
  chainId: z.number().int().positive(),
  tx: z.record(z.string(), z.unknown()),
})

const deriveAddressSchema = z.object({
  walletId: z.string().min(3),
  path: z.string().optional(), // reserved for future HD wallets
})

const verifySignatureSchema = z.object({
  message: z.string(),
  signature: z.string(),
  address: z.string(),
})

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

function extractHeader(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name.toLowerCase()]
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function assertAuthorized(req: IncomingMessage): boolean {
  const expected = process.env.MCP_WALLET_SIGNER_TOKEN ?? process.env.MCP_INTERNAL_TOKEN
  if (!expected) return process.env.NODE_ENV !== 'production'

  const header =
    extractHeader(req, 'authorization') ??
    extractHeader(req, 'x-internal-token')
  if (!header) return false
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim()
  if (!token) return false
  return safeEqual(token, expected)
}

function ensure0xHex(pk: string): string {
  const trimmed = pk.trim()
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`
}

async function getDecryptedWallet(walletId: string) {
  const record = await prismaCrdb.wallet.findUnique({
    where: { id: walletId },
    select: {
      id: true,
      encryptedPrivateKey: true,
      encryptionIv: true,
      keyVersion: true,
      address: true,
    },
  })

  if (!record) throw new Error('WALLET_NOT_FOUND')

  // Prisma Bytes usually come back as Uint8Array; convert to Buffer for your decrypt fn
  const encrypted = Buffer.from(record.encryptedPrivateKey)
  const iv = Buffer.from(record.encryptionIv)

  const privateKey = decryptPrivateKey(encrypted, iv, record.keyVersion, { address: record.address })
  return new Wallet(ensure0xHex(privateKey))
}

async function signTx(input: z.infer<typeof signTxSchema>) {
  const wallet = await getDecryptedWallet(input.walletId)

  const signedTx = await wallet.signTransaction({ ...input.tx, chainId: input.chainId })
  const txHash = Transaction.from(signedTx).hash ?? ''

  return { signedTx, txHash }
}

async function deriveAddress(input: z.infer<typeof deriveAddressSchema>) {
  // path currently unused (non-HD). Keep it for future API stability.
  void input.path

  const wallet = await getDecryptedWallet(input.walletId)
  return { address: wallet.address }
}

async function verifySignatureTool(input: z.infer<typeof verifySignatureSchema>) {
  const recovered = verifyMessage(input.message, input.signature)
  return { ok: recovered.toLowerCase() === input.address.toLowerCase() }
}

// ---------- typed tool registry ----------

type AnyTool = {
  schema: z.ZodTypeAny
  handler: (input: unknown) => Promise<unknown>
}

function defineTool<S extends z.ZodTypeAny, Out>(tool: {
  schema: S
  handler: (input: z.infer<S>) => Promise<Out>
}): AnyTool {
  return tool as AnyTool
}

const toolHandlers: Record<RequestTool, AnyTool> = {
  'wallet.signTx': defineTool({
    schema: signTxSchema,
    handler: signTx,
  }),
  'wallet.deriveAddress': defineTool({
    schema: deriveAddressSchema,
    handler: deriveAddress,
  }),
  'wallet.verifySignature': defineTool({
    schema: verifySignatureSchema,
    handler: verifySignatureTool,
  }),
}

// ---------- server ----------

export function startWalletSignerServer() {
  const port = Number(process.env.MCP_WALLET_SIGNER_PORT ?? 4011)

  const server = createServer(async (req, res) => {
    if (!assertAuthorized(req)) {
      sendJson(res, 401, { error: 'UNAUTHORIZED' })
      return
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' })
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))

    try {
      const payload = requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      const tool = toolHandlers[payload.tool]
      if (!tool) {
        sendJson(res, 400, { error: 'UNKNOWN_TOOL' })
        return
      }

      const parsedInput = tool.schema.parse(payload.input)
      const output = await tool.handler(parsedInput)
      sendJson(res, 200, { tool: payload.tool, output })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'INVALID_REQUEST'
      sendJson(res, 400, { error: message })
    }
  })

  server.listen(port)
  return server
}

if (process.env.MCP_WALLET_SIGNER_AUTO_START === 'true') {
  startWalletSignerServer()
}

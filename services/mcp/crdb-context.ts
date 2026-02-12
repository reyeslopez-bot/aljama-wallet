// services/mcp/crdb-context.ts

// services/mcp/crdb-context.ts

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { z } from 'zod'
import { prismaCrdb } from '@/lib/prisma-crdb'
import crypto from 'node:crypto'

const requestSchema = z.object({
  tool: z.enum(['wallet.getState', 'wallet.getLimits']),
  input: z.record(z.string(), z.unknown()),
})
type RequestTool = z.infer<typeof requestSchema>['tool']

const walletStateSchema = z.object({
  walletId: z.string().min(3),
  chainId: z.number().int().positive(),
})

const walletLimitsSchema = z.object({
  walletId: z.string().min(3),
  chainId: z.number().int().positive(),
})

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

// Minimal internal auth gate. Set MCP_INTERNAL_TOKEN in env.
// If you don’t want auth, keep it unset (dev mode), but do NOT expose this port publicly.
function assertAuthorized(req: IncomingMessage): boolean {
  const expected = process.env.MCP_INTERNAL_TOKEN
  if (!expected) return process.env.NODE_ENV !== 'production'
  const raw = req.headers['authorization'] ?? req.headers['x-internal-token']
  const header = Array.isArray(raw) ? raw[0] : raw
  if (!header) return false
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim()
  if (!token) return false

  const bufA = Buffer.from(token)
  const bufB = Buffer.from(expected)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

async function getWalletState(input: z.infer<typeof walletStateSchema>) {
  const chainKey = String(input.chainId)

  const [sentCount, sentByAsset, receivedByAsset, lastTx] = await Promise.all([
    prismaCrdb.transaction.count({
      where: { fromWalletId: input.walletId, blockchain: chainKey },
    }),
    prismaCrdb.transaction.groupBy({
      by: ['asset'],
      where: { fromWalletId: input.walletId, blockchain: chainKey },
      _sum: { valueWei: true },
    }),
    prismaCrdb.transaction.groupBy({
      by: ['asset'],
      where: { toWalletId: input.walletId, blockchain: chainKey },
      _sum: { valueWei: true },
    }),
    prismaCrdb.transaction.findFirst({
      where: {
        blockchain: chainKey,
        OR: [{ fromWalletId: input.walletId }, { toWalletId: input.walletId }],
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const balances = new Map<string, bigint>()

  for (const row of receivedByAsset) {
    const value = (row._sum?.valueWei ?? 0n) as bigint
    balances.set(row.asset, (balances.get(row.asset) ?? 0n) + value)
  }

  for (const row of sentByAsset) {
    const value = (row._sum?.valueWei ?? 0n) as bigint
    balances.set(row.asset, (balances.get(row.asset) ?? 0n) - value)
  }

  return {
    walletId: input.walletId,
    chainId: input.chainId,
    sentCount,
    balances: Object.fromEntries(
      Array.from(balances.entries()).map(([asset, amountWei]) => [asset, amountWei.toString()]),
    ),
    lastTx: lastTx
      ? {
          id: lastTx.id,
          fromWalletId: lastTx.fromWalletId,
          toWalletId: lastTx.toWalletId,
          valueWei: lastTx.valueWei.toString(),
          asset: lastTx.asset,
          createdAt: lastTx.createdAt.toISOString(),
        }
      : null,
  }
}

async function getWalletLimits(input: z.infer<typeof walletLimitsSchema>) {
  const chainKey = String(input.chainId)

  const dailyLimitWei = BigInt(process.env.WALLET_DAILY_LIMIT_WEI ?? '0')
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const spentToday = await prismaCrdb.transaction.aggregate({
    where: { fromWalletId: input.walletId, blockchain: chainKey, createdAt: { gte: since } },
    _sum: { valueWei: true },
  })

  const spentTodayWei = (spentToday._sum?.valueWei ?? 0n) as bigint

  return {
    walletId: input.walletId,
    chainId: input.chainId,
    dailyLimitWei: dailyLimitWei.toString(),
    spentTodayWei: spentTodayWei.toString(),
    remainingWei: (dailyLimitWei - spentTodayWei).toString(),
  }
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
  'wallet.getState': defineTool({
    schema: walletStateSchema,
    handler: getWalletState,
  }),
  'wallet.getLimits': defineTool({
    schema: walletLimitsSchema,
    handler: getWalletLimits,
  }),
}

// ---------- server ----------

export function startCrdbContextServer() {
  const port = Number(process.env.MCP_CRDB_CONTEXT_PORT ?? 4012)

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

if (process.env.MCP_CRDB_CONTEXT_AUTO_START === 'true') {
  startCrdbContextServer()
}

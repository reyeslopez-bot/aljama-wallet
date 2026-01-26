// services/mcp/crdb-context.ts

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { z } from 'zod'
import { prismaPg } from '@/lib/prisma-pg'

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
  if (!expected) return true
  const got = req.headers['authorization']
  return got === `Bearer ${expected}`
}

function hasPgConfigured(): boolean {
  if (process.env.CI === 'true') return false

  const pgUrl =
    process.env.PG_DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL_PG

  return Boolean(pgUrl)
}

/**
 * IMPORTANT:
 * Your current PG Prisma schema only has:
 * - Wallet
 * - DailyTransactionSummary
 *
 * There is NO Transaction model in PG, so we cannot compute:
 * - sent/received counts per wallet
 * - balances per asset
 * - lastTx
 *
 * This implementation returns the available summary info, and keeps the API stable.
 */
async function getWalletState(input: z.infer<typeof walletStateSchema>) {
  void input.chainId // reserved for future multi-chain summaries in PG schema

  if (!hasPgConfigured()) {
    return {
      walletId: input.walletId,
      chainId: input.chainId,
      sentCount: 0,
      balances: {},
      lastTx: null,
      summariesLast7Days: [],
      note: 'PG_NOT_CONFIGURED',
    }
  }

  // Latest 7 daily summaries (global). If you later add walletId/chainId fields,
  // adjust the where clause accordingly.
  const last7 = await prismaPg.dailyTransactionSummary.findMany({
    orderBy: { day: 'desc' },
    take: 7,
    select: { day: true, count: true },
  })

  return {
    walletId: input.walletId,
    chainId: input.chainId,
    // Not derivable from current schema; keep fields but return defaults.
    sentCount: 0,
    balances: {},
    lastTx: null,

    summariesLast7Days: last7.map((r) => ({
      day: r.day.toISOString(),
      count: r.count,
    })),
  }
}

async function getWalletLimits(input: z.infer<typeof walletLimitsSchema>) {
  void input.chainId // reserved for future chain-specific limits

  const dailyLimitWei = BigInt(process.env.WALLET_DAILY_LIMIT_WEI ?? '0')

  if (!hasPgConfigured()) {
    return {
      walletId: input.walletId,
      chainId: input.chainId,
      dailyLimitWei: dailyLimitWei.toString(),
      spentTodayWei: '0',
      remainingWei: dailyLimitWei.toString(),
      note: 'PG_NOT_CONFIGURED',
    }
  }

  // With current schema we only have counts, not valueWei.
  // So we cannot compute "spentTodayWei". Keep stable fields and return 0.
  return {
    walletId: input.walletId,
    chainId: input.chainId,
    dailyLimitWei: dailyLimitWei.toString(),
    spentTodayWei: '0',
    remainingWei: dailyLimitWei.toString(),
    note: 'NO_PG_TRANSACTION_MODEL',
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
import { createServer, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { prismaCrdb } from '@/lib/prisma-crdb';

const requestSchema = z.object({
  tool: z.enum(['wallet.getState', 'wallet.getLimits']),
  input: z.record(z.string(), z.unknown()),
});

const walletStateSchema = z.object({
  walletId: z.string().min(3),
  chainId: z.number().int().positive(),
});

const walletLimitsSchema = z.object({
  userId: z.string().min(3),
});

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function getWalletState(input: z.infer<typeof walletStateSchema>) {
  const chainKey = String(input.chainId);
  const prisma = prismaCrdb();

  const [nonce, sentByAsset, receivedByAsset, lastTx] = await Promise.all([
    prisma.transaction.count({
      where: { fromWalletId: input.walletId, blockchain: chainKey },
    }),
    prisma.transaction.groupBy({
      by: ['asset'],
      where: { fromWalletId: input.walletId, blockchain: chainKey },
      _sum: { value: true },
    }),
    prisma.transaction.groupBy({
      by: ['asset'],
      where: { toWalletId: input.walletId, blockchain: chainKey },
      _sum: { value: true },
    }),
    prisma.transaction.findFirst({
      where: {
        blockchain: chainKey,
        OR: [{ fromWalletId: input.walletId }, { toWalletId: input.walletId }],
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const balances = new Map<string, number>();

  for (const row of receivedByAsset) {
    const value = row._sum.value ?? 0;
    balances.set(row.asset, (balances.get(row.asset) ?? 0) + value);
  }

  for (const row of sentByAsset) {
    const value = row._sum.value ?? 0;
    balances.set(row.asset, (balances.get(row.asset) ?? 0) - value);
  }

  return {
    walletId: input.walletId,
    chainId: input.chainId,
    nonce,
    balances: Object.fromEntries(
      Array.from(balances.entries()).map(([asset, amount]) => [asset, amount.toString()])
    ),
    lastTx: lastTx
      ? {
          id: lastTx.id,
          fromWalletId: lastTx.fromWalletId,
          toWalletId: lastTx.toWalletId,
          value: lastTx.value.toString(),
          asset: lastTx.asset,
          createdAt: lastTx.createdAt.toISOString(),
        }
      : null,
  };
}

async function getWalletLimits(input: z.infer<typeof walletLimitsSchema>) {
  const prisma = prismaCrdb();
  const dailyLimitWei = BigInt(process.env.WALLET_DAILY_LIMIT_WEI ?? '0');
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const spentToday = await prisma.transaction.aggregate({
    where: { fromWalletId: input.userId, createdAt: { gte: since } },
    _sum: { value: true },
  });

  const spentTodayWei = BigInt(Math.trunc(spentToday._sum.value ?? 0)).toString();

  return {
    userId: input.userId,
    dailyLimitWei: dailyLimitWei.toString(),
    spentTodayWei,
  };
}

export function startCrdbContextServer() {
  const port = Number(process.env.MCP_CRDB_CONTEXT_PORT ?? 4012);

  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));

    try {
      const payload = requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));

      if (payload.tool === 'wallet.getState') {
        const input = walletStateSchema.parse(payload.input);
        const output = await getWalletState(input);
        sendJson(res, 200, { tool: payload.tool, output });
        return;
      }

      if (payload.tool === 'wallet.getLimits') {
        const input = walletLimitsSchema.parse(payload.input);
        const output = await getWalletLimits(input);
        sendJson(res, 200, { tool: payload.tool, output });
        return;
      }

      sendJson(res, 400, { error: 'UNKNOWN_TOOL' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'INVALID_REQUEST';
      sendJson(res, 400, { error: message });
    }
  });

  server.listen(port);
  return server;
}

if (process.env.MCP_CRDB_CONTEXT_AUTO_START === 'true') {
  startCrdbContextServer();
}

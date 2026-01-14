// services/mcp/wallet-signer.ts
import { createServer, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { Transaction, Wallet, verifyMessage } from 'ethers';
import { prismaCrdb } from '@/lib/prisma-crdb';

const requestSchema = z.object({
  tool: z.enum(['wallet.signTx', 'wallet.deriveAddress', 'wallet.verifySignature']),
  input: z.record(z.string(), z.unknown()),
});
type RequestTool = z.infer<typeof requestSchema>['tool'];

const signTxSchema = z.object({
  walletId: z.string().min(3),
  chainId: z.number().int().positive(),
  tx: z.record(z.string(), z.unknown()),
});

const deriveAddressSchema = z.object({
  walletId: z.string().min(3),
  path: z.string().optional(),
});

const verifySignatureSchema = z.object({
  message: z.string(),
  signature: z.string(),
  address: z.string(),
});

async function signTx(input: z.infer<typeof signTxSchema>) {
  const walletRecord = await prismaCrdb().wallet.findUnique({
    where: { id: input.walletId },
  });
  if (!walletRecord) throw new Error('WALLET_NOT_FOUND');

  const wallet = new Wallet(walletRecord.privateKey);
  const signedTx = await wallet.signTransaction({ ...input.tx, chainId: input.chainId });
  const txHash = Transaction.from(signedTx).hash ?? '';

  return { signedTx, txHash };
}

async function deriveAddress(input: z.infer<typeof deriveAddressSchema>) {
  const walletRecord = await prismaCrdb().wallet.findUnique({
    where: { id: input.walletId },
  });
  if (!walletRecord) throw new Error('WALLET_NOT_FOUND');

  const wallet = new Wallet(walletRecord.privateKey);
  return { address: wallet.address };
}

async function verifySignatureTool(input: z.infer<typeof verifySignatureSchema>) {
  const recovered = verifyMessage(input.message, input.signature);
  return { ok: recovered.toLowerCase() === input.address.toLowerCase() };
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

// ---------- typed tool registry ----------

type AnyTool = {
  schema: z.ZodTypeAny;
  handler: (input: unknown) => Promise<unknown>;
};

function defineTool<S extends z.ZodTypeAny, Out>(tool: {
  schema: S;
  handler: (input: z.infer<S>) => Promise<Out>;
}): AnyTool {
  return tool as AnyTool;
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
};

// ---------- server ----------

export function startWalletSignerServer() {
  const port = Number(process.env.MCP_WALLET_SIGNER_PORT ?? 4011);

  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));

    try {
      const payload = requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      const tool = toolHandlers[payload.tool];
      if (!tool) {
        sendJson(res, 400, { error: 'UNKNOWN_TOOL' });
        return;
      }

      const input = tool.schema.parse(payload.input);
      const output = await tool.handler(input);
      sendJson(res, 200, { tool: payload.tool, output });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'INVALID_REQUEST';
      sendJson(res, 400, { error: message });
    }
  });

  server.listen(port);
  return server;
}

if (process.env.MCP_WALLET_SIGNER_AUTO_START === 'true') {
  startWalletSignerServer();
}

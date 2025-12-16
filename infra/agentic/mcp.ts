import { z } from 'zod';
import { correlationIdSchema, identityContextSchema, isoDateTimeSchema } from './base';

export const contextServerSchema = z.object({
  name: z.enum([
    'cockroach-wallet-context',
    'pg-olap-context',
    'files-context',
  ]),
  readOnly: z.boolean().default(true),
  capabilities: z.array(z.string()),
  endpoint: z.string().url(),
});

export const walletToolsSchema = {
  signTx: {
    input: z.object({ unsignedPayloadHex: z.string(), chainId: z.string() }),
    output: z.object({ signedPayloadHex: z.string(), publicKey: z.string() }),
  },
  deriveAddress: {
    input: z.object({ derivationPath: z.string(), curve: z.enum(['secp256k1', 'ed25519']) }),
    output: z.object({ address: z.string(), publicKey: z.string() }),
  },
  verifySignature: {
    input: z.object({ message: z.string(), signature: z.string(), publicKey: z.string() }),
    output: z.object({ valid: z.boolean() }),
  },
} as const;

export const contextReadSchemas = {
  walletState: z.object({ address: z.string(), balance: z.string(), nonce: z.number().int() }),
  walletLimits: z.object({ daily: z.string(), perTx: z.string() }),
  anomalies: z.array(z.object({
    id: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
    detectedAt: isoDateTimeSchema,
    reason: z.string(),
  })),
};

export const mcpToolCallSchema = z.object({
  correlationId: correlationIdSchema,
  actor: identityContextSchema,
  server: contextServerSchema,
  tool: z.union([
    z.literal('signTx'),
    z.literal('deriveAddress'),
    z.literal('verifySignature'),
    z.literal('readContext'),
  ]),
  schemaVersion: z.string(),
  input: z.record(z.any()),
});

export const mcpToolResultSchema = z.object({
  correlationId: correlationIdSchema,
  serverName: contextServerSchema.shape.name,
  tool: mcpToolCallSchema.shape.tool,
  output: z.record(z.any()),
  emittedAt: isoDateTimeSchema,
});

export type ContextServer = z.infer<typeof contextServerSchema>;

import { z } from 'zod';
import { auditLogSchema, toolCallSchema } from './orchestrator';
import { transferIntentSchema } from './wallet-intents';
import { correlationIdSchema, identityContextSchema, isoDateTimeSchema } from './base';

export const kafkaTopics = {
  walletTxIntent: 'wallet.tx.intent',
  walletTxSigned: 'wallet.tx.signed',
  walletTxBroadcast: 'wallet.tx.broadcast',
  walletTxConfirmed: 'wallet.tx.confirmed',
  auditLog: 'audit.log',
  alertsSecurity: 'alerts.security',
  orchestratorPlan: 'agent.plan',
  orchestratorToolCall: 'agent.toolcall',
} as const;

export const walletTopicsV1 = {
  intent: 'wallet.tx.intent.v1',
  approved: 'wallet.tx.approved.v1',
  signed: 'wallet.tx.signed.v1',
  broadcast: 'wallet.tx.broadcast.v1',
  confirmed: 'wallet.tx.confirmed.v1',
  audit: 'audit.append.v1',
  dlqWallet: 'dlq.wallet.*',
} as const;

export const walletIntentEventSchema = z.object({
  correlationId: correlationIdSchema,
  actor: identityContextSchema,
  to: z.string(),
  amount: z.string(),
  chain: z.string(),
  nonce: z.number().int(),
  policyDecision: z.enum(['allow', 'deny']),
  reason: z.string(),
  createdAt: isoDateTimeSchema,
});

export const walletSignedEventSchema = z.object({
  correlationId: correlationIdSchema,
  actorId: identityContextSchema.shape.userId,
  signedPayloadHex: z.string(),
  chain: z.string(),
  createdAt: isoDateTimeSchema,
});

export const walletTxIntentV1Schema = z.object({
  topic: z.literal(walletTopicsV1.intent),
  correlationId: correlationIdSchema,
  createdAt: isoDateTimeSchema,
  intent: transferIntentSchema,
});

export const walletTxApprovedV1Schema = z.object({
  topic: z.literal(walletTopicsV1.approved),
  correlationId: correlationIdSchema,
  idempotencyKey: z.string().uuid(),
  approvedBy: identityContextSchema,
  approvedAt: isoDateTimeSchema,
  intent: transferIntentSchema,
});

export const walletTxSignedV1Schema = z.object({
  topic: z.literal(walletTopicsV1.signed),
  correlationId: correlationIdSchema,
  idempotencyKey: z.string().uuid(),
  chainId: z.number().int().positive(),
  walletId: z.string(),
  signedTx: z.string(),
  txHash: z.string(),
  createdAt: isoDateTimeSchema,
});

export const walletTxBroadcastV1Schema = z.object({
  topic: z.literal(walletTopicsV1.broadcast),
  correlationId: correlationIdSchema,
  chainId: z.number().int().positive(),
  txHash: z.string(),
  createdAt: isoDateTimeSchema,
});

export const walletTxConfirmedV1Schema = z.object({
  topic: z.literal(walletTopicsV1.confirmed),
  correlationId: correlationIdSchema,
  chainId: z.number().int().positive(),
  txHash: z.string(),
  status: z.enum(['success', 'reverted']),
  blockNumber: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
});

export const auditAppendV1Schema = z.object({
  topic: z.literal(walletTopicsV1.audit),
  correlationId: correlationIdSchema,
  entryHash: z.string(),
  prevHash: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: isoDateTimeSchema,
});

export const auditEventSchema = auditLogSchema.extend({
  topic: z.literal(kafkaTopics.auditLog),
});

export const toolCallEventSchema = toolCallSchema.extend({
  topic: z.literal(kafkaTopics.orchestratorToolCall),
});

export const kafkaEventEnvelopeSchema = z.discriminatedUnion('topic', [
  auditEventSchema,
  toolCallEventSchema,
  walletIntentEventSchema.extend({ topic: z.literal(kafkaTopics.walletTxIntent) }),
  walletSignedEventSchema.extend({ topic: z.literal(kafkaTopics.walletTxSigned) }),
  walletTxIntentV1Schema,
  walletTxApprovedV1Schema,
  walletTxSignedV1Schema,
  walletTxBroadcastV1Schema,
  walletTxConfirmedV1Schema,
  auditAppendV1Schema,
]);

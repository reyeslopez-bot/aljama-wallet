import { z } from 'zod';
import { auditLogSchema, toolCallSchema } from './orchestrator';
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
]);

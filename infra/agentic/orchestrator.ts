import { z } from 'zod';
import {
  correlationIdSchema,
  identityContextSchema,
  isoDateTimeSchema,
  requestHashSchema,
} from './base';

export const planStepSchema = z.object({
  stepId: z.string(),
  targetTool: z.string(),
  capability: z.string(),
  justificationChunkIds: z.array(z.string()).min(1),
  estimatedTokens: z.number().int().positive().optional(),
  unsafeWrite: z.boolean().default(false),
});

export const planSchema = z.object({
  correlationId: correlationIdSchema,
  requestHash: requestHashSchema,
  actor: identityContextSchema,
  createdAt: isoDateTimeSchema,
  steps: z.array(planStepSchema).min(1),
  auditTags: z.array(z.string()).default([]),
});

export const actionIntentSchema = z.object({
  correlationId: correlationIdSchema,
  planStepId: z.string(),
  toolName: z.string(),
  toolVersion: z.string(),
  input: z.record(z.any()),
  idempotencyKey: z.string().uuid().optional(),
  requiresWrite: z.boolean().default(false),
});

export const executionPolicySchema = z.object({
  allowed: z.boolean(),
  reason: z.string(),
  budgetRemaining: z.number().int().nonnegative().optional(),
  riskScore: z.number().min(0).max(1).optional(),
});

export const toolCallSchema = z.object({
  correlationId: correlationIdSchema,
  actor: identityContextSchema,
  intent: actionIntentSchema,
  policy: executionPolicySchema,
  executionWindowMs: z.number().int().positive().default(30000),
  redacted: z.boolean().default(true),
});

export const auditLogSchema = z.object({
  correlationId: correlationIdSchema,
  requestHash: requestHashSchema,
  actor: identityContextSchema,
  plan: planSchema.pick({ steps: true }),
  toolCall: toolCallSchema.optional(),
  retrievedChunks: z.array(z.object({ id: z.string(), sourceId: z.string() })).optional(),
  decision: z.enum(['allow', 'deny', 'error']),
  reason: z.string(),
  schemaVersion: z.string(),
  createdAt: isoDateTimeSchema,
});

export type Plan = z.infer<typeof planSchema>;
export type ActionIntent = z.infer<typeof actionIntentSchema>;
export type ToolCall = z.infer<typeof toolCallSchema>;

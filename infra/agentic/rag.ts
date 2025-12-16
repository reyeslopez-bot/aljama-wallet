import { z } from 'zod';
import { correlationIdSchema, isoDateTimeSchema, requestHashSchema } from './base';

export const ragChunkSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  sourceType: z.enum(['policy', 'doc', 'code', 'faq']),
  timestamp: isoDateTimeSchema,
  tokens: z.number().int().positive(),
  text: z.string(),
});

export const ragRetrievalPolicy = {
  topKMin: 6,
  topKMax: 12,
  maxTokensPerChunk: 512,
  maxAgeDays: 45,
};

export const ragRequestSchema = z.object({
  correlationId: correlationIdSchema,
  requestHash: requestHashSchema,
  query: z.string(),
  sourceAllowlist: z.array(z.string()).optional(),
});

export const ragResponseSchema = z.object({
  correlationId: correlationIdSchema,
  requestHash: requestHashSchema,
  retrievedAt: isoDateTimeSchema,
  chunks: z
    .array(ragChunkSchema)
    .min(ragRetrievalPolicy.topKMin)
    .max(ragRetrievalPolicy.topKMax),
});

export type RagChunk = z.infer<typeof ragChunkSchema>;

import { z } from 'zod';

export const environmentEnum = z.enum(['dev', 'staging', 'prod']);
export const riskTierEnum = z.enum(['low', 'medium', 'high', 'blocked']);

export const correlationIdSchema = z.string().min(1).max(128);
export const requestHashSchema = z.string().min(32);
export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const identityContextSchema = z.object({
  userId: z.string(),
  role: z.string(),
  orgId: z.string(),
  environment: environmentEnum,
  riskTier: riskTierEnum,
});

export type IdentityContext = z.infer<typeof identityContextSchema>;

import { z } from 'zod';

export const transferIntentSchema = z.object({
  type: z.literal('Transfer'),
  chainId: z.number().int().positive(),
  fromWalletId: z.string().min(3),
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amountWei: z.string().regex(/^\d+$/),
  maxFeePerGasWei: z.string().regex(/^\d+$/).optional(),
  nonce: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
  correlationId: z.string().min(1).max(128),
});

export type TransferIntent = z.infer<typeof transferIntentSchema>;

export function parseTransferIntent(input: unknown) {
  return transferIntentSchema.parse(input);
}

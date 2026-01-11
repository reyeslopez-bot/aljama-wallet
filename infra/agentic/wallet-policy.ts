import { transferIntentSchema, type TransferIntent } from './wallet-intents';

export type TransferPolicyContext = {
  userId: string;
  role: 'user' | 'admin';
  dailyLimitWei: bigint;
  spentTodayWei: bigint;
  allowChains: Set<number>;
  idempotencyKeys?: Set<string>;
};

export function approveTransfer(input: unknown, ctx: TransferPolicyContext): TransferIntent {
  const intent = transferIntentSchema.parse(input);

  if (!ctx.allowChains.has(intent.chainId)) throw new Error('CHAIN_DENIED');
  if (ctx.idempotencyKeys?.has(intent.idempotencyKey)) throw new Error('IDEMPOTENCY_REPLAY');

  const amountWei = BigInt(intent.amountWei);
  if (ctx.spentTodayWei + amountWei > ctx.dailyLimitWei) throw new Error('LIMIT');

  return intent;
}

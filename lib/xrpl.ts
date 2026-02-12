// lib/xrpl.ts
import { getXrplClient, createXrplWalletFromSeed } from '@/infra/xrpl/client'
import { getErrorMessage } from '@/lib/security/errors'

export type XrplDevAccount =
  | { address: string; funded: true; xrpBalance: string }
  | { address: string; funded: false; xrpBalance: "0"; needsFunding: true }

export async function getDevXrplAccount(): Promise<XrplDevAccount> {
  const seed = process.env.XRPL_DEV_SEED
  if (!seed) {
    throw new Error('Missing XRPL dev seed in process.env.XRPL_DEV_SEED')
  }

  const client = await getXrplClient()
  const wallet = createXrplWalletFromSeed(seed)

  try {
    const balance = await client.getXrpBalance(wallet.address)
    const balanceStr =
      typeof balance === 'string' ? balance : balance.toString()

    return {
      address: wallet.address,
      funded: true,
      xrpBalance: balanceStr,
    }
  } catch (e: unknown) {
    const msg = getErrorMessage(e, String(e))

    if (msg.includes('Account not found')) {
      return {
        address: wallet.address,
        funded: false,
        xrpBalance: "0",
        needsFunding: true,
      }
    }

    throw e
  }
}

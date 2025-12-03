// lib/xrpl.ts
import { getXrplClient, createXrplWalletFromSeed } from '@/infra/xrpl/client'

export type XrplDevAccount = {
  address: string
  xrpBalance: string
}

export async function getDevXrplAccount(): Promise<XrplDevAccount> {
  const seed = process.env.XRPL_DEV_SEED
  if (!seed) {
    throw new Error('Missing XRPL dev seed in process.env.XRPL_DEV_SEED')
  }

  const client = await getXrplClient()
  const wallet = createXrplWalletFromSeed(seed)

  const balance = await client.getXrpBalance(wallet.address)
  const balanceStr = typeof balance === 'string' ? balance : balance.toString()

  return {
    address: wallet.address,
    xrpBalance: balanceStr,
  }
}

// lib/xrpl.ts
import { getXrplClient, createXrplWalletFromSeed } from '@/infra/xrpl/client'

const DEFAULT_DEV_SEED_ENV = 'XRPL_DEV_SEED'

export type XrplDevAccount = {
  address: string
  xrpBalance: string
}

export async function getDevXrplAccount(
  seedEnvVar: string = DEFAULT_DEV_SEED_ENV,
): Promise<XrplDevAccount> {
  const seed = process.env[seedEnvVar]
  if (!seed) {
    throw new Error(`Missing XRPL dev seed in process.env.${seedEnvVar}`)
  }

  const client = await getXrplClient()
  const wallet = createXrplWalletFromSeed(seed)

  const balances = await client.getXrpBalance(wallet.address)
  // getXrpBalance returns a string in XRP

  return {
    address: wallet.address,
    xrpBalance: balances,
  }
}

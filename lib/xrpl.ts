import { getXrplClient, createXrplWalletFromSeed } from '@/infra/xrpl/client'
import { getErrorMessage } from '@/lib/security/errors'
import type { XrplKeyType } from '@/lib/signing/types'
import { type XrplNetworkId, DEFAULT_XRPL_NETWORK_ID } from '@/lib/xrpl-networks'

export type XrplDevAccount =
  | { address: string; funded: true; xrpBalance: string }
  | { address: string; funded: false; xrpBalance: "0"; needsFunding: true }

function getDevXrplKeyType(): XrplKeyType {
  const raw = process.env.XRPL_DEV_KEY_TYPE ?? process.env.XRPL_SIGNER_KEY_TYPE
  return raw?.trim().toLowerCase() === 'secp256k1' ? 'secp256k1' : 'ed25519'
}

export async function getDevXrplAccount(networkId: XrplNetworkId = DEFAULT_XRPL_NETWORK_ID): Promise<XrplDevAccount> {
  const seed = process.env.XRPL_DEV_SEED
  if (!seed) {
    throw new Error('Missing XRPL dev seed in process.env.XRPL_DEV_SEED')
  }

  const client = await getXrplClient(networkId)
  const wallet = createXrplWalletFromSeed(seed, getDevXrplKeyType())

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

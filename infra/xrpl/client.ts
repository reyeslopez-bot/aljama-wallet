// infra/xrpl/client.ts
import { Client, Wallet } from 'xrpl'
import {
  DEFAULT_XRPL_NETWORK_ID,
  resolveXrplNetwork,
  type XrplNetworkId,
} from '@/lib/xrpl-networks'

const clients = new Map<XrplNetworkId, Client>()

export async function getXrplClient(networkId: XrplNetworkId = DEFAULT_XRPL_NETWORK_ID): Promise<Client> {
  const network = resolveXrplNetwork(networkId)
  const existing = clients.get(network.id)
  if (existing && existing.isConnected()) return existing

  const client = new Client(network.wsUrl)
  await client.connect()
  clients.set(network.id, client)
  return client
}

export function createXrplWalletFromSeed(seed: string): Wallet {
  return Wallet.fromSeed(seed)
}

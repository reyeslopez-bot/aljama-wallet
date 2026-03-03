// infra/xrpl/client.ts
import { Client, ECDSA, Wallet } from 'xrpl'
import {
  DEFAULT_XRPL_NETWORK_ID,
  resolveXrplNetwork,
  type XrplNetworkId,
} from '@/lib/xrpl-networks'
import type { XrplKeyType } from '@/lib/signing/types'

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

function toXrplAlgorithm(keyType: XrplKeyType): ECDSA {
  return keyType === 'secp256k1' ? ECDSA.secp256k1 : ECDSA.ed25519
}

export function createXrplWalletFromSeed(seed: string, keyType: XrplKeyType): Wallet {
  return Wallet.fromSeed(seed, { algorithm: toXrplAlgorithm(keyType) })
}

export async function resetXrplClientsForTests(): Promise<void> {
  const disconnects = Array.from(clients.values()).map(async (client) => {
    try {
      if (client.isConnected()) {
        await client.disconnect()
      }
    } catch {
      // best effort test cleanup
    }
  })
  await Promise.all(disconnects)
  clients.clear()
}

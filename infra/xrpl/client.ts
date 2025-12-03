// infra/xrpl/client.ts
import { Client, Wallet } from 'xrpl'

let client: Client | null = null

export async function getXrplClient(): Promise<Client> {
  if (client && client.isConnected()) return client

  const url = process.env.XRPL_RPC_URL ?? 'wss://s.altnet.rippletest.net:51233'
  client = new Client(url)
  await client.connect()
  return client
}

export function createXrplWalletFromSeed(seed: string): Wallet {
  return Wallet.fromSeed(seed)
}

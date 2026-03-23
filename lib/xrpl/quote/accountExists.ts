import type { Client } from 'xrpl'
import { isXrplAccountNotFoundError } from '@/lib/xrpl-errors'

export async function doesXrplAccountExist(client: Client, account: string): Promise<boolean> {
  try {
    await client.request({
      command: 'account_info',
      account,
      ledger_index: 'validated',
    })
    return true
  } catch (error) {
    if (isXrplAccountNotFoundError(error)) {
      return false
    }
    throw error
  }
}

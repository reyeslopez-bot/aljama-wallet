import { type Wallet } from 'xrpl'
import { getXrplClient } from '@/infra/xrpl/client'
import { type XrplNetworkId } from '@/lib/xrpl-networks'
import { reserveIdempotencyKey } from '@/services/idempotency.service'
import { getErrorMessage } from '@/lib/security/errors'
import { getXrplSignerWallet } from '@/lib/xrpl-signer'

export type XrplSubmitResult = {
  account: string
  networkId: XrplNetworkId
  txHash: string
  txBlob: string
  engineResult: string | null
  validated: boolean
  ledgerIndex: number | null
  sequence: number | null
  rawResult: unknown
}

type SubmitParams = {
  scope: string
  idempotencyKey: string
  networkId: XrplNetworkId
  tx: Record<string, unknown>
  retries?: number
}

function shouldRetry(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  if (!message) return false
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('disconnected') ||
    message.includes('temporarily') ||
    message.includes('503')
  )
}

function getSignerAddress(wallet: Wallet): string {
  return wallet.classicAddress
}

function parseLedgerIndex(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function parseSequence(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export async function submitXrplTx(params: SubmitParams): Promise<XrplSubmitResult> {
  await reserveIdempotencyKey({
    scope: params.scope,
    key: params.idempotencyKey,
    ttlMs: 10 * 60 * 1000,
  })

  const wallet = getXrplSignerWallet()
  const client = await getXrplClient(params.networkId)

  const prepared = await client.autofill({
    ...params.tx,
    Account: getSignerAddress(wallet),
  } as unknown as Parameters<typeof client.autofill>[0])
  const signed = wallet.sign(prepared)

  const maxAttempts = Math.max(1, params.retries ?? 2)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const submitResponse = await client.submitAndWait(signed.tx_blob)
      const result = ((submitResponse as unknown as { result?: Record<string, unknown> }).result ?? {})
      const meta = (result.meta as Record<string, unknown> | undefined) ?? {}
      const engineResultRaw = meta.TransactionResult ?? result.engine_result
      const engineResult = typeof engineResultRaw === 'string' ? engineResultRaw : null

      return {
        account: getSignerAddress(wallet),
        networkId: params.networkId,
        txHash: signed.hash,
        txBlob: signed.tx_blob,
        engineResult,
        validated: Boolean(result.validated),
        ledgerIndex: parseLedgerIndex(result.validated_ledger_index ?? result.ledger_index),
        sequence: parseSequence(prepared.Sequence),
        rawResult: submitResponse,
      }
    } catch (error) {
      lastError = error
      if (!shouldRetry(error) || attempt >= maxAttempts) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
    }
  }

  throw lastError ?? new Error('Failed to submit XRPL transaction')
}

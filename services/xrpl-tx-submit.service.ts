import { getXrplClient } from '@/infra/xrpl/client'
import type { SignerAccountRef } from '@/lib/signing/types'
import { type XrplNetworkId } from '@/lib/xrpl-networks'
import { getErrorMessage } from '@/lib/security/errors'
import { reserveIdempotencyKey } from '@/services/idempotency.service'
import { getSigner, resolveSigningAccount } from '@/services/signer.service'

export type XrplSubmitResult = {
  account: string
  accountRef: string
  keyType: 'secp256k1' | 'ed25519'
  networkId: XrplNetworkId
  txHash: string
  txBlob: string
  engineResult: string | null
  validated: boolean
  ledgerIndex: number | null
  sequence: number | null
  rawResult: unknown
}

export type BuildUnsignedXrplTxParams = {
  networkId: XrplNetworkId
  tx: Record<string, unknown>
  accountRef?: SignerAccountRef
}

type SubmitParams = {
  scope: string
  idempotencyKey: string
  networkId: XrplNetworkId
  tx: Record<string, unknown>
  retries?: number
  accountRef?: SignerAccountRef
}

type SubmitSignedXrplTxParams = {
  networkId: XrplNetworkId
  txBlob: string
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

function getResolvedAccountRef(accountRef?: SignerAccountRef): SignerAccountRef {
  return accountRef ?? { kind: 'xrpl-env' }
}

export async function buildUnsignedXrplTx(params: BuildUnsignedXrplTxParams) {
  const account = await resolveSigningAccount(getResolvedAccountRef(params.accountRef))
  if (account.chain !== 'XRPL') {
    throw new Error('SIGNER_CHAIN_MISMATCH')
  }

  const client = await getXrplClient(params.networkId)
  const prepared = await client.autofill({
    ...params.tx,
    Account: account.address,
    ...(account.pubKey ? { SigningPubKey: account.pubKey } : {}),
  } as unknown as Parameters<typeof client.autofill>[0])

  return {
    account,
    prepared,
  }
}

export async function signUnsignedXrplTx(input: {
  prepared: Record<string, unknown>
  accountRef?: SignerAccountRef
}) {
  const accountRef = getResolvedAccountRef(input.accountRef)
  const result = await getSigner().sign(
    {
      kind: 'xrpl-transaction',
      preparedTransaction: input.prepared,
    },
    accountRef,
  )

  if (result.kind !== 'xrpl-transaction') {
    throw new Error('SIGNER_CHAIN_MISMATCH')
  }

  return result
}

export async function submitSignedXrplTx(params: SubmitSignedXrplTxParams) {
  const client = await getXrplClient(params.networkId)
  const maxAttempts = Math.max(1, params.retries ?? 2)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await client.submitAndWait(params.txBlob)
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

export async function submitXrplTx(params: SubmitParams): Promise<XrplSubmitResult> {
  await reserveIdempotencyKey({
    scope: params.scope,
    key: params.idempotencyKey,
    ttlMs: 10 * 60 * 1000,
  })

  const { account, prepared } = await buildUnsignedXrplTx({
    networkId: params.networkId,
    tx: params.tx,
    accountRef: params.accountRef,
  })
  const signed = await signUnsignedXrplTx({
    prepared: prepared as Record<string, unknown>,
    accountRef: params.accountRef,
  })
  const submitResponse = await submitSignedXrplTx({
    networkId: params.networkId,
    txBlob: signed.txBlob,
    retries: params.retries,
  })

  const result = ((submitResponse as unknown as { result?: Record<string, unknown> }).result ?? {})
  const meta = (result.meta as Record<string, unknown> | undefined) ?? {}
  const engineResultRaw = meta.TransactionResult ?? result.engine_result
  const engineResult = typeof engineResultRaw === 'string' ? engineResultRaw : null

  return {
    account: account.address,
    accountRef: account.accountRef,
    keyType: account.keyType,
    networkId: params.networkId,
    txHash: signed.txHash,
    txBlob: signed.txBlob,
    engineResult,
    validated: Boolean(result.validated),
    ledgerIndex: parseLedgerIndex(result.validated_ledger_index ?? result.ledger_index),
    sequence: parseSequence((prepared as { Sequence?: unknown }).Sequence),
    rawResult: submitResponse,
  }
}

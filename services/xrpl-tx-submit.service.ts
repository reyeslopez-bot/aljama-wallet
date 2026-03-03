import { getXrplClient } from '@/infra/xrpl/client'
import type {
  BaseTransaction,
  SubmittableTransaction,
  TransactionMetadata,
  TxResponse,
} from 'xrpl'
import {
  assertXrplTransactionSigningAccount,
  type SignerAccountRef,
  type XrplPreparedTransaction,
} from '@/lib/signing/types'
import { type XrplNetworkId } from '@/lib/xrpl-networks'
import { getErrorMessage } from '@/lib/security/errors'
import { reserveIdempotencyKey } from '@/services/idempotency.service'
import { getSigner, resolveSigningAccount } from '@/services/signer.service'

export type XrplSubmitResult<T extends BaseTransaction = SubmittableTransaction> = {
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
  rawResult: TxResponse<T>
}

type XrplSubmissionIntent<T extends SubmittableTransaction = SubmittableTransaction> = Omit<
  T,
  'Account' | 'SigningPubKey'
> &
  Partial<Pick<T, 'Account' | 'SigningPubKey'>>

export type BuildUnsignedXrplTxParams<T extends SubmittableTransaction = SubmittableTransaction> = {
  networkId: XrplNetworkId
  tx: XrplSubmissionIntent<T>
  accountRef?: SignerAccountRef
}

type SubmitParams<T extends SubmittableTransaction = SubmittableTransaction> = {
  scope: string
  idempotencyKey: string
  networkId: XrplNetworkId
  tx: XrplSubmissionIntent<T>
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

function readMetaTransactionResult<T extends BaseTransaction>(
  meta: TransactionMetadata<T> | string | undefined,
): string | null {
  if (!meta || typeof meta !== 'object') {
    return null
  }

  return 'TransactionResult' in meta && typeof meta.TransactionResult === 'string'
    ? meta.TransactionResult
    : null
}

export async function buildUnsignedXrplTx<T extends SubmittableTransaction>(
  params: BuildUnsignedXrplTxParams<T>,
) {
  // Guardrail: XRPL submission in this repo only supports classical XRPL signers.
  const account = assertXrplTransactionSigningAccount(
    await resolveSigningAccount(getResolvedAccountRef(params.accountRef)),
  )

  const client = await getXrplClient(params.networkId)
  const prepared = await client.autofill<T>({
    ...params.tx,
    Account: account.address,
    ...(account.pubKey ? { SigningPubKey: account.pubKey } : {}),
  } as T)

  return {
    account,
    prepared,
  }
}

export async function signUnsignedXrplTx<T extends XrplPreparedTransaction>(input: {
  prepared: T
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

export async function submitSignedXrplTx<T extends SubmittableTransaction>(
  params: SubmitSignedXrplTxParams,
) {
  const client = await getXrplClient(params.networkId)
  const maxAttempts = Math.max(1, params.retries ?? 2)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await client.submitAndWait<T>(params.txBlob)
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

export async function submitXrplTx<T extends SubmittableTransaction>(
  params: SubmitParams<T>,
): Promise<XrplSubmitResult<T>> {
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
    prepared,
    accountRef: params.accountRef,
  })
  const submitResponse = await submitSignedXrplTx<T>({
    networkId: params.networkId,
    txBlob: signed.txBlob,
    retries: params.retries,
  })

  const result = submitResponse.result
  const engineResultRaw =
    readMetaTransactionResult(result.meta) ??
    (typeof (result as { engine_result?: unknown }).engine_result === 'string'
      ? ((result as unknown as { engine_result: string }).engine_result)
      : null)
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
    ledgerIndex: parseLedgerIndex(result.ledger_index),
    sequence: parseSequence(prepared.Sequence),
    rawResult: submitResponse,
  }
}

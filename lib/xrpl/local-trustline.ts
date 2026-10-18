import type { TrustSet, Wallet } from 'xrpl'
import { getXrplClient } from '@/infra/xrpl/client'
import type { XrplNetworkId } from '@/lib/xrpl-networks'

export type LocalTrustlineResult = {
  hash: string
  engineResult: string | null
  validated: boolean
  ledgerIndex: number | null
}

type TrustlineDetails = {
  currency: string
  issuer: string
  limit: string
}

function matchesTrustline(
  transaction: TrustSet,
  signer: Wallet,
  trustline: TrustlineDetails,
): boolean {
  const limit = transaction.LimitAmount
  return (
    transaction.TransactionType === 'TrustSet' &&
    transaction.Account === signer.classicAddress &&
    Boolean(limit) &&
    typeof limit === 'object' &&
    'currency' in limit &&
    'issuer' in limit &&
    'value' in limit &&
    limit.currency === trustline.currency &&
    limit.issuer === trustline.issuer &&
    limit.value === trustline.limit
  )
}

export async function signAndSubmitLocalXrplTrustline(input: {
  networkId: XrplNetworkId
  signer: Wallet
  transaction: TrustSet
  trustline: TrustlineDetails
}): Promise<LocalTrustlineResult> {
  const { networkId, signer, transaction, trustline } = input
  if (!matchesTrustline(transaction, signer, trustline)) {
    throw new Error('The prepared trustline does not match your wallet or review')
  }

  const client = await getXrplClient(networkId)
  const prepared = await client.autofill<TrustSet>(transaction)
  if (!matchesTrustline(prepared, signer, trustline)) {
    throw new Error('The autofilled trustline no longer matches your wallet or review')
  }

  const signed = signer.sign(prepared)
  const response = await client.submitAndWait<TrustSet>(signed.tx_blob)
  const meta = response.result.meta
  const engineResult =
    meta && typeof meta === 'object' && 'TransactionResult' in meta &&
    typeof meta.TransactionResult === 'string'
      ? meta.TransactionResult
      : null
  const ledgerIndex = response.result.ledger_index

  return {
    hash: signed.hash,
    engineResult,
    validated: Boolean(response.result.validated),
    ledgerIndex:
      typeof ledgerIndex === 'number'
        ? ledgerIndex
        : typeof ledgerIndex === 'string' && Number.isFinite(Number(ledgerIndex))
          ? Number(ledgerIndex)
          : null,
  }
}

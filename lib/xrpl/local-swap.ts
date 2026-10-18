import type { Payment, Wallet } from 'xrpl'
import { getXrplClient } from '@/infra/xrpl/client'
import { toXrplAmount, type XrplAmountInput } from '@/lib/xrpl-amount'
import type { XrplNetworkId } from '@/lib/xrpl-networks'

export type LocalSwapResult = {
  hash: string
  engineResult: string | null
  validated: boolean
  ledgerIndex: number | null
}

function matchesAmount(actual: unknown, expected: XrplAmountInput): boolean {
  const expectedAmount = toXrplAmount(expected)
  if (typeof expectedAmount === 'string') return actual === expectedAmount
  if (
    !actual ||
    typeof actual !== 'object' ||
    !('currency' in actual) ||
    !('issuer' in actual) ||
    !('value' in actual)
  ) {
    return false
  }
  return (
    actual.currency === expectedAmount.currency &&
    actual.issuer === expectedAmount.issuer &&
    actual.value === expectedAmount.value
  )
}

function matchesReviewedSwap(
  transaction: Payment,
  signer: Wallet,
  quote: {
    sourceAmount: XrplAmountInput
    destinationAmount: XrplAmountInput
    deliverMin: XrplAmountInput
  },
): boolean {
  return (
    transaction.TransactionType === 'Payment' &&
    transaction.Account === signer.classicAddress &&
    transaction.Destination === signer.classicAddress &&
    Boolean(transaction.SendMax) &&
    Boolean(transaction.DeliverMin) &&
    matchesAmount(transaction.SendMax, quote.sourceAmount) &&
    matchesAmount(transaction.Amount, quote.destinationAmount) &&
    matchesAmount(transaction.DeliverMin, quote.deliverMin)
  )
}

export async function signAndSubmitLocalXrplSwap(input: {
  networkId: XrplNetworkId
  signer: Wallet
  transaction: Payment
  quote: {
    sourceAmount: XrplAmountInput
    destinationAmount: XrplAmountInput
    deliverMin: XrplAmountInput
  }
}): Promise<LocalSwapResult> {
  const { signer, transaction, networkId, quote } = input
  if (!matchesReviewedSwap(transaction, signer, quote)) {
    throw new Error('The prepared swap does not match your wallet or reviewed quote')
  }

  const client = await getXrplClient(networkId)
  const prepared = await client.autofill<Payment>(transaction)
  if (!matchesReviewedSwap(prepared, signer, quote)) {
    throw new Error('The autofilled swap no longer matches your wallet or reviewed quote')
  }

  const signed = signer.sign(prepared)
  const response = await client.submitAndWait<Payment>(signed.tx_blob)
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

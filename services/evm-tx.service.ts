import { getAddress, JsonRpcProvider, Transaction, type TransactionRequest } from 'ethers'
import { signEvmTransactionViaSignerService } from '@/services/signer-client.service'

const MAX_UINT256 = (1n << 256n) - 1n

export type BuildUnsignedEvmTxInput = {
  to: string
  amountWei: string
  chainId: number
  nonce?: number
  gasLimit?: string
  maxFeePerGasWei?: string
  maxPriorityFeePerGasWei?: string
}

export type BuildUnsignedEvmContractTxInput = {
  to: string
  data: string
  chainId: number
  valueWei?: string
  nonce?: number
  gasLimit?: string
  maxFeePerGasWei?: string
  maxPriorityFeePerGasWei?: string
}

export async function buildUnsignedEvmTx(
  input: BuildUnsignedEvmTxInput,
  walletAddress: string,
  provider: JsonRpcProvider,
): Promise<TransactionRequest> {
  const value = BigInt(input.amountWei)

  if (value <= 0n || value > MAX_UINT256) {
    throw new Error('Amount must be greater than 0')
  }

  const to = getAddress(input.to)

  const nonce = input.nonce ?? (await provider.getTransactionCount(walletAddress, 'latest'))
  const feeData = await provider.getFeeData()

  let gasLimit: bigint
  if (input.gasLimit) {
    gasLimit = BigInt(input.gasLimit)
  } else {
    const estimated = await provider.estimateGas({
      from: walletAddress,
      to,
      value,
    })
    gasLimit = BigInt(estimated.toString())
    gasLimit = gasLimit + gasLimit / 5n
  }

  const maxFeePerGas = input.maxFeePerGasWei
    ? BigInt(input.maxFeePerGasWei)
    : feeData.maxFeePerGas ?? null
  let maxPriorityFeePerGas = input.maxPriorityFeePerGasWei
    ? BigInt(input.maxPriorityFeePerGasWei)
    : feeData.maxPriorityFeePerGas ?? null

  const gasPrice = feeData.gasPrice ?? null

  if (!maxFeePerGas && !gasPrice) {
    throw new Error('Unable to determine gas fees')
  }

  if (maxFeePerGas && !maxPriorityFeePerGas) {
    maxPriorityFeePerGas = 0n
  }

  return {
    to,
    value,
    nonce,
    chainId: input.chainId,
    gasLimit,
    maxFeePerGas: maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: maxPriorityFeePerGas ?? undefined,
    gasPrice: maxFeePerGas ? undefined : gasPrice ?? undefined,
  }
}

export async function buildUnsignedEvmContractTx(
  input: BuildUnsignedEvmContractTxInput,
  walletAddress: string,
  provider: JsonRpcProvider,
): Promise<TransactionRequest> {
  const value = input.valueWei ? BigInt(input.valueWei) : 0n
  if (value < 0n || value > MAX_UINT256) {
    throw new Error('Contract call value is out of range')
  }

  const to = getAddress(input.to)
  const nonce = input.nonce ?? (await provider.getTransactionCount(walletAddress, 'latest'))
  const feeData = await provider.getFeeData()

  let gasLimit: bigint
  if (input.gasLimit) {
    gasLimit = BigInt(input.gasLimit)
  } else {
    const estimated = await provider.estimateGas({
      from: walletAddress,
      to,
      data: input.data,
      value,
    })
    gasLimit = BigInt(estimated.toString())
    gasLimit = gasLimit + gasLimit / 5n
  }

  const maxFeePerGas = input.maxFeePerGasWei
    ? BigInt(input.maxFeePerGasWei)
    : feeData.maxFeePerGas ?? null
  let maxPriorityFeePerGas = input.maxPriorityFeePerGasWei
    ? BigInt(input.maxPriorityFeePerGasWei)
    : feeData.maxPriorityFeePerGas ?? null

  const gasPrice = feeData.gasPrice ?? null

  if (!maxFeePerGas && !gasPrice) {
    throw new Error('Unable to determine gas fees')
  }

  if (maxFeePerGas && !maxPriorityFeePerGas) {
    maxPriorityFeePerGas = 0n
  }

  return {
    to,
    data: input.data,
    value,
    nonce,
    chainId: input.chainId,
    gasLimit,
    maxFeePerGas: maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: maxPriorityFeePerGas ?? undefined,
    gasPrice: maxFeePerGas ? undefined : gasPrice ?? undefined,
  }
}

export async function signUnsignedEvmTx(walletId: string, chainId: number, transaction: TransactionRequest) {
  const result = await signEvmTransactionViaSignerService({
    walletId,
    chainId,
    tx: transaction as Record<string, unknown>,
  })

  return result.signedTx
}

export function deriveSignedEvmTxHash(signedPayload: string): string | undefined {
  return Transaction.from(signedPayload).hash ?? undefined
}

export async function submitSignedEvmTx(
  provider: JsonRpcProvider,
  signedPayload: string,
): Promise<string> {
  return provider.send('eth_sendRawTransaction', [signedPayload])
}

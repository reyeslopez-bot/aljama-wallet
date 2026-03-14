import { z } from 'zod'
import type { SignerAccountRef, XrplPreparedTransaction } from '@/lib/signing/types'

const DEFAULT_SIGNER_URL = 'http://127.0.0.1:4011'
const DEFAULT_TIMEOUT_MS = 5_000

const managedAccountRefSchema = z.object({
  kind: z.literal('managed'),
  walletId: z.string().min(3),
})

const xrplEnvAccountRefSchema = z.object({
  kind: z.literal('xrpl-env'),
})

const signerAccountRefSchema = z.union([managedAccountRefSchema, xrplEnvAccountRefSchema])

const signEvmInputSchema = z.object({
  walletId: z.string().min(3),
  chainId: z.number().int().positive(),
  tx: z.record(z.string(), z.unknown()),
})

const signEvmOutputSchema = z.object({
  signedTx: z.string(),
  txHash: z.string(),
})

const signXrplInputSchema = z.object({
  prepared: z.record(z.string(), z.unknown()),
  accountRef: signerAccountRefSchema.optional(),
})

const signXrplOutputSchema = z.object({
  txBlob: z.string(),
  txHash: z.string(),
  publicKey: z.string(),
})

type SignerTool = 'wallet.signTx' | 'wallet.signXrplTx'

function parsePositiveInteger(rawValue: string | undefined, fallback: number, fieldName: string): number {
  if (!rawValue?.trim()) return fallback

  const parsed = Number(rawValue)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`)
  }

  return parsed
}

function signerUrl(): string {
  return new URL(process.env.INTERNAL_WALLET_SIGNER_URL?.trim() || DEFAULT_SIGNER_URL).toString()
}

function signerTimeoutMs(): number {
  return parsePositiveInteger(
    process.env.INTERNAL_WALLET_SIGNER_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    'INTERNAL_WALLET_SIGNER_TIMEOUT_MS',
  )
}

function signerToken(): string | null {
  const token =
    process.env.MCP_WALLET_SIGNER_TOKEN?.trim() ||
    process.env.MCP_INTERNAL_TOKEN?.trim() ||
    process.env.INTERNAL_API_TOKEN?.trim() ||
    null

  if (!token && process.env.NODE_ENV === 'production') {
    throw new Error('MISSING_INTERNAL_SIGNER_TOKEN')
  }

  return token
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.trim()) {
      return body.error.trim()
    }
  } catch {
    // ignore invalid upstream bodies and fall back to status text
  }

  return `INTERNAL_SIGNER_HTTP_${res.status}`
}

async function callWalletSignerTool<TInput, TOutput>(
  tool: SignerTool,
  input: TInput,
  outputSchema: z.ZodType<TOutput>,
): Promise<TOutput> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), signerTimeoutMs())

  try {
    const token = signerToken()
    const res = await fetch(signerUrl(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ tool, input }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(await readErrorMessage(res))
    }

    const body = (await res.json()) as { output?: unknown }
    return outputSchema.parse(body.output)
  } finally {
    clearTimeout(timer)
  }
}

export async function signEvmTransactionViaSignerService(input: {
  walletId: string
  chainId: number
  tx: Record<string, unknown>
}) {
  return callWalletSignerTool(
    'wallet.signTx',
    signEvmInputSchema.parse(input),
    signEvmOutputSchema,
  )
}

export async function signXrplTransactionViaSignerService(input: {
  prepared: XrplPreparedTransaction
  accountRef?: SignerAccountRef
}) {
  return callWalletSignerTool(
    'wallet.signXrplTx',
    signXrplInputSchema.parse({
      prepared: input.prepared as Record<string, unknown>,
      accountRef: input.accountRef,
    }),
    signXrplOutputSchema,
  )
}

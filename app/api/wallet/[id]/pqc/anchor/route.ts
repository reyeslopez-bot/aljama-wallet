import { JsonRpcProvider, getAddress } from 'ethers'
import { z } from 'zod'
import { encodeCommitPqcBindingCalldata } from '@/lib/contracts/pqc-binding-registry'
import { buildPqcBindingHashes } from '@/lib/pqc/commitment'
import { errorJson, okJson } from '@/lib/security/api-response'
import { withApiRoute } from '@/lib/security/api-route'
import { logError } from '@/lib/security/logging'
import { isAllowedOrigin } from '@/lib/security/origin'
import { readJsonBody } from '@/lib/security/request-body'
import { buildRateLimitKey, rateLimit } from '@/lib/security/rate-limit'
import { isStrictMode } from '@/lib/security/runtime'
import { isAdminEmail, requireSession } from '@/lib/security/session'
import {
  buildUnsignedEvmContractTx,
  deriveSignedEvmTxHash,
  signUnsignedEvmTx,
  submitSignedEvmTx,
} from '@/services/evm-tx.service'
import { reserveIdempotencyKey } from '@/services/idempotency.service'
import {
  markNonceReservationFailed,
  markNonceReservationSubmitted,
  releaseNonceReservation,
  reserveWalletNonce,
} from '@/services/nonce-reservation.service'
import { createWalletPqcAnchorRecord } from '@/services/wallet-pqc-anchor.service'
import { getWalletSigningAccount, recordChainTransaction, setWalletPqcBindingHash } from '@/services/wallet.service'
import { userOwnsWallet } from '@/services/wallet-ownership.service'

export const dynamic = 'force-dynamic'

const anchorSchema = z.object({
  chainId: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
  uri: z.string().url().optional(),
})

function requireRpcUrl() {
  const rpcUrl = process.env.EVM_RPC_URL
  if (!rpcUrl) {
    throw new Error('Missing EVM_RPC_URL')
  }
  if (process.env.NODE_ENV === 'production' && !rpcUrl.startsWith('https://')) {
    throw new Error('EVM_RPC_URL must use https in production')
  }
  return rpcUrl
}

function parseRegistryAddresses(): Map<number, string> {
  const raw = process.env.WALLET_PQC_REGISTRY_ADDRESSES?.trim()
  if (!raw) {
    if (isStrictMode) {
      throw new Error('Missing WALLET_PQC_REGISTRY_ADDRESSES')
    }
    return new Map()
  }

  const entries = new Map<number, string>()
  for (const pair of raw.split(',')) {
    const [chainIdText, addressText] = pair.split(':')
    const chainId = Number(chainIdText?.trim())
    const address = addressText?.trim()
    if (!Number.isInteger(chainId) || chainId <= 0 || !address) {
      continue
    }
    entries.set(chainId, getAddress(address))
  }
  return entries
}

function resolveCanonicalPublicBaseUrl(req: Request): string | null {
  const explicit = process.env.PQC_BINDING_PUBLIC_BASE_URL?.trim()
  if (explicit) {
    return new URL(explicit).toString()
  }
  if (isStrictMode) {
    return null
  }

  const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (publicSiteUrl) {
    return new URL(publicSiteUrl).toString()
  }

  return new URL(req.url).origin
}

function normalizeUri(value: string): string {
  return new URL(value).toString()
}

function rateLimitBucket(): string {
  return process.env.PQC_ANCHOR_RATE_LIMIT_BUCKET?.trim() || 'wallet-pqc-anchor'
}

function stringifyTxValue(value: string | bigint | number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value.toString()
}

export async function anchorWalletPqcBindingRequest(req: Request, walletIdOverride?: string) {
  let nonceReservationId: string | null = null
  let broadcastAttempted = false
  try {
    const session = await requireSession()
    if (!session) {
      return errorJson(401, 'unauthorized', 'UNAUTHORIZED')
    }

    if (!isAllowedOrigin(req)) {
      return errorJson(403, 'invalid_origin', 'INVALID_ORIGIN')
    }

    const rateKey = buildRateLimitKey(req, session.user?.id ?? null)
    const limit = await rateLimit({
      bucket: rateLimitBucket(),
      key: rateKey,
      limit: 10,
      windowMs: 60_000,
    })
    if (!limit.ok) {
      return errorJson(
        429,
        'rate_limited',
        'RATE_LIMITED',
        { retryAfter: limit.retryAfter },
        { headers: { 'retry-after': String(limit.retryAfter) } },
      )
    }

    const bodyResult = await readJsonBody(req, { maxBytes: 4_096 })
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    const body =
      bodyResult.data && typeof bodyResult.data === 'object' && !Array.isArray(bodyResult.data)
        ? (bodyResult.data as Record<string, unknown>)
        : {}

    const walletIdFromBody = typeof body.walletId === 'string' ? body.walletId : undefined
    if (walletIdOverride && walletIdFromBody && walletIdFromBody !== walletIdOverride) {
      return errorJson(409, 'wallet_id_conflict', 'WALLET_ID_CONFLICT')
    }

    const input = anchorSchema.parse(body)
    const walletId = (walletIdOverride ?? walletIdFromBody ?? '').trim()
    if (!walletId) {
      return errorJson(400, 'invalid_wallet_id', 'INVALID_WALLET_ID')
    }

    const isAdmin = isAdminEmail(session.user?.email ?? null)
    if (!isAdmin) {
      const owns = await userOwnsWallet(session.user.id, walletId)
      if (!owns) {
        return errorJson(403, 'forbidden', 'FORBIDDEN')
      }
    }

    const wallet = await getWalletSigningAccount(walletId)
    if (!wallet) {
      return errorJson(404, 'wallet_not_found', 'WALLET_NOT_FOUND')
    }
    if (wallet.chain !== 'EVM') {
      return errorJson(400, 'wallet_chain_unsupported', 'WALLET_CHAIN_UNSUPPORTED')
    }
    if (!wallet.pqcBinding) {
      return errorJson(409, 'pqc_binding_missing', 'PQC_BINDING_MISSING')
    }

    const registryAddress = parseRegistryAddresses().get(input.chainId)
    if (!registryAddress) {
      return errorJson(400, 'registry_not_configured', 'REGISTRY_NOT_CONFIGURED')
    }

    const publicBaseUrl = resolveCanonicalPublicBaseUrl(req)
    if (!publicBaseUrl) {
      return errorJson(503, 'server_misconfigured', 'SERVER_MISCONFIGURED')
    }

    const provisionalHashes = buildPqcBindingHashes(wallet.pqcBinding)
    const canonicalUri = new URL(
      `/api/public/pqc-bindings/${provisionalHashes.bindingHash}`,
      publicBaseUrl,
    ).toString()

    if (input.uri && normalizeUri(input.uri) !== canonicalUri) {
      return errorJson(400, 'uri_mismatch', 'URI_MISMATCH', {
        expectedUri: canonicalUri,
      })
    }

    const hashes = buildPqcBindingHashes(wallet.pqcBinding, canonicalUri)
    if (!hashes.uriHash) {
      throw new Error('PQC binding URI hash missing')
    }

    if (wallet.pqcBindingHash && wallet.pqcBindingHash !== hashes.bindingHash) {
      return errorJson(409, 'pqc_binding_hash_mismatch', 'PQC_BINDING_HASH_MISMATCH')
    }
    if (!wallet.pqcBindingHash) {
      await setWalletPqcBindingHash(wallet.id, hashes.bindingHash)
    }

    try {
      await reserveIdempotencyKey({
        scope: `wallet-pqc-anchor:${wallet.id}:${input.chainId}`,
        key: input.idempotencyKey,
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'IDEMPOTENCY_REPLAY') {
        return errorJson(409, 'idempotency_replay', 'IDEMPOTENCY_REPLAY')
      }
      throw error
    }

    const rpcUrl = requireRpcUrl()
    const provider = new JsonRpcProvider(rpcUrl)
    const network = await provider.getNetwork()
    if (Number(network.chainId) !== input.chainId) {
      return errorJson(400, 'chain_mismatch', 'CHAIN_MISMATCH', {
        expectedChainId: input.chainId,
        rpcChainId: Number(network.chainId),
      })
    }

    const data = encodeCommitPqcBindingCalldata({
      statementHash: hashes.statementHash,
      signatureHash: hashes.signatureHash,
      publicKeyHash: hashes.publicKeyHash,
      uriHash: hashes.uriHash,
      uri: canonicalUri,
    })

    const nonceReservation = await reserveWalletNonce({
      walletId: wallet.id,
      walletAddress: wallet.address,
      chainId: input.chainId,
      actionId: `wallet-pqc-anchor:${input.idempotencyKey}`,
      provider,
    })
    nonceReservationId = nonceReservation.id

    const unsignedTx = await buildUnsignedEvmContractTx(
      {
        to: registryAddress,
        data,
        chainId: input.chainId,
        valueWei: '0',
        nonce: nonceReservation.nonce,
      },
      wallet.address,
      provider,
    )
    const signedPayload = await signUnsignedEvmTx(wallet.id, input.chainId, unsignedTx)
    const derivedTxHash = deriveSignedEvmTxHash(signedPayload)
    broadcastAttempted = true
    const submittedTxHash = await submitSignedEvmTx(provider, signedPayload)
    const txHash = submittedTxHash || derivedTxHash
    if (!txHash) {
      throw new Error('Unable to determine submitted transaction hash')
    }
    await markNonceReservationSubmitted(nonceReservation.id, txHash)

    let anchorRecorded = false
    let chainTransactionRecorded = false

    try {
      await createWalletPqcAnchorRecord({
        walletId: wallet.id,
        chainType: 'EVM',
        networkId: String(input.chainId),
        registryAddress,
        bindingHash: hashes.bindingHash,
        statementHash: hashes.statementHash,
        signatureHash: hashes.signatureHash,
        publicKeyHash: hashes.publicKeyHash,
        uri: canonicalUri,
        uriHash: hashes.uriHash,
        txHash,
        status: 'submitted',
      })
      anchorRecorded = true
    } catch (recordError) {
      logError('wallet-pqc-anchor:anchor-record', recordError)
    }

    try {
      await recordChainTransaction({
        chainId: input.chainId,
        txHash,
        fromWalletId: wallet.id,
        fromAddress: wallet.address,
        toAddress: registryAddress,
        valueBaseUnits: 0n,
        asset: 'native',
        status: 'submitted',
        txType: 'contract_call',
        nonce: unsignedTx.nonce ?? null,
        gasLimit: stringifyTxValue(unsignedTx.gasLimit ?? null),
        gasPrice: stringifyTxValue(unsignedTx.gasPrice ?? null),
        maxFeePerGas: stringifyTxValue(unsignedTx.maxFeePerGas ?? null),
        maxPriorityFeePerGas: stringifyTxValue(unsignedTx.maxPriorityFeePerGas ?? null),
        data,
      })
      chainTransactionRecorded = true
    } catch (recordError) {
      logError('wallet-pqc-anchor:chain-transaction', recordError)
    }

    return okJson({
      walletId: wallet.id,
      chainId: input.chainId,
      registryAddress,
      bindingHash: hashes.bindingHash,
      txHash,
      anchorRecorded,
      chainTransactionRecorded,
    })
  } catch (error) {
    if (nonceReservationId) {
      if (broadcastAttempted) {
        await markNonceReservationFailed(nonceReservationId).catch(() => {})
      } else {
        await releaseNonceReservation(nonceReservationId).catch(() => {})
      }
    }
    if (error instanceof z.ZodError) {
      return errorJson(400, 'invalid_request', 'INVALID_REQUEST', error.flatten())
    }

    return errorJson(500, 'wallet_pqc_anchor_failed', 'WALLET_PQC_ANCHOR_FAILED')
  }
}

async function postWalletPqcAnchor(
  req: Request,
  _routeContext: { requestId: string; startedAt: number; timeoutMs: number },
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  return anchorWalletPqcBindingRequest(req, id)
}

export const POST = withApiRoute<[{ params: Promise<{ id: string }> }]>(
  { scope: 'api:wallet-pqc-anchor', timeoutMs: 20_000 },
  postWalletPqcAnchor,
)

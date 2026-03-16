import {
  isWalletPqcBinding,
  parseWalletPqcBinding,
  type WalletPqcBinding,
} from '@/lib/pqc/types'
import type { SubmittableTransaction } from 'xrpl'

export type SignerBackend = 'local' | 'hardware' | 'mpc' | 'remote'

export type SigningChain = 'EVM' | 'XRPL'

// Guardrail: live transaction execution in this repo remains classical-only.
// Do not widen these aliases to PQ curves unless the target chain natively supports them.
export type LiveTransactionCurve = 'secp256k1' | 'ed25519'
export type LiveTransactionScheme = 'ecdsa' | 'eddsa'

export type SigningCurve = LiveTransactionCurve

// Broader wallet policy vocabulary. This may describe PQ/hybrid attestation state,
// but it must not be used to imply native live transaction signing support.
export type SigningScheme = LiveTransactionScheme | 'ml-dsa' | 'slh-dsa' | 'hybrid'

export type XrplKeyType = 'secp256k1' | 'ed25519'

export type VaultScope = 'public' | 'vault'

export type WalletAccountPolicy = {
  requiresSecondFactor: boolean
  requiresPQAttestation: boolean
}

export type SigningAccountRecord = {
  id: string
  accountRef: string
  chain: SigningChain
  address: string
  pubKey: string | null
  keyType: SigningCurve
  signerBackend: SignerBackend
  vaultId: VaultScope
  derivationPath: string | null
  policy: WalletAccountPolicy
  pqcBinding: WalletPqcBinding | null
  pqcBindingHash: string | null
  encryptedPrivateKey: Uint8Array | null
  encryptionIv: Uint8Array | null
  keyVersion: number | null
  createdAt: Date
}

export type ManagedSignerAccountRef = {
  kind: 'managed'
  walletId: string
}

export type XrplEnvSignerRole = 'default' | 'issuer' | 'distributor'

export type XrplEnvSignerAccountRef = {
  kind: 'xrpl-env'
  role?: XrplEnvSignerRole
}

export type SignerAccountRef = ManagedSignerAccountRef | XrplEnvSignerAccountRef

export type ResolvedSigningAccount = Omit<
  SigningAccountRecord,
  'encryptedPrivateKey' | 'encryptionIv' | 'keyVersion'
>

export type EvmTransactionSigningAccount = ResolvedSigningAccount & {
  chain: 'EVM'
  keyType: 'secp256k1'
}

export type XrplTransactionSigningAccount = ResolvedSigningAccount & {
  chain: 'XRPL'
  keyType: XrplKeyType
  pubKey: string
}

// Live signing requests are intentionally classical transaction payloads only.
// PQ keys/signatures are handled off-chain in pqcBinding and commitment layers.
export type EvmSignRequest = {
  kind: 'evm-transaction'
  chainId: number
  transaction: Record<string, unknown>
}

export type XrplPreparedTransaction = SubmittableTransaction

export type XrplSignRequest = {
  kind: 'xrpl-transaction'
  preparedTransaction: XrplPreparedTransaction
}

export type SignRequest = EvmSignRequest | XrplSignRequest

export type EvmSignResult = {
  kind: 'evm-transaction'
  signedPayload: string
  publicKey: string
}

export type XrplSignResult = {
  kind: 'xrpl-transaction'
  txBlob: string
  txHash: string
  publicKey: string
}

export type SignResult = EvmSignResult | XrplSignResult

export const DEFAULT_WALLET_ACCOUNT_POLICY: WalletAccountPolicy = {
  requiresSecondFactor: false,
  requiresPQAttestation: false,
}

export function normalizeWalletAccountPolicy(
  value?: Partial<WalletAccountPolicy> | null,
): WalletAccountPolicy {
  return {
    requiresSecondFactor: value?.requiresSecondFactor ?? DEFAULT_WALLET_ACCOUNT_POLICY.requiresSecondFactor,
    requiresPQAttestation:
      value?.requiresPQAttestation ?? DEFAULT_WALLET_ACCOUNT_POLICY.requiresPQAttestation,
  }
}

export function normalizeVaultScope(value: string | null | undefined): VaultScope {
  return value === 'vault' ? 'vault' : 'public'
}

export function normalizeSigningChain(value: string | null | undefined): SigningChain {
  return value === 'XRPL' ? 'XRPL' : 'EVM'
}

export function normalizeSigningCurve(value: string | null | undefined): SigningCurve {
  return value === 'ed25519' ? 'ed25519' : 'secp256k1'
}

export function normalizeSignerBackend(value: string | null | undefined): SignerBackend {
  if (value === 'hardware' || value === 'mpc' || value === 'remote') {
    return value
  }
  return 'local'
}

export function buildAccountRef(input: {
  chain: SigningChain
  keyType: SigningCurve
  pubKey?: string | null
  address: string
}): string {
  const stableIdentity = (input.pubKey?.trim() || input.address.trim()).toLowerCase()
  return `${input.chain}:${input.keyType}:${stableIdentity}`
}

export function isEvmTransactionSigningAccount(
  account: ResolvedSigningAccount,
): account is EvmTransactionSigningAccount {
  return account.chain === 'EVM' && account.keyType === 'secp256k1'
}

export function isXrplTransactionSigningAccount(
  account: ResolvedSigningAccount,
): account is XrplTransactionSigningAccount {
  return (
    account.chain === 'XRPL' &&
    (account.keyType === 'secp256k1' || account.keyType === 'ed25519') &&
    typeof account.pubKey === 'string' &&
    account.pubKey.trim().length > 0
  )
}

export function assertEvmTransactionSigningAccount(
  account: ResolvedSigningAccount,
): EvmTransactionSigningAccount {
  if (!isEvmTransactionSigningAccount(account)) {
    throw new Error('UNSUPPORTED_EVM_SIGNING_ACCOUNT')
  }
  return account
}

export function assertXrplTransactionSigningAccount(
  account: ResolvedSigningAccount,
): XrplTransactionSigningAccount {
  if (!isXrplTransactionSigningAccount(account)) {
    throw new Error('UNSUPPORTED_XRPL_SIGNING_ACCOUNT')
  }
  return account
}

export { isWalletPqcBinding, parseWalletPqcBinding }
export type { WalletPqcBinding }

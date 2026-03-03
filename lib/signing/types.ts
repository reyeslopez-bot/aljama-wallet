export type SignerBackend = 'local' | 'hardware' | 'mpc' | 'remote'

export type SigningChain = 'EVM' | 'XRPL'

export type SigningCurve = 'secp256k1' | 'ed25519'

export type SigningScheme = 'ecdsa' | 'eddsa' | 'ml-dsa' | 'slh-dsa' | 'hybrid'

export type XrplKeyType = 'secp256k1' | 'ed25519'

export type VaultScope = 'public' | 'vault'

export type WalletAccountPolicy = {
  requiresSecondFactor: boolean
  requiresPQAttestation: boolean
}

export type WalletPqcBinding = {
  scheme: 'ml-dsa' | 'slh-dsa'
  publicKey: string
  attestedAt: string
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
  encryptedPrivateKey: Uint8Array | null
  encryptionIv: Uint8Array | null
  keyVersion: number | null
  createdAt: Date
}

export type ManagedSignerAccountRef = {
  kind: 'managed'
  walletId: string
}

export type XrplEnvSignerAccountRef = {
  kind: 'xrpl-env'
}

export type SignerAccountRef = ManagedSignerAccountRef | XrplEnvSignerAccountRef

export type ResolvedSigningAccount = Omit<
  SigningAccountRecord,
  'encryptedPrivateKey' | 'encryptionIv' | 'keyVersion'
>

export type EvmSignRequest = {
  kind: 'evm-transaction'
  chainId: number
  transaction: Record<string, unknown>
}

export type XrplSignRequest = {
  kind: 'xrpl-transaction'
  preparedTransaction: Record<string, unknown>
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

export function isWalletPqcBinding(value: unknown): value is WalletPqcBinding {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  return (
    (record.scheme === 'ml-dsa' || record.scheme === 'slh-dsa') &&
    typeof record.publicKey === 'string' &&
    record.publicKey.length > 0 &&
    typeof record.attestedAt === 'string' &&
    record.attestedAt.length > 0
  )
}

export function parseWalletPqcBinding(value: unknown): WalletPqcBinding | null {
  return isWalletPqcBinding(value) ? value : null
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

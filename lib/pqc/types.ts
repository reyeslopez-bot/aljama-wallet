export type WalletPqcScheme = 'ml-dsa-65'
export type WalletPqcProviderBackend = 'noble' | 'node-native'
export type WalletPqcPublicKeyFormat = 'raw-base64' | 'spki-der-base64'
export type WalletPqcPrivateKeyFormat = 'raw-base64' | 'pkcs8-der-base64'
export type WalletPqcSignatureFormat = 'raw-base64'
export type WalletPqcBoundChain = 'EVM' | 'XRPL'
export type WalletPqcBoundKeyType = 'secp256k1' | 'ed25519'
export type WalletPqcBoundScheme = 'ecdsa' | 'eddsa'

export type WalletPqcBoundSubject = {
  accountRef: string
  chain: WalletPqcBoundChain
  address: string
  keyType: WalletPqcBoundKeyType
  scheme: WalletPqcBoundScheme
  publicKey: string
  publicKeyFormat: 'hex'
}

export type WalletPqcBindingChallenge = {
  type: 'classical-key-binding'
  statement: string
  statementFormat: 'utf8-json'
}

export type WalletPqcBindingProof = {
  signature: string
  signatureFormat: WalletPqcSignatureFormat
  attestedAt: string
}

export type WalletPqcBinding = {
  version: 1
  role: 'vault-identity'
  scheme: WalletPqcScheme
  provider: WalletPqcProviderBackend
  publicKey: string
  publicKeyFormat: WalletPqcPublicKeyFormat
  subject: WalletPqcBoundSubject
  challenge: WalletPqcBindingChallenge
  proof: WalletPqcBindingProof
}

export type WalletPqcKeyPair = {
  scheme: WalletPqcScheme
  provider: WalletPqcProviderBackend
  publicKey: string
  publicKeyFormat: WalletPqcPublicKeyFormat
  privateKey: string
  privateKeyFormat: WalletPqcPrivateKeyFormat
}

export type WalletPqcEncryptedMaterial = {
  keyPair: WalletPqcKeyPair
  binding: WalletPqcBinding
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isWalletPqcProviderBackend(value: unknown): value is WalletPqcProviderBackend {
  return value === 'noble' || value === 'node-native'
}

function isWalletPqcPublicKeyFormat(value: unknown): value is WalletPqcPublicKeyFormat {
  return value === 'raw-base64' || value === 'spki-der-base64'
}

function isWalletPqcPrivateKeyFormat(value: unknown): value is WalletPqcPrivateKeyFormat {
  return value === 'raw-base64' || value === 'pkcs8-der-base64'
}

function isWalletPqcBoundSubject(value: unknown): value is WalletPqcBoundSubject {
  if (!isRecord(value)) {
    return false
  }

  return (
    isNonEmptyString(value.accountRef) &&
    (value.chain === 'EVM' || value.chain === 'XRPL') &&
    isNonEmptyString(value.address) &&
    (value.keyType === 'secp256k1' || value.keyType === 'ed25519') &&
    (value.scheme === 'ecdsa' || value.scheme === 'eddsa') &&
    isNonEmptyString(value.publicKey) &&
    value.publicKeyFormat === 'hex'
  )
}

function isWalletPqcBindingChallenge(value: unknown): value is WalletPqcBindingChallenge {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.type === 'classical-key-binding' &&
    isNonEmptyString(value.statement) &&
    value.statementFormat === 'utf8-json'
  )
}

function isWalletPqcBindingProof(value: unknown): value is WalletPqcBindingProof {
  if (!isRecord(value)) {
    return false
  }

  return (
    isNonEmptyString(value.signature) &&
    value.signatureFormat === 'raw-base64' &&
    isNonEmptyString(value.attestedAt)
  )
}

export function isWalletPqcBinding(value: unknown): value is WalletPqcBinding {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.version === 1 &&
    value.role === 'vault-identity' &&
    value.scheme === 'ml-dsa-65' &&
    isWalletPqcProviderBackend(value.provider) &&
    isNonEmptyString(value.publicKey) &&
    isWalletPqcPublicKeyFormat(value.publicKeyFormat) &&
    isWalletPqcBoundSubject(value.subject) &&
    isWalletPqcBindingChallenge(value.challenge) &&
    isWalletPqcBindingProof(value.proof)
  )
}

export function parseWalletPqcBinding(value: unknown): WalletPqcBinding | null {
  return isWalletPqcBinding(value) ? value : null
}

export function isWalletPqcKeyPair(value: unknown): value is WalletPqcKeyPair {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.scheme === 'ml-dsa-65' &&
    isWalletPqcProviderBackend(value.provider) &&
    isNonEmptyString(value.publicKey) &&
    isWalletPqcPublicKeyFormat(value.publicKeyFormat) &&
    isNonEmptyString(value.privateKey) &&
    isWalletPqcPrivateKeyFormat(value.privateKeyFormat)
  )
}

export function parseWalletPqcEncryptedMaterial(value: unknown): WalletPqcEncryptedMaterial | null {
  if (!isRecord(value)) {
    return null
  }

  return isWalletPqcKeyPair(value.keyPair) && isWalletPqcBinding(value.binding)
    ? {
        keyPair: value.keyPair,
        binding: value.binding,
      }
    : null
}

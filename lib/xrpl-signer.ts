import { isValidClassicAddress } from 'xrpl'
import { createXrplWalletFromSeed } from '@/infra/xrpl/client'
import { isStrictMode } from '@/lib/security/runtime'
import {
  buildAccountRef,
  normalizeWalletAccountPolicy,
  type ResolvedSigningAccount,
  type XrplEnvSignerRole,
  type XrplKeyType,
} from '@/lib/signing/types'

type XrplEnvSignerConfig = {
  role: XrplEnvSignerRole
  accountId: string
  seedEnvVars: readonly string[]
  keyTypeEnvVars: readonly string[]
  missingSeedMessage: string
}

const XRPL_ENV_SIGNER_CONFIGS: Record<XrplEnvSignerRole, XrplEnvSignerConfig> = {
  default: {
    role: 'default',
    accountId: 'xrpl-env',
    seedEnvVars: ['XRPL_SIGNER_SEED', 'XRPL_DEV_SEED'],
    keyTypeEnvVars: ['XRPL_SIGNER_KEY_TYPE', 'XRPL_DEV_KEY_TYPE'],
    missingSeedMessage: 'Missing XRPL signer seed (XRPL_SIGNER_SEED or XRPL_DEV_SEED)',
  },
  issuer: {
    role: 'issuer',
    accountId: 'xrpl-env-issuer',
    seedEnvVars: ['XRPL_ISSUER_SEED', 'XRPL_SIGNER_SEED', 'XRPL_DEV_SEED'],
    keyTypeEnvVars: ['XRPL_ISSUER_KEY_TYPE', 'XRPL_SIGNER_KEY_TYPE', 'XRPL_DEV_KEY_TYPE'],
    missingSeedMessage:
      'Missing XRPL issuer seed (XRPL_ISSUER_SEED, XRPL_SIGNER_SEED, or XRPL_DEV_SEED)',
  },
  distributor: {
    role: 'distributor',
    accountId: 'xrpl-env-distributor',
    seedEnvVars: ['XRPL_DISTRIBUTOR_SEED', 'XRPL_SIGNER_SEED', 'XRPL_DEV_SEED'],
    keyTypeEnvVars: ['XRPL_DISTRIBUTOR_KEY_TYPE', 'XRPL_SIGNER_KEY_TYPE', 'XRPL_DEV_KEY_TYPE'],
    missingSeedMessage:
      'Missing XRPL distributor seed (XRPL_DISTRIBUTOR_SEED, XRPL_SIGNER_SEED, or XRPL_DEV_SEED)',
  },
}

function resolveEnvValue(envVars: readonly string[]): string | null {
  for (const envVar of envVars) {
    const value = process.env[envVar]?.trim()
    if (value) {
      return value
    }
  }
  return null
}

function getXrplEnvSignerConfig(role: XrplEnvSignerRole): XrplEnvSignerConfig {
  return XRPL_ENV_SIGNER_CONFIGS[role]
}

export function getXrplSignerSeed(role: XrplEnvSignerRole = 'default'): string {
  const config = getXrplEnvSignerConfig(role)
  const seed = resolveEnvValue(config.seedEnvVars)
  if (!seed) {
    throw new Error(config.missingSeedMessage)
  }
  return seed
}

export function getXrplSignerKeyType(role: XrplEnvSignerRole = 'default'): XrplKeyType {
  const config = getXrplEnvSignerConfig(role)
  const raw = resolveEnvValue(config.keyTypeEnvVars)
  if (!raw) {
    if (isStrictMode) {
      const keyTypeNames = config.keyTypeEnvVars.join(', ')
      throw new Error(`Missing XRPL signer key type (${keyTypeNames})`)
    }
    return 'ed25519'
  }

  const normalized = raw.toLowerCase()
  if (normalized === 'secp256k1' || normalized === 'ed25519') {
    return normalized
  }

  throw new Error('Invalid XRPL signer key type')
}

export function getXrplSignerWallet(role: XrplEnvSignerRole = 'default') {
  // Guardrail: env-backed XRPL execution remains classical-only in this repo.
  return createXrplWalletFromSeed(getXrplSignerSeed(role), getXrplSignerKeyType(role))
}

export function getXrplSignerAccount(role: XrplEnvSignerRole = 'default'): ResolvedSigningAccount {
  const config = getXrplEnvSignerConfig(role)
  const wallet = getXrplSignerWallet(role)
  const keyType = getXrplSignerKeyType(role)

  return {
    id: config.accountId,
    accountRef: buildAccountRef({
      chain: 'XRPL',
      keyType,
      pubKey: wallet.publicKey,
      address: wallet.classicAddress,
    }),
    chain: 'XRPL',
    address: wallet.classicAddress,
    pubKey: wallet.publicKey,
    keyType,
    signerBackend: 'local',
    vaultId: 'public',
    derivationPath: null,
    policy: normalizeWalletAccountPolicy(),
    pqcBinding: null,
    pqcBindingHash: null,
    createdAt: new Date(0),
  }
}

export function getXrplIssuerAccount(): ResolvedSigningAccount {
  return getXrplSignerAccount('issuer')
}

export function getXrplDistributorAccount(): ResolvedSigningAccount {
  return getXrplSignerAccount('distributor')
}

export function getXrplSignerAddress(role: XrplEnvSignerRole = 'default'): string {
  return getXrplSignerAccount(role).address
}

export function getXrplIssuerAddress(): string {
  return getXrplIssuerAccount().address
}

export function getXrplDistributorAddress(): string {
  return getXrplDistributorAccount().address
}

export function normalizeXrplAddress(address: string): string {
  const normalized = address.trim()
  if (!isValidClassicAddress(normalized)) {
    throw new Error('Invalid XRPL address')
  }
  return normalized
}

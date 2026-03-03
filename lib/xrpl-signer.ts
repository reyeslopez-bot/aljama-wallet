import { isValidClassicAddress } from 'xrpl'
import { createXrplWalletFromSeed } from '@/infra/xrpl/client'
import { isStrictMode } from '@/lib/security/runtime'
import {
  buildAccountRef,
  normalizeWalletAccountPolicy,
  type ResolvedSigningAccount,
  type XrplKeyType,
} from '@/lib/signing/types'

export function getXrplSignerSeed(): string {
  const seed = process.env.XRPL_SIGNER_SEED ?? process.env.XRPL_DEV_SEED
  if (!seed || !seed.trim()) {
    throw new Error('Missing XRPL signer seed (XRPL_SIGNER_SEED or XRPL_DEV_SEED)')
  }
  return seed.trim()
}

export function getXrplSignerKeyType(): XrplKeyType {
  const raw = process.env.XRPL_SIGNER_KEY_TYPE ?? process.env.XRPL_DEV_KEY_TYPE
  if (!raw || !raw.trim()) {
    if (isStrictMode) {
      throw new Error('Missing XRPL signer key type (XRPL_SIGNER_KEY_TYPE or XRPL_DEV_KEY_TYPE)')
    }
    return 'ed25519'
  }

  const normalized = raw.trim().toLowerCase()
  if (normalized === 'secp256k1' || normalized === 'ed25519') {
    return normalized
  }

  throw new Error('Invalid XRPL signer key type')
}

export function getXrplSignerWallet() {
  // Guardrail: env-backed XRPL execution remains classical-only in this repo.
  return createXrplWalletFromSeed(getXrplSignerSeed(), getXrplSignerKeyType())
}

export function getXrplSignerAccount(): ResolvedSigningAccount {
  const wallet = getXrplSignerWallet()
  const keyType = getXrplSignerKeyType()

  return {
    id: 'xrpl-env',
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

export function getXrplSignerAddress(): string {
  return getXrplSignerAccount().address
}

export function normalizeXrplAddress(address: string): string {
  const normalized = address.trim()
  if (!isValidClassicAddress(normalized)) {
    throw new Error('Invalid XRPL address')
  }
  return normalized
}

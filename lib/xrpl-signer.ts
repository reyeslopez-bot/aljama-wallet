import { isValidClassicAddress } from 'xrpl'
import { createXrplWalletFromSeed } from '@/infra/xrpl/client'

export function getXrplSignerSeed(): string {
  const seed = process.env.XRPL_SIGNER_SEED ?? process.env.XRPL_DEV_SEED
  if (!seed || !seed.trim()) {
    throw new Error('Missing XRPL signer seed (XRPL_SIGNER_SEED or XRPL_DEV_SEED)')
  }
  return seed.trim()
}

export function getXrplSignerWallet() {
  return createXrplWalletFromSeed(getXrplSignerSeed())
}

export function getXrplSignerAddress(): string {
  return getXrplSignerWallet().classicAddress
}

export function normalizeXrplAddress(address: string): string {
  const normalized = address.trim()
  if (!isValidClassicAddress(normalized)) {
    throw new Error('Invalid XRPL address')
  }
  return normalized
}

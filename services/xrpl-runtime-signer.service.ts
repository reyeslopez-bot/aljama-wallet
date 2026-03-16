import {
  assertXrplTransactionSigningAccount,
  type SignerAccountRef,
  type XrplEnvSignerRole,
} from '@/lib/signing/types'
import { resolveSigningAccount } from '@/services/signer.service'

function resolveManagedWalletId(role: XrplEnvSignerRole): string | null {
  if (role === 'issuer') {
    return process.env.XRPL_ISSUER_WALLET_ID?.trim() || null
  }
  if (role === 'distributor') {
    return process.env.XRPL_DISTRIBUTOR_WALLET_ID?.trim() || null
  }
  return process.env.XRPL_WALLET_ID?.trim() || null
}

export function getConfiguredXrplAccountRef(role: XrplEnvSignerRole): SignerAccountRef {
  const walletId = resolveManagedWalletId(role)
  if (walletId) {
    return {
      kind: 'managed',
      walletId,
    }
  }

  return {
    kind: 'xrpl-env',
    role,
  }
}

export async function resolveConfiguredXrplAccount(role: XrplEnvSignerRole) {
  return assertXrplTransactionSigningAccount(
    await resolveSigningAccount(getConfiguredXrplAccountRef(role)),
  )
}

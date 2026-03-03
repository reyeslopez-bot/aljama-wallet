import { DeterministicVault, type VaultId } from '@/lib/crypto/deterministic-key-engine'
import {
  createWalletPqcEncryptedMaterialFromKeyPair,
  encodeRawWalletPqcKeyPair,
} from '@/lib/pqc/provider'
import type {
  WalletPqcBoundSubject,
  WalletPqcDerivationChain,
  WalletPqcEncryptedMaterial,
} from '@/lib/pqc/types'

export type DeriveDeterministicWalletPqcMaterialInput = {
  mnemonic: string
  mnemonicPassphrase?: string
  vaultId?: VaultId
  chain: WalletPqcDerivationChain
  derivationPath: string
  subject: WalletPqcBoundSubject
  attestedAt?: string
}

export async function deriveDeterministicWalletPqcMaterial(
  input: DeriveDeterministicWalletPqcMaterialInput,
): Promise<WalletPqcEncryptedMaterial> {
  const vault = new DeterministicVault(
    {
      id: input.vaultId ?? 'public',
      mnemonic: input.mnemonic,
    },
    {
      passphrase: input.mnemonicPassphrase?.trim() ?? '',
    },
  )

  try {
    const derived = vault.derivePostQuantumAtPath(input.chain, input.derivationPath.trim())
    const keyPair = encodeRawWalletPqcKeyPair({
      publicKey: derived.publicKey,
      privateKey: derived.privateKey,
    })

    return createWalletPqcEncryptedMaterialFromKeyPair({
      keyPair,
      subject: input.subject,
      attestedAt: input.attestedAt,
      derivation: derived.derivation,
    })
  } finally {
    vault.lock()
  }
}

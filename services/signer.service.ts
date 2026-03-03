import { Wallet as EvmWallet } from 'ethers'
import { Wallet as XrplWallet } from 'xrpl'
import { decryptPrivateKey, encryptPrivateKey } from '@/lib/crypto/wallet-crypto'
import { createEncryptedWallet, type WalletSecurityProfile } from '@/lib/wallet'
import { getXrplSignerAccount, getXrplSignerWallet } from '@/lib/xrpl-signer'
import {
  type ResolvedSigningAccount,
  type SignRequest,
  type SignResult,
  type SignerAccountRef,
  type SigningCurve,
  type SigningScheme,
  type VaultScope,
} from '@/lib/signing/types'
import { createWalletRecord, getWalletById } from '@/services/wallet.service'

type SigningEvidence = {
  secondFactorVerified?: boolean
  pqAttestation?: {
    scheme: string
    signature: string
  }
}

export interface Signer {
  getPublicKey(accountRef: SignerAccountRef): Promise<string>
  sign(
    request: SignRequest,
    accountRef: SignerAccountRef,
    evidence?: SigningEvidence,
  ): Promise<SignResult>
  supports(curve: SigningCurve, scheme: SigningScheme): boolean
}

export type PrepareManagedWalletProvisioningInput = {
  password: string
  mnemonic?: string
  mnemonicPassphrase?: string
  vaultId?: VaultScope
  securityProfile?: WalletSecurityProfile
}

export type ManagedWalletProvisioningHandle = {
  encrypted: string
  address: string
  derivationPath: string
  wordCount: number
  persist: () => Promise<Awaited<ReturnType<typeof createWalletRecord>>>
}

function assertPolicySatisfied(account: ResolvedSigningAccount, evidence?: SigningEvidence) {
  if (account.policy.requiresSecondFactor && !evidence?.secondFactorVerified) {
    throw new Error('SECOND_FACTOR_REQUIRED')
  }

  if (account.policy.requiresPQAttestation && !evidence?.pqAttestation) {
    throw new Error('PQ_ATTESTATION_REQUIRED')
  }
}

async function loadManagedSigningMaterial(accountRef: Extract<SignerAccountRef, { kind: 'managed' }>) {
  const account = await getWalletById(accountRef.walletId)
  if (!account) {
    throw new Error('WALLET_NOT_FOUND')
  }

  if (account.signerBackend !== 'local') {
    throw new Error('UNSUPPORTED_SIGNER_BACKEND')
  }

  if (!account.encryptedPrivateKey || !account.encryptionIv || account.keyVersion === null) {
    throw new Error('SIGNER_MATERIAL_UNAVAILABLE')
  }

  const privateKey = decryptPrivateKey(
    Buffer.from(account.encryptedPrivateKey),
    Buffer.from(account.encryptionIv),
    account.keyVersion,
    { address: account.address },
  )

  const resolved: ResolvedSigningAccount = {
    id: account.id,
    accountRef: account.accountRef,
    chain: account.chain,
    address: account.address,
    pubKey: account.pubKey,
    keyType: account.keyType,
    signerBackend: account.signerBackend,
    vaultId: account.vaultId,
    derivationPath: account.derivationPath,
    policy: account.policy,
    pqcBinding: account.pqcBinding,
    createdAt: account.createdAt,
  }

  return {
    account: resolved,
    privateKey: privateKey.trim().startsWith('0x') ? privateKey.trim() : `0x${privateKey.trim()}`,
  }
}

export async function resolveSigningAccount(accountRef: SignerAccountRef): Promise<ResolvedSigningAccount> {
  if (accountRef.kind === 'xrpl-env') {
    return getXrplSignerAccount()
  }

  const material = await loadManagedSigningMaterial(accountRef)
  return material.account
}

export async function prepareManagedWalletProvisioning(
  input: PrepareManagedWalletProvisioningInput,
): Promise<ManagedWalletProvisioningHandle> {
  const created = await createEncryptedWallet(input.password, {
    mnemonic: input.mnemonic,
    mnemonicPassphrase: input.mnemonicPassphrase,
    securityProfile: input.securityProfile,
  })

  const wallet = new EvmWallet(created.wallet.privateKey)
  const encryptedSignerMaterial = encryptPrivateKey(created.wallet.privateKey, {
    address: created.wallet.address,
  })

  return {
    encrypted: created.encrypted,
    address: created.wallet.address,
    derivationPath: created.derivationPath,
    wordCount: created.wordCount,
    persist: () =>
      createWalletRecord({
        address: created.wallet.address,
        pubKey: wallet.signingKey.publicKey,
        keyType: 'secp256k1',
        signerBackend: 'local',
        vaultId: input.vaultId ?? 'public',
        derivationPath: created.derivationPath,
        encryptedPrivateKey: encryptedSignerMaterial.encryptedPrivateKey,
        encryptionIv: encryptedSignerMaterial.encryptionIv,
        keyVersion: encryptedSignerMaterial.keyVersion,
      }),
  }
}

class LocalSigner implements Signer {
  supports(curve: SigningCurve, scheme: SigningScheme): boolean {
    if (curve === 'secp256k1' && scheme === 'ecdsa') return true
    if (curve === 'ed25519' && scheme === 'eddsa') return true
    return false
  }

  async getPublicKey(accountRef: SignerAccountRef): Promise<string> {
    if (accountRef.kind === 'xrpl-env') {
      return getXrplSignerAccount().pubKey ?? ''
    }

    const { account, privateKey } = await loadManagedSigningMaterial(accountRef)
    if (account.pubKey) return account.pubKey
    return new EvmWallet(privateKey).signingKey.publicKey
  }

  async sign(
    request: SignRequest,
    accountRef: SignerAccountRef,
    evidence?: SigningEvidence,
  ): Promise<SignResult> {
    if (accountRef.kind === 'xrpl-env') {
      const account = getXrplSignerAccount()
      assertPolicySatisfied(account, evidence)

      if (request.kind !== 'xrpl-transaction') {
        throw new Error('SIGNER_CHAIN_MISMATCH')
      }

      const signed = getXrplSignerWallet().sign(
        request.preparedTransaction as Parameters<ReturnType<typeof getXrplSignerWallet>['sign']>[0],
      )
      return {
        kind: 'xrpl-transaction',
        txBlob: signed.tx_blob,
        txHash: signed.hash,
        publicKey: account.pubKey ?? '',
      }
    }

    const { account, privateKey } = await loadManagedSigningMaterial(accountRef)
    assertPolicySatisfied(account, evidence)

    if (request.kind === 'evm-transaction') {
      if (account.chain !== 'EVM') {
        throw new Error('SIGNER_CHAIN_MISMATCH')
      }

      const wallet = new EvmWallet(privateKey)
      const signedPayload = await wallet.signTransaction({
        ...request.transaction,
        chainId: request.chainId,
      })
      return {
        kind: 'evm-transaction',
        signedPayload,
        publicKey: account.pubKey ?? wallet.signingKey.publicKey,
      }
    }

    if (account.chain !== 'XRPL') {
      throw new Error('SIGNER_CHAIN_MISMATCH')
    }
    if (!account.pubKey) {
      throw new Error('SIGNER_PUBLIC_KEY_MISSING')
    }

    const wallet = new XrplWallet(account.pubKey, privateKey, {
      masterAddress: account.address,
    })
    const signed = wallet.sign(
      request.preparedTransaction as Parameters<typeof wallet.sign>[0],
    )
    return {
      kind: 'xrpl-transaction',
      txBlob: signed.tx_blob,
      txHash: signed.hash,
      publicKey: account.pubKey,
    }
  }
}

const signer = new LocalSigner()

export function getSigner(): Signer {
  return signer
}

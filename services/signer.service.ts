import { Wallet as EvmWallet } from 'ethers'
import { Wallet as XrplWallet } from 'xrpl'
import { decryptPrivateKey, encryptPrivateKey } from '@/lib/crypto/wallet-crypto'
import { deriveDeterministicWalletPqcMaterial } from '@/lib/pqc/deterministic'
import { resolveWalletPqcSubjectScheme } from '@/lib/pqc/provider'
import {
  buildHybridWalletSecurityProfile,
  encodeWalletToEncrypted,
  prepareWalletMaterial,
  type WalletSecurityProfile,
} from '@/lib/wallet'
import { getXrplSignerAccount, getXrplSignerWallet } from '@/lib/xrpl-signer'
import {
  assertEvmTransactionSigningAccount,
  assertXrplTransactionSigningAccount,
  buildAccountRef,
  type ResolvedSigningAccount,
  type SignRequest,
  type SignResult,
  type SignerAccountRef,
  type LiveTransactionCurve,
  type LiveTransactionScheme,
  type VaultScope,
} from '@/lib/signing/types'
import { createWalletRecord, getWalletById, getWalletSigningAccount } from '@/services/wallet.service'

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
  supports(curve: LiveTransactionCurve, scheme: LiveTransactionScheme): boolean
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
    pqcBindingHash: account.pqcBindingHash,
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

  const account = await getWalletSigningAccount(accountRef.walletId)
  if (!account) {
    throw new Error('WALLET_NOT_FOUND')
  }
  return account
}

export async function prepareManagedWalletProvisioning(
  input: PrepareManagedWalletProvisioningInput,
): Promise<ManagedWalletProvisioningHandle> {
  const prepared = prepareWalletMaterial({
    mnemonic: input.mnemonic,
    mnemonicPassphrase: input.mnemonicPassphrase,
  })

  const wallet = new EvmWallet(prepared.wallet.privateKey)
  const postQuantum = await deriveDeterministicWalletPqcMaterial({
    mnemonic: prepared.mnemonic,
    mnemonicPassphrase: input.mnemonicPassphrase,
    vaultId: input.vaultId ?? 'public',
    chain: 'ETH',
    derivationPath: prepared.derivationPath,
    subject: {
      accountRef: buildAccountRef({
        chain: 'EVM',
        keyType: 'secp256k1',
        pubKey: wallet.signingKey.publicKey,
        address: prepared.wallet.address,
      }),
      chain: 'EVM',
      address: prepared.wallet.address,
      keyType: 'secp256k1',
      scheme: resolveWalletPqcSubjectScheme('secp256k1'),
      publicKey: wallet.signingKey.publicKey,
      publicKeyFormat: 'hex',
    },
  })
  const securityProfile = buildHybridWalletSecurityProfile('secp256k1', input.securityProfile)
  const encrypted = await encodeWalletToEncrypted(prepared.wallet, input.password, {
    securityProfile,
    postQuantum,
  })
  const encryptedSignerMaterial = encryptPrivateKey(prepared.wallet.privateKey, {
    address: prepared.wallet.address,
  })

  return {
    encrypted,
    address: prepared.wallet.address,
    derivationPath: prepared.derivationPath,
    wordCount: prepared.wordCount,
    persist: () =>
      createWalletRecord({
        address: prepared.wallet.address,
        pubKey: wallet.signingKey.publicKey,
        keyType: 'secp256k1',
        signerBackend: 'local',
        vaultId: input.vaultId ?? 'public',
        derivationPath: prepared.derivationPath,
        pqcBinding: postQuantum.binding,
        encryptedPrivateKey: encryptedSignerMaterial.encryptedPrivateKey,
        encryptionIv: encryptedSignerMaterial.encryptionIv,
        keyVersion: encryptedSignerMaterial.keyVersion,
      }),
  }
}

class LocalSigner implements Signer {
  supports(curve: LiveTransactionCurve, scheme: LiveTransactionScheme): boolean {
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
    // Guardrail: live chain execution is classical-only. PQ material is limited to
    // off-chain binding/attestation and on-chain commitment hashes in this repo.
    if (accountRef.kind === 'xrpl-env') {
      const account = assertXrplTransactionSigningAccount(getXrplSignerAccount())
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
      const evmAccount = assertEvmTransactionSigningAccount(account)

      const wallet = new EvmWallet(privateKey)
      const signedPayload = await wallet.signTransaction({
        ...request.transaction,
        chainId: request.chainId,
      })
      return {
        kind: 'evm-transaction',
        signedPayload,
        publicKey: evmAccount.pubKey ?? wallet.signingKey.publicKey,
      }
    }

    const xrplAccount = assertXrplTransactionSigningAccount(account)

    const wallet = new XrplWallet(xrplAccount.pubKey, privateKey, {
      masterAddress: xrplAccount.address,
    })
    const signed = wallet.sign(
      request.preparedTransaction as Parameters<typeof wallet.sign>[0],
    )
    return {
      kind: 'xrpl-transaction',
      txBlob: signed.tx_blob,
      txHash: signed.hash,
      publicKey: xrplAccount.pubKey,
    }
  }
}

const signer = new LocalSigner()

export function getSigner(): Signer {
  return signer
}

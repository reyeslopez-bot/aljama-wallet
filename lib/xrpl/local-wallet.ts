import { Wallet } from 'xrpl'
import {
  UserDeterministicWallet,
  type EncryptedLocalXrplWallet,
  unlockWalletWithSecurityProfile,
  type UnlockWalletParams,
} from '@/lib/wallet'

function toEd25519Hex(bytes: Uint8Array): string {
  return `ED${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

export function deriveLocalXrplWallet(mnemonic: string): EncryptedLocalXrplWallet {
  const deterministicWallet = new UserDeterministicWallet(mnemonic)
  const key = deterministicWallet.publicVault.derive({
    chain: 'XRPL_ED',
    account: 0,
    change: 0,
    index: 0,
  })

  if (!key.privateKey) {
    throw new Error('XRPL private key derivation failed')
  }

  return {
    address: key.address,
    publicKey: toEd25519Hex(key.publicKey),
    privateKey: toEd25519Hex(key.privateKey),
  }
}

export function createLocalXrplSigner(material: EncryptedLocalXrplWallet): Wallet {
  const signer = new Wallet(material.publicKey, material.privateKey)
  if (signer.classicAddress !== material.address) {
    throw new Error('XRPL wallet material does not match its address')
  }
  return signer
}

export async function unlockLocalXrplSigner(params: UnlockWalletParams): Promise<Wallet> {
  const unlockedWallet = await unlockWalletWithSecurityProfile(params)
  if (!unlockedWallet.xrplWallet) {
    throw new Error('This wallet does not have XRPL signing enabled. Restore or create an XRPL wallet first.')
  }
  return createLocalXrplSigner(unlockedWallet.xrplWallet)
}

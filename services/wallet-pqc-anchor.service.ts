import { prismaCrdb } from '@/lib/prisma-crdb'

export type WalletPqcAnchorChainType = 'EVM' | 'XRPL'
export type WalletPqcAnchorStatus = 'submitted' | 'confirmed' | 'failed' | 'placeholder'

export type CreateWalletPqcAnchorInput = {
  walletId: string
  chainType: WalletPqcAnchorChainType
  networkId: string
  registryAddress?: string | null
  bindingHash: string
  statementHash: string
  signatureHash: string
  publicKeyHash: string
  uri: string
  uriHash: string
  txHash: string
  status: WalletPqcAnchorStatus
}

export async function createWalletPqcAnchorRecord(input: CreateWalletPqcAnchorInput) {
  return prismaCrdb.walletPqcAnchor.create({
    data: {
      walletId: input.walletId,
      chainType: input.chainType,
      networkId: input.networkId,
      registryAddress: input.registryAddress?.trim() || null,
      bindingHash: input.bindingHash.trim(),
      statementHash: input.statementHash.trim(),
      signatureHash: input.signatureHash.trim(),
      publicKeyHash: input.publicKeyHash.trim(),
      uri: input.uri.trim(),
      uriHash: input.uriHash.trim(),
      txHash: input.txHash.trim(),
      status: input.status,
    },
    select: {
      id: true,
      walletId: true,
      chainType: true,
      networkId: true,
      registryAddress: true,
      bindingHash: true,
      statementHash: true,
      signatureHash: true,
      publicKeyHash: true,
      uri: true,
      uriHash: true,
      txHash: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

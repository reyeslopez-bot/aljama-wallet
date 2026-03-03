import { Interface, type InterfaceAbi } from 'ethers'
import registryAbi from '@/lib/contracts/generated/pqc-binding-registry.abi.json'

const registryInterface = new Interface(registryAbi as InterfaceAbi)

export const PQC_BINDING_REGISTRY_ABI = registryAbi

export type CommitPqcBindingCall = {
  statementHash: string
  signatureHash: string
  publicKeyHash: string
  uriHash: string
  uri: string
}

export function encodeCommitPqcBindingCalldata(input: CommitPqcBindingCall): string {
  return registryInterface.encodeFunctionData('commitBinding', [
    input.statementHash,
    input.signatureHash,
    input.publicKeyHash,
    input.uriHash,
    input.uri,
  ])
}

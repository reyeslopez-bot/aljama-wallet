import { AbiCoder, getBytes, hexlify, keccak256, toUtf8Bytes } from 'ethers'
import type { WalletPqcBinding, WalletPqcCommitmentHashes } from '@/lib/pqc/types'

const ABI_CODER = AbiCoder.defaultAbiCoder()
const PQC_BINDING_DOMAIN = 'aljama:pqc-binding:v1'
const XRPL_MEMO_TYPE = 'aljama:pqc-binding:v1'
const XRPL_MEMO_FORMAT = 'application/json'

export type XrplPqcAnchorMemo = {
  Memo: {
    MemoType: string
    MemoFormat: string
    MemoData: string
  }
  payload: {
    v: 1
    bh: string
    st: string
    sg: string
    pk: string
    ur: string
  }
  payloadBytesLength: number
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'))
  }

  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function utf8ToHex(value: string): string {
  return hexlify(toUtf8Bytes(value)).slice(2).toUpperCase()
}

function assertRawBase64Signature(binding: WalletPqcBinding): void {
  if (binding.proof.signatureFormat !== 'raw-base64') {
    throw new Error('Unsupported PQC binding signature format')
  }
}

function decodePublicKey(binding: WalletPqcBinding): Uint8Array {
  if (binding.publicKeyFormat !== 'raw-base64' && binding.publicKeyFormat !== 'spki-der-base64') {
    throw new Error('Unsupported PQC binding public key format')
  }

  return base64ToBytes(binding.publicKey)
}

function hashUtf8(value: string): string {
  return keccak256(toUtf8Bytes(value))
}

function hashBytes(bytes: Uint8Array): string {
  return keccak256(bytes)
}

export function buildEvmBindingHash(input: Pick<
  WalletPqcCommitmentHashes,
  'statementHash' | 'signatureHash' | 'publicKeyHash'
>): string {
  return keccak256(
    ABI_CODER.encode(
      ['bytes32', 'bytes32', 'bytes32', 'bytes32'],
      [hashUtf8(PQC_BINDING_DOMAIN), input.statementHash, input.signatureHash, input.publicKeyHash],
    ),
  )
}

export function buildPqcBindingHashes(
  binding: WalletPqcBinding,
  uri?: string | null,
): WalletPqcCommitmentHashes {
  assertRawBase64Signature(binding)

  const statementHash = hashUtf8(binding.challenge.statement)
  const signatureHash = hashBytes(base64ToBytes(binding.proof.signature))
  const publicKeyHash = hashBytes(decodePublicKey(binding))

  return {
    bindingHash: buildEvmBindingHash({ statementHash, signatureHash, publicKeyHash }),
    statementHash,
    signatureHash,
    publicKeyHash,
    uriHash: uri?.trim() ? hashUtf8(uri.trim()) : null,
  }
}

export function buildXrplPqcAnchorMemo(hashes: WalletPqcCommitmentHashes): XrplPqcAnchorMemo {
  if (!hashes.uriHash) {
    throw new Error('uriHash is required for XRPL PQC anchor memos')
  }

  const payload = {
    v: 1 as const,
    bh: hexlify(getBytes(hashes.bindingHash)),
    st: hexlify(getBytes(hashes.statementHash)),
    sg: hexlify(getBytes(hashes.signatureHash)),
    pk: hexlify(getBytes(hashes.publicKeyHash)),
    ur: hexlify(getBytes(hashes.uriHash)),
  }
  const payloadJson = JSON.stringify(payload)
  const payloadBytesLength = toUtf8Bytes(payloadJson).length

  return {
    Memo: {
      MemoType: utf8ToHex(XRPL_MEMO_TYPE),
      MemoFormat: utf8ToHex(XRPL_MEMO_FORMAT),
      MemoData: utf8ToHex(payloadJson),
    },
    payload,
    payloadBytesLength,
  }
}

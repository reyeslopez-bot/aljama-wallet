// tests/helpers/walletMocks.ts

import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet, sepolia } from 'viem/chains'
import type { CreateConnectorFn } from 'wagmi'

// Keep raw private keys separately
const primaryPrivateKey =
  '0x59c6995e998f97a5a0044976f6367842d895c5ba6f7d8abf28de0b9230e65036' as `0x${string}`

const secondaryPrivateKey =
  '0x8b3a350cf5c34c9194ca614ff5481a11b77119abbe3f8dd1dbe9a6bdf8be8ab5' as `0x${string}`

// Base viem accounts (no privateKey on the type)
const primaryAccount = privateKeyToAccount(primaryPrivateKey)
const secondaryAccount = privateKeyToAccount(secondaryPrivateKey)

// Attach privateKey explicitly so tests can read it
export const mockAccounts = {
  primary: {
    ...(primaryAccount as any),
    privateKey: primaryPrivateKey,
  },
  secondary: {
    ...(secondaryAccount as any),
    privateKey: secondaryPrivateKey,
  },
} as const

export const mockWalletClients = {
  mainnet: createWalletClient({
    account: primaryAccount,
    chain: mainnet,
    transport: http(),
  }),
  sepolia: createWalletClient({
    account: secondaryAccount,
    chain: sepolia,
    transport: http(),
  }),
}

export const mockPublicClients = {
  mainnet: createPublicClient({
    chain: mainnet,
    transport: http(),
  }),
  sepolia: createPublicClient({
    chain: sepolia,
    transport: http(),
  }),
}

export const mockConnector: CreateConnectorFn = () =>
  ({
    id: 'mock',
    name: 'Mock Connector',
    type: 'mock',
    setup: async () => {},

    // Cast return to any to satisfy wagmi’s gnarly generics
    connect: async () =>
      ({
        accounts: [primaryAccount.address],
        chainId: mainnet.id,
      } as any),

    disconnect: async () => {},
    getAccounts: async () => [primaryAccount.address],
    getChainId: async () => mainnet.id,
    on: () => () => {},
  } as any)

// Use the same mockAccounts.primary values that tests expect
export const mockEncryptedWallet = (password: string) =>
  Buffer.from(
    JSON.stringify({
      address: mockAccounts.primary.address,
      privateKey: mockAccounts.primary.privateKey,
      passwordHint: password,
    }),
    'utf-8',
  ).toString('base64')

export const mockEncryptedWalletMissingMaterial = (
  missingField: 'privateKey' | 'address',
) =>
  Buffer.from(
    JSON.stringify({
      ...(missingField === 'address' ? {} : { address: mockAccounts.primary.address }),
      ...(missingField === 'privateKey'
        ? {}
        : { privateKey: mockAccounts.primary.privateKey }),
    }),
    'utf-8',
  ).toString('base64')

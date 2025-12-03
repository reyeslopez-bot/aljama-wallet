// tests/helpers/walletMocks.ts

import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet, sepolia } from 'viem/chains'
import type { CreateConnectorFn } from 'wagmi'

// Deterministic accounts for tests
const primaryAccount = privateKeyToAccount(
  '0x59c6995e998f97a5a0044976f6367842d895c5ba6f7d8abf28de0b9230e65036',
)

const secondaryAccount = privateKeyToAccount(
  '0x8b3a350cf5c34c9194ca614ff5481a11b77119abbe3f8dd1dbe9a6bdf8be8ab5',
)

export const mockAccounts = {
  primary: primaryAccount,
  secondary: secondaryAccount,
}

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

export const mockConnector: CreateConnectorFn = () => ({
  id: 'mock',
  name: 'Mock Connector',
  type: 'mock',
  setup: async () => ({
    accounts: [primaryAccount.address],
    chainId: mainnet.id,
  }),
  connect: async () => ({
    accounts: [primaryAccount.address],
    chainId: mainnet.id,
  }),
  disconnect: async () => {},
  getAccounts: async () => [primaryAccount.address],
  getChainId: async () => mainnet.id,
  on: () => () => {},
})

export const mockEncryptedWallet = (password: string) =>
  Buffer.from(
    JSON.stringify({
      address: primaryAccount.address,
      privateKey: primaryAccount.privateKey,
      passwordHint: password,
    }),
    'utf-8',
  ).toString('base64')

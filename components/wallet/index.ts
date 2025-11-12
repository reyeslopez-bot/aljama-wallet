// components/wallet/index.ts

// Display current wallet balance
export { default as BalanceDisplay } from './ui/BalanceDisplay'

// Button to connect to a wallet provider
export { default as ConnectButton } from './ui/ConnectButtons'

// Low‑level WalletConnect component
export { default as WalletDetector } from './ui/WalletDetector'

// The slide‑out drawer UI for wallet forms
export { SlidePanel } from './panels/SlidePanel'

// Form to send ETH transactions
export { default as SendTransactionForm } from './forms/SendTransactionForm'

// Form to create a brand‑new wallet
export { default as CreateWalletForm } from './forms/CreateWalletForm'

// Form to unlock an existing wallet with a password
export { default as UnlockWalletForm } from './forms/UnlockWalletForm'

// Form to import a wallet from a recovery phrase
export { default as ImportWalletForm } from './forms/ImportWalletForm'

// High‑level manager component that ties buttons + drawer together
export { default as WalletManager } from './manager/WalletManager'

// Generic wrapper for wallet‑related forms (styling container)
export { default as WalletForm } from './forms/WalletForm'


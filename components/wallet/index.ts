// components/wallet/index.ts

// Display current wallet balance
export { default as BalanceDisplay } from './BalanceDisplay'

// Button to connect to a wallet provider
export { default as ConnectButton } from './ConnectButton'

// Low‑level WalletConnect component
export { default as WalletConnect } from './WalletConnect'

// The slide‑out drawer UI for wallet forms
export { default as WalletDrawer } from './WalletDrawer'

// Form to send ETH transactions
export { default as SendTransactionForm } from './SendTransactionForm'

// Form to create a brand‑new wallet
export { default as CreateWalletForm } from './CreateWalletForm'

// Form to unlock an existing wallet with a password
export { default as UnlockWalletForm } from './UnlockWalletForm'

// Form to import a wallet from a recovery phrase
export { default as ImportWalletForm } from './ImportWalletForm'

// High‑level manager component that ties buttons + drawer together
export { default as WalletManager } from './WalletManager'

// Generic wrapper for wallet‑related forms (styling container)
export { default as WalletForm } from './WalletForm'


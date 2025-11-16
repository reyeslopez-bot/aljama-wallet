export type UnlockWalletParams = {
  encrypted: string
  password: string
}

export async function unlockWallet(_params: UnlockWalletParams) {
  // TODO: implement real unlock logic
  throw new Error('unlockWallet not implemented yet')
}

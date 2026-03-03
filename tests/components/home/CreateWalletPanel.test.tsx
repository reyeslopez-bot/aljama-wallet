// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CreateWalletPanel } from '@/components/home/CreateWalletPanel'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import { useSession } from 'next-auth/react'

const { mockGenerateMnemonicWallet, mockEncodeWalletToEncrypted } = vi.hoisted(() => ({
  mockGenerateMnemonicWallet: vi.fn(),
  mockEncodeWalletToEncrypted: vi.fn(),
}))

vi.mock('@/lib/wallet', async () => {
  const actual = await vi.importActual<typeof import('@/lib/wallet')>('@/lib/wallet')
  return {
    ...actual,
    generateMnemonicWallet: mockGenerateMnemonicWallet,
    encodeWalletToEncrypted: mockEncodeWalletToEncrypted,
  }
})

const mockedUseSession = vi.mocked(useSession)
const initialState = useDynamicInfoStore.getState()

const testMnemonicWords = Array.from({ length: 24 }, () => 'able')

const resetStore = () => {
  useDynamicInfoStore.setState(
    {
      ...initialState,
      wallet: { ...initialState.wallet },
    },
    true,
  )
}

function completeRecoveryCheck(
  getByTestId: ReturnType<typeof render>['getByTestId'],
  getAllByTestId: ReturnType<typeof render>['getAllByTestId'],
) {
  const recoveryInputs = getAllByTestId('create-wallet-recovery-input') as HTMLInputElement[]

  for (const input of recoveryInputs) {
    fireEvent.change(input, { target: { value: 'able' } })
  }

  fireEvent.click(getByTestId('create-wallet-recovery-backed-up'))
  fireEvent.click(getByTestId('create-wallet-recovery-loss-accepted'))
  fireEvent.click(getByTestId('create-wallet-submit'))
}

describe('CreateWalletPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    sessionStorage.clear()
    vi.stubEnv('NEXT_PUBLIC_ONRAMP_URL_TEMPLATE', '')

    mockGenerateMnemonicWallet.mockReturnValue({
      address: '0x1111111111111111111111111111111111111111',
      privateKey: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      mnemonic: testMnemonicWords.join(' '),
      derivationPath: "m/44'/60'/0'/0/0",
      wordCount: 24,
    })
    mockEncodeWalletToEncrypted.mockResolvedValue('encrypted-payload')

    mockedUseSession.mockReturnValue({
      data: { user: { id: 'test-user', email: 'test@example.com' } },
      status: 'authenticated',
    } as any)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('keeps create button disabled while unauthenticated', () => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    } as any)

    const { getByTestId } = render(<CreateWalletPanel />)

    const input = getByTestId('create-wallet-password-input') as HTMLInputElement
    const button = getByTestId('create-wallet-submit') as HTMLButtonElement

    expect(input.disabled).toBe(true)
    expect(button.disabled).toBe(true)
    expect(getByTestId('create-wallet-unlock')).toBeTruthy()
  })

  it('creates wallet locally and persists encrypted session only after recovery verification', async () => {
    const {
      getByTestId,
      getByText,
      getAllByTestId,
    } = render(<CreateWalletPanel />)

    fireEvent.change(getByTestId('create-wallet-password-input'), {
      target: { value: 'VeryStrongPassphrase1!' },
    })

    fireEvent.click(getByTestId('create-wallet-submit'))

    await waitFor(() => {
      expect(getByTestId('create-wallet-recovery-section')).toBeTruthy()
      expect(mockGenerateMnemonicWallet).toHaveBeenCalledTimes(1)
      expect(getByTestId('create-wallet-mnemonic-copy')).toBeTruthy()
    })

    expect(sessionStorage.getItem('aljama.encryptedWallet')).toBeNull()

    completeRecoveryCheck(getByTestId, getAllByTestId)

    await waitFor(() => {
      expect(getByTestId('create-wallet-ready-panel')).toBeTruthy()
      expect(getByTestId('create-wallet-copy-address')).toBeTruthy()
      expect(getByText('Receive onchain')).toBeTruthy()
      expect(useDynamicInfoStore.getState().createWalletStatus).toBe('success')
      expect(useDynamicInfoStore.getState().wallet.createdAddress).toBe('0x1111111111111111111111111111111111111111')
      expect(sessionStorage.getItem('aljama.encryptedWallet')).toBe('encrypted-payload')
      expect(sessionStorage.getItem('aljama.walletId')).toBeNull()
    })

    const buyWithCard = getByTestId('create-wallet-buy-with-card') as HTMLAnchorElement
    expect(buyWithCard.getAttribute('href')).toContain('walletAddress=0x1111111111111111111111111111111111111111')
  })

  it('shows passphrase backup guidance and allows copying generated passphrase', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const { getByTestId, getByText } = render(<CreateWalletPanel />)

    fireEvent.click(getByTestId('create-wallet-passphrase-generate'))

    const input = getByTestId('create-wallet-password-input') as HTMLInputElement
    expect(input.value.length).toBeGreaterThanOrEqual(32)
    expect(getByText('Strong')).toBeTruthy()
    expect(getByTestId('create-wallet-passphrase-offer')).toBeTruthy()
    const copyButton = getByTestId('create-wallet-passphrase-copy')
    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(input.value)
      expect(copyButton.textContent).toContain('Passphrase copied')
    })
  })

  it('uses custom on-ramp template and hides default-provider notice', async () => {
    vi.stubEnv(
      'NEXT_PUBLIC_ONRAMP_URL_TEMPLATE',
      'https://buy.example/checkout?dest={address}&network=base',
    )

    const {
      getByTestId,
      getAllByTestId,
      queryByText,
    } = render(<CreateWalletPanel />)

    fireEvent.change(getByTestId('create-wallet-password-input'), {
      target: { value: 'VeryStrongPassphrase1!' },
    })

    fireEvent.click(getByTestId('create-wallet-submit'))

    await waitFor(() => {
      expect(getByTestId('create-wallet-recovery-section')).toBeTruthy()
    })

    completeRecoveryCheck(getByTestId, getAllByTestId)

    await waitFor(() => {
      const buyWithCard = getByTestId('create-wallet-buy-with-card') as HTMLAnchorElement
      expect(buyWithCard.getAttribute('href')).toBe(
        'https://buy.example/checkout?dest=0x1111111111111111111111111111111111111111&network=base',
      )
      expect(queryByText(/Using a default card provider/i)).toBeNull()
    })
  })

  it('keeps hidden vault passphrase empty until generate is clicked and does not expose a copy action', async () => {
    const { getByTestId, queryByTestId } = render(<CreateWalletPanel />)

    fireEvent.click(getByTestId('create-wallet-mnemonic-switch'))
    const mnemonicInput = getByTestId('create-wallet-mnemonic-passphrase-input') as HTMLInputElement
    expect(mnemonicInput.value).toBe('')

    fireEvent.click(getByTestId('create-wallet-mnemonic-passphrase-generate'))
    expect(mnemonicInput.value.length).toBeGreaterThanOrEqual(16)

    const firstValue = mnemonicInput.value
    fireEvent.click(getByTestId('create-wallet-mnemonic-passphrase-generate'))
    expect(mnemonicInput.value.length).toBeGreaterThanOrEqual(16)
    expect(mnemonicInput.value).not.toBe(firstValue)

    expect(queryByTestId('create-wallet-mnemonic-passphrase-copy')).toBeNull()
  })
})

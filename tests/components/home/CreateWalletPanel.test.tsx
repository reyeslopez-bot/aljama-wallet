// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CreateWalletPanel } from '@/components/home/CreateWalletPanel'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import { useSession } from 'next-auth/react'

const {
  mockGenerateMnemonicWallet,
  mockEncodeWalletToEncrypted,
  mockDeriveDeterministicWalletPqcMaterial,
  mockDeriveWalletFromMnemonic,
} = vi.hoisted(() => ({
  mockGenerateMnemonicWallet: vi.fn(),
  mockEncodeWalletToEncrypted: vi.fn(),
  mockDeriveDeterministicWalletPqcMaterial: vi.fn(),
  mockDeriveWalletFromMnemonic: vi.fn(),
}))

vi.mock('@/lib/wallet', async () => {
  const actual = await vi.importActual<typeof import('@/lib/wallet')>('@/lib/wallet')
  class MockUserDeterministicWallet {
    publicVault = {
      derive: ({
        chain,
        account,
        index,
      }: {
        chain: string
        account: number
        change?: 0 | 1
        index: number
      }) => ({ address: `${chain.toLowerCase()}-public-${account}-${index}` }),
    }
    privateVault = {
      derive: ({
        chain,
        account,
        index,
      }: {
        chain: string
        account: number
        change?: 0 | 1
        index: number
      }) => ({ address: `${chain.toLowerCase()}-hidden-${account}-${index}` }),
    }
    unlockPrivateVault() {}
    lockPrivateVault() {}
  }
  return {
    ...actual,
    deriveWalletFromMnemonic: mockDeriveWalletFromMnemonic,
    generateMnemonicWallet: mockGenerateMnemonicWallet,
    encodeWalletToEncrypted: mockEncodeWalletToEncrypted,
    UserDeterministicWallet: MockUserDeterministicWallet,
  }
})

vi.mock('@/lib/pqc/deterministic', () => ({
  deriveDeterministicWalletPqcMaterial: mockDeriveDeterministicWalletPqcMaterial,
}))

const mockedUseSession = vi.mocked(useSession)
const initialState = useDynamicInfoStore.getState()

const testMnemonicWords = [...Array.from({ length: 23 }, () => 'abandon'), 'art']

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
    const slot = Number.parseInt(input.id.replace('create-wallet-recovery-word-', ''), 10)
    const word = Number.isFinite(slot) ? testMnemonicWords[slot] : ''
    fireEvent.change(input, { target: { value: word } })
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
    mockDeriveWalletFromMnemonic.mockReturnValue({
      address: '0x2222222222222222222222222222222222222222',
      privateKey: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    })
    mockEncodeWalletToEncrypted.mockResolvedValue('encrypted-payload')
    mockDeriveDeterministicWalletPqcMaterial.mockResolvedValue({
      binding: {
        subject: {
          keyType: 'secp256k1',
        },
      },
    })

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
      expect(getByTestId('create-wallet-session-send-note').textContent).toMatch(/in-app send is not wired/i)
      expect(useDynamicInfoStore.getState().createWalletStatus).toBe('success')
      expect(useDynamicInfoStore.getState().wallet.createdAddress).toBe('0x1111111111111111111111111111111111111111')
      expect(sessionStorage.getItem('aljama.encryptedWallet')).toBe('encrypted-payload')
      expect(sessionStorage.getItem('aljama.walletId')).toBeNull()
    })

    const buyWithCard = getByTestId('create-wallet-buy-with-card') as HTMLButtonElement
    expect(buyWithCard.disabled).toBe(true)
    expect(buyWithCard.getAttribute('href')).toBeNull()
    expect(getByText(/Card checkout is not configured/i)).toBeTruthy()
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
      expect(queryByText(/Card checkout is not configured/i)).toBeNull()
    })
  })

  it('keeps hidden vault addresses sealed on the ready screen', async () => {
    const {
      getByTestId,
      getAllByTestId,
      getByText,
      queryByText,
    } = render(<CreateWalletPanel />)

    fireEvent.click(getByTestId('create-wallet-mnemonic-switch'))
    fireEvent.click(getByTestId('create-wallet-mnemonic-passphrase-generate'))
    fireEvent.change(getByTestId('create-wallet-password-input'), {
      target: { value: 'VeryStrongPassphrase1!' },
    })

    fireEvent.click(getByTestId('create-wallet-submit'))

    await waitFor(() => {
      expect(getByTestId('create-wallet-recovery-section')).toBeTruthy()
    })

    completeRecoveryCheck(getByTestId, getAllByTestId)

    await waitFor(() => {
      expect(getByTestId('create-wallet-ready-panel')).toBeTruthy()
      expect(getByText('Do this now')).toBeTruthy()
      expect(getByTestId('create-wallet-advanced-layout')).toBeTruthy()
      expect(queryByText('eth-hidden-0-0')).toBeNull()
      expect(queryByText('btc-hidden-0-0')).toBeNull()
      expect(queryByText('xrpl_ed-hidden-0-0')).toBeNull()
    })
  })

  it('keeps hidden vault passphrase empty until generate is clicked and allows copying it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const { getByTestId, queryByTestId } = render(<CreateWalletPanel />)

    fireEvent.click(getByTestId('create-wallet-mnemonic-switch'))
    const mnemonicInput = getByTestId('create-wallet-mnemonic-passphrase-input') as HTMLInputElement
    expect(mnemonicInput.value).toBe('')
    expect(queryByTestId('create-wallet-mnemonic-passphrase-copy')).toBeNull()

    fireEvent.click(getByTestId('create-wallet-mnemonic-passphrase-generate'))
    expect(mnemonicInput.value.length).toBeGreaterThanOrEqual(16)

    const firstValue = mnemonicInput.value
    fireEvent.click(getByTestId('create-wallet-mnemonic-passphrase-generate'))
    expect(mnemonicInput.value.length).toBeGreaterThanOrEqual(16)
    expect(mnemonicInput.value).not.toBe(firstValue)

    const copyButton = getByTestId('create-wallet-mnemonic-passphrase-copy')
    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(mnemonicInput.value)
      expect(copyButton.textContent).toContain('Hidden vault passphrase copied')
    })
  })
})

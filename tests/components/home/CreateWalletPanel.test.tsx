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

function completeRecoveryCheck(getByRole: ReturnType<typeof render>['getByRole'], getAllByPlaceholderText: ReturnType<typeof render>['getAllByPlaceholderText'], getByLabelText: ReturnType<typeof render>['getByLabelText']) {
  const recoveryInputs = getAllByPlaceholderText('Type the exact word') as HTMLInputElement[]

  for (const input of recoveryInputs) {
    fireEvent.change(input, { target: { value: 'able' } })
  }

  fireEvent.click(getByLabelText('I saved the recovery phrase in a secure offline location.'))
  fireEvent.click(getByLabelText('I understand this app cannot recover funds if the recovery phrase or BIP-39 passphrase is lost.'))
  fireEvent.click(getByRole('button', { name: 'Verify and finalize' }))
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

    const { getByRole, getByPlaceholderText, getByText } = render(<CreateWalletPanel />)

    const input = getByPlaceholderText('Create a passphrase you will remember') as HTMLInputElement
    const button = getByRole('button', { name: 'Create wallet' }) as HTMLButtonElement

    expect(input.disabled).toBe(true)
    expect(button.disabled).toBe(true)
    expect(getByText('Sign up to unlock actions.')).toBeTruthy()
  })

  it('creates wallet locally and persists encrypted session only after recovery verification', async () => {
    const {
      getByPlaceholderText,
      getByRole,
      getByText,
      getAllByPlaceholderText,
      getByLabelText,
      queryByRole,
    } = render(<CreateWalletPanel />)

    fireEvent.change(getByPlaceholderText('Create a passphrase you will remember'), {
      target: { value: 'VeryStrongPassphrase1!' },
    })

    fireEvent.click(getByRole('button', { name: 'Create wallet' }))

    await waitFor(() => {
      expect(getByText('Recovery phrase (24 words)')).toBeTruthy()
      expect(mockGenerateMnemonicWallet).toHaveBeenCalledTimes(1)
      expect(queryByRole('button', { name: 'Copy phrase' })).toBeNull()
    })

    expect(sessionStorage.getItem('aljama.encryptedWallet')).toBeNull()

    completeRecoveryCheck(getByRole, getAllByPlaceholderText, getByLabelText)

    await waitFor(() => {
      expect(getByText('0x1111111111111111111111111111111111111111')).toBeTruthy()
      expect(getByText('Receive onchain')).toBeTruthy()
      expect(useDynamicInfoStore.getState().createWalletStatus).toBe('success')
      expect(useDynamicInfoStore.getState().wallet.createdAddress).toBe('0x1111111111111111111111111111111111111111')
      expect(sessionStorage.getItem('aljama.encryptedWallet')).toBe('encrypted-payload')
      expect(sessionStorage.getItem('aljama.walletId')).toBeNull()
    })

    const buyWithCard = getByRole('link', { name: 'Buy with card' }) as HTMLAnchorElement
    expect(buyWithCard.getAttribute('href')).toContain('walletAddress=0x1111111111111111111111111111111111111111')
  })

  it('shows passphrase backup guidance and allows copying generated passphrase', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const { getByRole, getByPlaceholderText, getByText } = render(<CreateWalletPanel />)

    fireEvent.click(getByRole('button', { name: 'Generate Passphrase' }))

    const input = getByPlaceholderText('Create a passphrase you will remember') as HTMLInputElement
    expect(input.value.length).toBeGreaterThanOrEqual(32)
    expect(getByText('Strong')).toBeTruthy()
    expect(getByText('Encrypted passphrase ready')).toBeTruthy()
    const copyButton = getByRole('button', { name: 'Copy passphrase' })
    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(input.value)
      expect(getByText('Passphrase copied')).toBeTruthy()
    })
  })

  it('uses custom on-ramp template and hides default-provider notice', async () => {
    vi.stubEnv(
      'NEXT_PUBLIC_ONRAMP_URL_TEMPLATE',
      'https://buy.example/checkout?dest={address}&network=base',
    )

    const {
      getByPlaceholderText,
      getByRole,
      getAllByPlaceholderText,
      getByLabelText,
      queryByText,
    } = render(<CreateWalletPanel />)

    fireEvent.change(getByPlaceholderText('Create a passphrase you will remember'), {
      target: { value: 'VeryStrongPassphrase1!' },
    })

    fireEvent.click(getByRole('button', { name: 'Create wallet' }))

    await waitFor(() => {
      expect(getByRole('button', { name: 'Verify and finalize' })).toBeTruthy()
    })

    completeRecoveryCheck(getByRole, getAllByPlaceholderText, getByLabelText)

    await waitFor(() => {
      const buyWithCard = getByRole('link', { name: 'Buy with card' }) as HTMLAnchorElement
      expect(buyWithCard.getAttribute('href')).toBe(
        'https://buy.example/checkout?dest=0x1111111111111111111111111111111111111111&network=base',
      )
      expect(queryByText(/Using a default card provider/i)).toBeNull()
    })
  })
})

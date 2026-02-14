// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CreateWalletPanel } from '@/components/home/CreateWalletPanel'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'
import { useSession } from 'next-auth/react'

const mockedUseSession = vi.mocked(useSession)
const initialState = useDynamicInfoStore.getState()

const resetStore = () => {
  useDynamicInfoStore.setState(
    {
      ...initialState,
      wallet: { ...initialState.wallet },
    },
    true,
  )
}

describe('CreateWalletPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    sessionStorage.clear()
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'test-user', email: 'test@example.com' } },
      status: 'authenticated',
    } as any)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
    expect(getByText('Sign in to unlock actions.')).toBeTruthy()
  })

  it('creates wallet and persists encrypted session on submit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        address: 'rCreateWalletAddress',
        encrypted: 'encrypted-payload',
        walletId: 'wallet-1',
        mode: 'custody',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getByPlaceholderText, getByRole, getByText } = render(<CreateWalletPanel />)

    fireEvent.change(getByPlaceholderText('Create a passphrase you will remember'), {
      target: { value: 'VeryStrongPassphrase1!' },
    })
    fireEvent.click(getByRole('button', { name: 'Create wallet' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/create-wallet', expect.any(Object))
      expect(getByText('rCreateWalletAddress')).toBeTruthy()
      expect(getByText('Receive onchain')).toBeTruthy()
      expect(useDynamicInfoStore.getState().createWalletStatus).toBe('success')
      expect(useDynamicInfoStore.getState().wallet.createdAddress).toBe('rCreateWalletAddress')
      expect(sessionStorage.getItem('aljama.encryptedWallet')).toBe('encrypted-payload')
      expect(sessionStorage.getItem('aljama.walletId')).toBe('wallet-1')
    })

    const buyWithCard = getByRole('link', { name: 'Buy with card' }) as HTMLAnchorElement
    expect(buyWithCard.getAttribute('href')).toContain('walletAddress=rCreateWalletAddress')
  })

  it('offers generated encrypted passphrase without requiring email', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    const { getByRole, getByPlaceholderText, getByText } = render(<CreateWalletPanel />)

    fireEvent.click(getByRole('button', { name: 'Generate Passphrase' }))

    const input = getByPlaceholderText('Create a passphrase you will remember') as HTMLInputElement
    expect(input.value.length).toBeGreaterThanOrEqual(32)
    expect(getByText('Strong')).toBeTruthy()
    expect(getByText('Encrypted passphrase ready')).toBeTruthy()

    fireEvent.click(getByRole('button', { name: 'Copy passphrase' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
    })
  })
})

// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WalletAccessSection from '@/components/home/WalletAccessSection.client'

const mocks = vi.hoisted(() => ({
  search: '',
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

vi.mock('@/components/home/HomeStageShell.client', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-home-stage-shell">{children}</div>
  ),
}))

vi.mock('@/components/home/CreateWalletPanel', () => ({
  CreateWalletPanel: () => <div data-testid="mock-create-wallet-panel">create-panel</div>,
}))

vi.mock('@/components/home/ConnectWalletPanel.client', () => ({
  ConnectWalletPanel: () => <div data-testid="mock-connect-wallet-panel">connect-panel</div>,
}))

function installMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('WalletAccessSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.search = ''
    installMatchMedia(false)
    window.history.replaceState({}, '', '/en')
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('renders the desktop wallet layout by default', () => {
    const { getByTestId, queryByTestId } = render(<WalletAccessSection />)

    expect(getByTestId('home-wallet-section')).toBeTruthy()
    expect(getByTestId('mock-home-stage-shell')).toBeTruthy()
    expect(getByTestId('wallet-access-desktop-shell')).toBeTruthy()
    expect(queryByTestId('wallet-access-mobile-shell')).toBeNull()
    expect(getByTestId('mock-create-wallet-panel')).toBeTruthy()
    expect(getByTestId('mock-connect-wallet-panel')).toBeTruthy()
  })

  it('switches to the mobile single-pane shell and respects login intent', async () => {
    installMatchMedia(true)
    mocks.search = 'mode=login'

    const { getByTestId, queryByTestId } = render(<WalletAccessSection />)

    await waitFor(() => {
      expect(getByTestId('wallet-access-mobile-shell')).toBeTruthy()
    })

    expect(queryByTestId('wallet-access-desktop-shell')).toBeNull()
    expect(getByTestId('wallet-access-tab-connect').getAttribute('aria-selected')).toBe('true')
    expect(getByTestId('wallet-access-mobile-create').hidden).toBe(true)
    expect(getByTestId('wallet-access-mobile-connect').hidden).toBe(false)
  })

  it('updates the active mobile panel and hash when tabs change', async () => {
    installMatchMedia(true)
    window.history.replaceState({}, '', '/en#create')

    const { getByTestId } = render(<WalletAccessSection />)

    await waitFor(() => {
      expect(getByTestId('wallet-access-mobile-shell')).toBeTruthy()
    })

    expect(getByTestId('wallet-access-mobile-create').hidden).toBe(false)
    expect(getByTestId('wallet-access-mobile-connect').hidden).toBe(true)

    fireEvent.click(getByTestId('wallet-access-tab-connect'))

    await waitFor(() => {
      expect(getByTestId('wallet-access-mobile-create').hidden).toBe(true)
      expect(getByTestId('wallet-access-mobile-connect').hidden).toBe(false)
    })

    expect(window.location.hash).toBe('#connect')
  })
})

// @vitest-environment jsdom

import { render, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HomeContent from '@/components/home/HomeContent'

vi.mock('@/infra/utils/ClientTrackWallet', () => ({
  default: () => <div data-testid="mock-client-track-wallet" />,
}))

vi.mock('@/components/home/DynamicInfoCard.client', () => ({
  default: () => <div data-testid="mock-dynamic-info-card" />,
}))

vi.mock('@/components/home/HomeMotionScene.client', () => ({
  default: () => <div data-testid="mock-home-motion-scene" />,
}))

vi.mock('@/components/ui/MapboxMap.client', () => ({
  default: () => <div data-testid="mock-mapbox-map" />,
}))

vi.mock('@/components/home/HomeActionButtons.client', () => ({
  default: () => <div data-testid="mock-home-action-buttons" />,
}))

vi.mock('@/components/home/CreateWalletPanel', () => ({
  CreateWalletPanel: () => <div data-testid="mock-create-wallet-panel" />,
}))

vi.mock('@/components/home/ConnectWalletPanel.client', () => ({
  ConnectWalletPanel: () => <div data-testid="mock-connect-wallet-panel" />,
}))

vi.mock('@/components/home/XrplPanel.client', () => ({
  XrplPanel: () => <div data-testid="mock-xrpl-panel" />,
}))

vi.mock('@/components/home/XrplMarketPanel.client', () => ({
  default: () => <div data-testid="mock-xrpl-market-panel" />,
}))

vi.mock('@/components/home/XrplTradeDesk.client', () => ({
  default: () => <div data-testid="mock-xrpl-trade-desk" />,
}))

vi.mock('@/components/home/RegionCompliancePanel.client', () => ({
  default: () => <div data-testid="mock-region-compliance-panel" />,
}))

vi.mock('@/components/home/ShareDock.client', () => ({
  default: () => <div data-testid="mock-share-dock" />,
}))

describe('HomeContent', () => {
  it('renders translated hero copy, structure, and color classes', () => {
    const { getByRole, getByText, getByTestId, getByLabelText } = render(<HomeContent />)

    const overview = getByTestId('home-overview-section')
    const heroTitle = getByRole('heading', {
      level: 1,
      name: 'Encrypted custody designed for cross-border capital.',
    })
    const brandMark = within(overview).getByText('Aljama Wallet', { exact: true })

    expect(heroTitle).toBeTruthy()
    expect(heroTitle.className).toContain('text-ivory')
    expect(brandMark.className).toContain('text-saffron/80')

    expect(
      getByText(
        'Create encrypted vaults, move across EVM networks, and operate under policy-controlled custody without noisy onboarding.',
      ),
    ).toBeTruthy()

    expect(getByText('Mainnet posture')).toBeTruthy()
    expect(getByText('EVM-first + XRPL-ready')).toBeTruthy()
    expect(getByText('Security model')).toBeTruthy()
    expect(getByText('Encrypted custody')).toBeTruthy()
    expect(getByText('UX philosophy')).toBeTruthy()
    expect(getByText('Guided operational flows')).toBeTruthy()

    expect(getByTestId('home-region-map-section')).toBeTruthy()
    expect(overview.getAttribute('id')).toBe('overview')
    expect(getByTestId('home-wallet-section')).toBeTruthy()
    expect(getByTestId('home-wallet-section').getAttribute('id')).toBe('wallet')
    expect(getByTestId('home-xrpl-section')).toBeTruthy()
    expect(getByTestId('home-xrpl-section').getAttribute('id')).toBe('xrpl')
    expect(getByTestId('home-trade-desk-section')).toBeTruthy()
    expect(getByTestId('home-trade-desk-section').getAttribute('id')).toBe('trade-desk')
    expect(getByLabelText('Copyright 2026 Aljama Wallet')).toBeTruthy()

    expect(getByTestId('mock-client-track-wallet')).toBeTruthy()
    expect(getByTestId('mock-dynamic-info-card')).toBeTruthy()
    expect(getByTestId('mock-home-motion-scene')).toBeTruthy()
    expect(getByTestId('mock-mapbox-map')).toBeTruthy()
    expect(getByTestId('mock-home-action-buttons')).toBeTruthy()
    expect(getByTestId('mock-create-wallet-panel')).toBeTruthy()
    expect(getByTestId('mock-connect-wallet-panel')).toBeTruthy()
    expect(getByTestId('mock-xrpl-panel')).toBeTruthy()
    expect(getByTestId('mock-xrpl-market-panel')).toBeTruthy()
    expect(getByTestId('mock-xrpl-trade-desk')).toBeTruthy()
    expect(getByTestId('mock-region-compliance-panel')).toBeTruthy()
    expect(getByTestId('mock-share-dock')).toBeTruthy()
  })
})

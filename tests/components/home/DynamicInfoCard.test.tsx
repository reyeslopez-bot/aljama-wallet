// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DynamicInfoCard from '@/components/home/DynamicInfoCard.client'
import { useDynamicInfoStore } from '@/hooks/useDynamicInfoStore'

vi.mock('@/infra/location/client', () => ({
  getLocationConsent: () => 'unset',
  onLocationConsentChange: () => () => {},
}))

const initialState = useDynamicInfoStore.getState()

const resetStore = () => {
  useDynamicInfoStore.setState(
    {
      ...initialState,
      user: initialState.user ? { ...initialState.user } : null,
      wallet: { ...initialState.wallet },
      lastEvent: initialState.lastEvent ? { ...initialState.lastEvent } : null,
    },
    true,
  )
}

function rect(left: number, top: number, width = 280, height = 220): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

describe('DynamicInfoCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    const storage = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(key, value)
        }),
        removeItem: vi.fn((key: string) => {
          storage.delete(key)
        }),
        clear: vi.fn(() => {
          storage.clear()
        }),
      },
      configurable: true,
    })
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      value: vi.fn(),
      configurable: true,
    })
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      value: vi.fn(),
      configurable: true,
    })
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      value: vi.fn(() => true),
      configurable: true,
    })
  })

  it('hydrates from persisted corner state', async () => {
    window.localStorage.setItem('aljama.infoCard.corner', 'bottom-left')

    const { getByTestId } = render(<DynamicInfoCard />)

    await waitFor(() => {
      expect(getByTestId('dynamic-info-card').className).toContain('bottom-4')
      expect(getByTestId('dynamic-info-card').className).toContain('left-4')
    })
  })

  it('toggles between collapsed and expanded states', async () => {
    const { getByTestId, queryByTestId } = render(<DynamicInfoCard />)

    expect(getByTestId('dynamic-info-card-collapsed')).toBeTruthy()

    fireEvent.click(getByTestId('dynamic-info-card-expand-button'))

    await waitFor(() => {
      expect(queryByTestId('dynamic-info-card-expanded')).toBeTruthy()
      expect(queryByTestId('dynamic-info-card-start-flow')).toBeTruthy()
    })

    fireEvent.click(getByTestId('dynamic-info-card-collapse-button'))

    await waitFor(() => {
      expect(queryByTestId('dynamic-info-card-collapsed')).toBeTruthy()
    })
  })

  it('keeps the start flow visible after wallet setup until the flow is finished', async () => {
    useDynamicInfoStore.setState((state) => ({
      ...state,
      wallet: {
        ...state.wallet,
        createdAddress: 'rWalletReady123456789',
      },
    }))

    const { getByTestId, queryByTestId } = render(<DynamicInfoCard />)

    fireEvent.click(getByTestId('dynamic-info-card-expand-button'))

    await waitFor(() => {
      expect(queryByTestId('dynamic-info-card-start-flow')).toBeTruthy()
    })
  })

  it('snaps to a new corner and persists it after dragging', async () => {
    const { getByTestId } = render(<DynamicInfoCard />)

    const card = getByTestId('dynamic-info-card') as HTMLElement
    const handle = getByTestId('dynamic-info-card-handle')
    card.getBoundingClientRect = vi.fn(() => rect(920, 120))

    fireEvent.pointerDown(handle, {
      pointerId: 1,
      button: 0,
      clientX: 980,
      clientY: 180,
    })

    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: 140,
      clientY: 700,
    })

    card.getBoundingClientRect = vi.fn(() => rect(40, 620))

    fireEvent.pointerUp(handle, {
      pointerId: 1,
      clientX: 140,
      clientY: 700,
    })

    await waitFor(() => {
      expect(window.localStorage.getItem('aljama.infoCard.corner')).toBe('bottom-left')
      expect(card.className).toContain('bottom-4')
      expect(card.className).toContain('left-4')
    })
  })
})

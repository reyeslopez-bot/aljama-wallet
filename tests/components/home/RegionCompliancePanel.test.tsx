// @vitest-environment jsdom

import { render, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import RegionCompliancePanel from '@/components/home/RegionCompliancePanel.client'

describe('RegionCompliancePanel', () => {
  beforeEach(() => {
    const makeStorage = () => {
      const store = new Map<string, string>()
      return {
        get length() {
          return store.size
        },
        clear() {
          store.clear()
        },
        getItem(key: string) {
          return store.has(key) ? store.get(key)! : null
        },
        key(index: number) {
          return Array.from(store.keys())[index] ?? null
        },
        removeItem(key: string) {
          store.delete(key)
        },
        setItem(key: string, value: string) {
          store.set(key, String(value))
        },
      }
    }

    Object.defineProperty(window, 'localStorage', {
      value: makeStorage(),
      configurable: true,
    })

    Object.defineProperty(window, 'sessionStorage', {
      value: makeStorage(),
      configurable: true,
    })
  })

  it('persists region selection without any email capture UI', async () => {
    const { getByTestId, queryByRole } = render(
      <RegionCompliancePanel />,
    )

    fireEvent.click(getByTestId('region-compliance-show-regions'))

    const select = getByTestId('region-compliance-select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'eu' } })
    expect(window.localStorage.getItem('aljama.region')).toBe('eu')
    expect(window.localStorage.getItem('aljama.region.selectionMode')).toBe('manual')
    expect(queryByRole('textbox')).toBeNull()
    expect(getByTestId('region-compliance-current-region').textContent).toContain('European Union')
  })

  it('does not render the removed save-profile area', () => {
    const { queryByTestId, queryByText } = render(<RegionCompliancePanel />)

    expect(queryByTestId('region-compliance-signup')).toBeNull()
    expect(queryByText('Privacy-safe profile')).toBeNull()
  })

  it('syncs selected region when map jurisdiction updates it', () => {
    const { getByTestId } = render(<RegionCompliancePanel />)

    act(() => {
      window.localStorage.setItem('aljama.region', 'mena')
      window.localStorage.setItem('aljama.region.detected', 'mena')
      window.dispatchEvent(
        new CustomEvent('aljama:region-sync', {
          detail: { region: 'mena' },
        }),
      )
    })

    expect(getByTestId('region-compliance-current-region').textContent).toContain('MENA')
  })

  it('shows the detected region first and hides other regions until requested', () => {
    window.localStorage.setItem('aljama.region.detected', 'us')

    const { getByTestId, queryByTestId } = render(<RegionCompliancePanel />)

    expect(getByTestId('region-compliance-current-region').textContent).toContain('United States')
    expect(queryByTestId('region-compliance-region-options')).toBeNull()
    expect(getByTestId('region-compliance-show-regions').textContent).toBe('See more regions')
    expect(getByTestId('region-compliance-item-soc2').textContent).toContain('Primary target')
  })

  it('does not overwrite a manual region when detected location changes', () => {
    const { getByTestId } = render(<RegionCompliancePanel />)

    fireEvent.click(getByTestId('region-compliance-show-regions'))

    const select = getByTestId('region-compliance-select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'eu' } })

    act(() => {
      window.localStorage.setItem('aljama.region.detected', 'mena')
      window.dispatchEvent(
        new CustomEvent('aljama:region-sync', {
          detail: { region: 'mena' },
        }),
      )
    })

    expect(select.value).toBe('eu')
    expect(getByTestId('region-compliance-item-gdpr').textContent).toContain('Primary target')
  })

  it('returns to automatic mode when the detected region is restored', () => {
    const { getByTestId } = render(<RegionCompliancePanel />)

    fireEvent.click(getByTestId('region-compliance-show-regions'))

    const select = getByTestId('region-compliance-select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'eu' } })

    fireEvent.click(getByTestId('region-compliance-reset-auto'))

    expect(window.localStorage.getItem('aljama.region.selectionMode')).toBe('auto')
    expect(window.localStorage.getItem('aljama.region')).toBe('us')
    expect(getByTestId('region-compliance-show-regions').textContent).toBe('See more regions')
  })

  it('keeps the region panel identical without auth-specific prompts', () => {
    const { queryByRole, queryByTestId } = render(<RegionCompliancePanel />)

    expect(queryByRole('link', { name: 'Sign up to unlock' })).toBeNull()
    expect(queryByTestId('region-compliance-signup')).toBeNull()
  })
})

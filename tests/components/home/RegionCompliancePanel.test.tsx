// @vitest-environment jsdom

import { render, fireEvent, waitFor, act } from '@testing-library/react'
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

  it('persists region selection and saves local profile without email capture', async () => {
    const { getByLabelText, getByText, queryByPlaceholderText } = render(
      <RegionCompliancePanel />,
    )

    const select = getByLabelText('Region') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'eu' } })
    expect(window.localStorage.getItem('aljama.region')).toBe('eu')

    expect(queryByPlaceholderText('you@company.com')).toBeNull()
    fireEvent.click(getByText('Save region profile'))

    await waitFor(() => {
      expect(window.localStorage.getItem('aljama.region.profileEnabled')).toBe('true')
      expect(getByText('Region profile saved locally.')).toBeTruthy()
    })
  })

  it('does not show saved message on load unless save was clicked in this session', () => {
    window.localStorage.setItem('aljama.region', 'us')
    window.localStorage.setItem('aljama.region.profileEnabled', 'true')

    const { queryByText } = render(<RegionCompliancePanel />)

    expect(queryByText('Region profile saved locally.')).toBeNull()
  })

  it('syncs selected region when map jurisdiction updates it', () => {
    const { getByLabelText } = render(<RegionCompliancePanel />)

    act(() => {
      window.localStorage.setItem('aljama.region', 'mena')
      window.dispatchEvent(
        new CustomEvent('aljama:region-sync', {
          detail: { region: 'mena' },
        }),
      )
    })

    const select = getByLabelText('Region') as HTMLSelectElement
    expect(select.value).toBe('mena')
  })
})

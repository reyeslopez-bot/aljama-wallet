// @vitest-environment jsdom

import { render, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSession } from 'next-auth/react'
import RegionCompliancePanel from '@/components/home/RegionCompliancePanel.client'

const mockedUseSession = vi.mocked(useSession)

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
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'test-user', email: 'test@example.com' } },
      status: 'authenticated',
    } as any)
  })

  it('persists region selection and saves local profile without email capture', async () => {
    const { getByTestId, queryByRole } = render(
      <RegionCompliancePanel />,
    )

    const select = getByTestId('region-compliance-select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'eu' } })
    expect(window.localStorage.getItem('aljama.region')).toBe('eu')

    expect(queryByRole('textbox')).toBeNull()
    fireEvent.click(getByTestId('region-compliance-save-profile'))

    await waitFor(() => {
      expect(window.localStorage.getItem('aljama.region.profileEnabled')).toBe('true')
      expect(getByTestId('region-compliance-save-status')).toBeTruthy()
    })
  })

  it('does not show saved message on load unless save was clicked in this session', () => {
    window.localStorage.setItem('aljama.region', 'us')
    window.localStorage.setItem('aljama.region.profileEnabled', 'true')

    const { queryByTestId } = render(<RegionCompliancePanel />)

    expect(queryByTestId('region-compliance-save-status')).toBeNull()
  })

  it('syncs selected region when map jurisdiction updates it', () => {
    const { getByTestId } = render(<RegionCompliancePanel />)

    act(() => {
      window.localStorage.setItem('aljama.region', 'mena')
      window.dispatchEvent(
        new CustomEvent('aljama:region-sync', {
          detail: { region: 'mena' },
        }),
      )
    })

    const select = getByTestId('region-compliance-select') as HTMLSelectElement
    expect(select.value).toBe('mena')
  })

  it('routes locked users to the dedicated secure-gate sign-up page', () => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    } as any)

    const { getByRole, queryByTestId } = render(<RegionCompliancePanel />)

    const cta = getByRole('link', { name: 'Sign up to unlock' }) as HTMLAnchorElement
    expect(cta.getAttribute('href')).toBe('/en/login?mode=register#secure-gate')
    expect(queryByTestId('region-compliance-save-profile')).toBeNull()
  })
})

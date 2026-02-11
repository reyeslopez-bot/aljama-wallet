// @vitest-environment jsdom

import { render, fireEvent, waitFor } from '@testing-library/react'
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

    ;(globalThis as { fetch?: typeof fetch }).fetch = async () =>
      ({
        ok: true,
        json: async () => ({ ok: true }),
      }) as Response
  })

  it('persists region selection and email locally', async () => {
    const { getByLabelText, getByText, getByPlaceholderText } = render(
      <RegionCompliancePanel />,
    )

    const select = getByLabelText('Region') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'eu' } })
    expect(window.localStorage.getItem('aljama.region')).toBe('eu')

    const emailInput = getByPlaceholderText('you@company.com') as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.click(getByText('Join updates'))

    await waitFor(() => {
      expect(window.localStorage.getItem('aljama.signupEmail')).toBe('test@example.com')
      expect(getByText('Thanks — you’re on the list.')).toBeTruthy()
    })
  })
})

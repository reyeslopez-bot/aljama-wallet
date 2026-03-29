// @vitest-environment jsdom

import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SupportDrawer from '@/components/support/SupportDrawer.client'
import { openSupportDrawer } from '@/lib/support/contact'

describe('SupportDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            referenceId: 'contact-42',
            replyWindow: 'within 1 business day',
            confirmationEmailSent: true,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    )
  })

  it('opens from the global event and pre-fills session email', async () => {
    const { getByRole, getByDisplayValue } = render(<SupportDrawer />)

    await act(async () => {
      openSupportDrawer({ source: 'test-open' })
    })

    await waitFor(() => {
      expect(getByRole('dialog')).toBeTruthy()
    })

    expect(getByDisplayValue('test@example.com')).toBeTruthy()
  })

  it('updates the category from FAQ selection and submits the form', async () => {
    const { getByRole, getByLabelText, getByDisplayValue, getByTestId } = render(<SupportDrawer />)

    await act(async () => {
      openSupportDrawer({ source: 'test-submit' })
    })

    await waitFor(() => {
      expect(getByRole('dialog')).toBeTruthy()
    })

    fireEvent.click(getByRole('button', { name: /Why is my transfer or balance update delayed/i }))

    await waitFor(() => {
      expect((getByDisplayValue('Payments / transfers') as HTMLSelectElement).value).toBe('payments_transfers')
    })

    fireEvent.change(getByLabelText('Message'), {
      target: { value: 'Transfer is still pending on Base after 20 minutes.' },
    })

    fireEvent.submit(getByRole('button', { name: 'Send request' }).closest('form')!)

    await waitFor(() => {
      expect(getByTestId('support-drawer-success')).toBeTruthy()
    })

    expect(getByTestId('support-drawer-delivery-status').textContent).toContain('Message received')
    expect(getByTestId('support-drawer-delivery-status').textContent).toContain('Email confirmation sent')

    expect(fetch).toHaveBeenCalledWith(
      '/api/contact',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('shows delayed email delivery status when confirmation email is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            referenceId: 'contact-77',
            replyWindow: 'within 1 business day',
            confirmationEmailSent: false,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    )

    const { getByRole, getByLabelText, getByTestId } = render(<SupportDrawer />)

    await act(async () => {
      openSupportDrawer({ source: 'test-delayed-email' })
    })

    await waitFor(() => {
      expect(getByRole('dialog')).toBeTruthy()
    })

    fireEvent.change(getByLabelText('Message'), {
      target: { value: 'The confirmation email did not arrive yet.' },
    })

    fireEvent.submit(getByRole('button', { name: 'Send request' }).closest('form')!)

    await waitFor(() => {
      expect(getByTestId('support-drawer-success')).toBeTruthy()
    })

    expect(getByTestId('support-drawer-delivery-status').textContent).toContain('Saved, email delayed')
  })
})

// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ShareDock from '@/components/home/ShareDock.client'

const navigationState = {
  pathname: '/en',
}

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
}))

describe('ShareDock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('renders share actions as real links before clipboard enhancement is available', () => {
    const { getByTestId } = render(<ShareDock initialOrigin="http://localhost:3000" />)

    expect((getByTestId('share-dock-link-x') as HTMLAnchorElement).href).toContain('https://x.com/intent/tweet')
    expect((getByTestId('share-dock-link-linkedin') as HTMLAnchorElement).href).toContain('linkedin.com')
    expect((getByTestId('share-dock-link-facebook') as HTMLAnchorElement).href).toContain('facebook.com')
    expect((getByTestId('share-dock-link-whatsapp') as HTMLAnchorElement).href).toContain('wa.me')
    expect((getByTestId('share-dock-link-email') as HTMLAnchorElement).href).toContain('mailto:')
    expect(getByTestId('share-dock-link-copy').tagName).toBe('A')
  })

  it('upgrades the copy action to a button when clipboard access is available', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })

    const { getByTestId } = render(<ShareDock initialOrigin="http://localhost:3000" />)

    await waitFor(() => {
      expect(getByTestId('share-dock-link-copy').tagName).toBe('BUTTON')
    })
  })
})

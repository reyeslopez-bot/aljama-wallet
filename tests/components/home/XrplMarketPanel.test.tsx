// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import XrplMarketPanel from '@/components/home/XrplMarketPanel.client'
import { useSession } from 'next-auth/react'

const mockedUseSession = vi.mocked(useSession)

const snapshot = {
  ok: true as const,
  source: 'coingecko' as const,
  updatedAt: '2026-02-14T20:00:00.000Z',
  assets: [
    {
      id: 'xrp',
      symbol: 'XRP',
      name: 'XRP',
      marketGroup: 'xrpl' as const,
      network: 'XRPL',
      priceUsd: 0.62,
      change24h: 2.2,
      series: [1, 1.02, 1.01],
    },
    {
      id: 'btc',
      symbol: 'BTC',
      name: 'Bitcoin',
      marketGroup: 'reference' as const,
      network: 'Bitcoin',
      priceUsd: 69000,
      change24h: -0.4,
      series: [1, 0.99, 1.01],
    },
  ],
}

describe('XrplMarketPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'test-user', email: 'test@example.com' } },
      status: 'authenticated',
    } as any)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads market data, filters by button, and refreshes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => snapshot,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => snapshot,
      })

    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId, getAllByText, queryByTestId } = render(<XrplMarketPanel />)

    await waitFor(() => {
      expect(getAllByText('$0.62').length).toBeGreaterThan(0)
      expect(getAllByText('$69,000.00').length).toBeGreaterThan(0)
      expect(getAllByText('Bitcoin').length).toBeGreaterThan(0)
      expect(getByTestId('xrpl-market-card-xrp')).toBeTruthy()
      expect(getByTestId('xrpl-market-card-btc')).toBeTruthy()
    })

    fireEvent.click(getByTestId('xrpl-market-filter-xrpl'))

    await waitFor(() => {
      expect(getByTestId('xrpl-market-row-xrp')).toBeTruthy()
      expect(queryByTestId('xrpl-market-row-btc')).toBeNull()
      expect(getByTestId('xrpl-market-card-xrp')).toBeTruthy()
      expect(queryByTestId('xrpl-market-card-btc')).toBeNull()
    })

    fireEvent.click(getByTestId('xrpl-market-refresh'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  it('disables all market action buttons when unauthenticated', async () => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    } as any)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshot,
    })
    vi.stubGlobal(
      'fetch',
      fetchMock,
    )

    const { getByTestId, getByText } = render(<XrplMarketPanel />)

    await waitFor(() => {
      expect(getByText('Sign in to unlock XRPL market tools.')).toBeTruthy()
    })

    expect(fetchMock).not.toHaveBeenCalled()
    const all = getByTestId('xrpl-market-filter-all') as HTMLButtonElement
    const xrpl = getByTestId('xrpl-market-filter-xrpl') as HTMLButtonElement
    const reference = getByTestId('xrpl-market-filter-reference') as HTMLButtonElement
    const refresh = getByTestId('xrpl-market-refresh') as HTMLButtonElement

    expect(all.disabled).toBe(true)
    expect(xrpl.disabled).toBe(true)
    expect(reference.disabled).toBe(true)
    expect(refresh.disabled).toBe(true)
  })

  it('keeps chart paths inside the clipped plot area', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshot,
    })

    vi.stubGlobal('fetch', fetchMock)

    const { getByTestId, container } = render(<XrplMarketPanel />)

    await waitFor(() => {
      expect(getByTestId('xrpl-market-chart')).toBeTruthy()
      expect(container.querySelector('path[stroke]')).toBeTruthy()
    })

    const clipRect = container.querySelector('clipPath rect')
    const linePath = container.querySelector('path[stroke]')

    expect(clipRect).toBeTruthy()
    expect(linePath).toBeTruthy()

    const clipX = Number(clipRect?.getAttribute('x'))
    const clipY = Number(clipRect?.getAttribute('y'))
    const clipWidth = Number(clipRect?.getAttribute('width'))
    const clipHeight = Number(clipRect?.getAttribute('height'))

    const coordinates = Array.from(linePath?.getAttribute('d')?.matchAll(/[ML]\s+([\d.]+)\s+([\d.]+)/g) ?? []).map(
      ([, x, y]) => ({ x: Number(x), y: Number(y) }),
    )

    expect(clipX).toBeGreaterThan(0)
    expect(coordinates.length).toBeGreaterThan(1)
    expect(coordinates[0]?.x).toBeGreaterThanOrEqual(clipX)
    expect(coordinates[coordinates.length - 1]?.x).toBeLessThanOrEqual(clipX + clipWidth)
    expect(Math.min(...coordinates.map((point) => point.y))).toBeGreaterThanOrEqual(clipY)
    expect(Math.max(...coordinates.map((point) => point.y))).toBeLessThanOrEqual(clipY + clipHeight)
  })

  it('normalizes degraded market snapshot errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers({ 'retry-after': '7' }),
      json: async () => ({
        ok: false,
        code: 'rate_limit_backend_unavailable',
        error: 'RATE_LIMIT_BACKEND_UNAVAILABLE',
        details: { retryAfter: 7 },
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const { findByTestId } = render(<XrplMarketPanel />)

    const alert = await findByTestId('xrpl-market-error')
    expect(alert.textContent).toBe('Request temporarily unavailable. Try again in 7 seconds.')
  })
})

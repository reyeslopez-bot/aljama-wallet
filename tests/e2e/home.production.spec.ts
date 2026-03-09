import { expect, test, type Page } from '@playwright/test'
import {
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from '../../infra/consent/constants'

const HOME_ROUTE = '/en'
const ENABLE_REAL_BACKEND_E2E = process.env.PLAYWRIGHT_REAL_BACKEND === 'true'
const MAX_HOME_VISIBLE_MS = Number(process.env.MAX_PRODLIKE_HOME_VISIBLE_MS ?? 20_000)

type ApiResponseLog = {
  path: string
  status: number
}

function trackApiResponses(page: Page): ApiResponseLog[] {
  const responses: ApiResponseLog[] = []
  page.on('response', (response) => {
    try {
      const url = new URL(response.url())
      if (!url.pathname.startsWith('/api/')) return
      responses.push({ path: url.pathname, status: response.status() })
    } catch {
      // ignore malformed URLs from non-http protocols
    }
  })
  return responses
}

test.beforeEach(async ({ page }) => {
  test.skip(!ENABLE_REAL_BACKEND_E2E, 'Enable with PLAYWRIGHT_REAL_BACKEND=true')

  await page.addInitScript(
    ({ promptKey, siteEntryKey }) => {
      window.localStorage.setItem('aljama.telemetry.consent', 'denied')
      window.localStorage.setItem('aljama.location.consent', 'denied')
      window.sessionStorage.setItem(promptKey, 'seen')
      window.sessionStorage.setItem(siteEntryKey, 'seen')
    },
    {
      promptKey: CONSENT_PROMPT_SESSION_KEY,
      siteEntryKey: CONSENT_SITE_ENTRY_SESSION_KEY,
    },
  )
})

test('home renders with real backend responses (no route mocks)', async ({ page }, testInfo) => {
  const apiResponses = trackApiResponses(page)
  const startedAt = Date.now()

  await page.goto(HOME_ROUTE, { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('home-overview-section')).toBeVisible()
  await expect(page.getByTestId('home-region-map-section')).toBeVisible()
  await expect(page.getByTestId('home-wallet-section')).toBeVisible()
  await expect(page.getByTestId('home-xrpl-section')).toBeVisible()
  await expect(page.getByTestId('home-trade-desk-section')).toBeVisible()
  await expect(page.getByTestId('mapbox-map')).toBeVisible()
  await expect(page.getByTestId('region-compliance-panel')).toBeVisible()
  await expect(page.getByTestId('create-wallet-panel')).toBeVisible()
  await expect(page.getByTestId('connect-wallet-panel')).toBeVisible()
  await expect(page.getByTestId('xrpl-panel')).toBeVisible()
  await expect(page.getByTestId('xrpl-market-panel')).toBeVisible()
  await expect(page.getByTestId('xrpl-trade-desk')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  expect(Date.now() - startedAt).toBeLessThan(MAX_HOME_VISIBLE_MS)

  await expect
    .poll(
      () => apiResponses.length,
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0)

  await expect
    .poll(
      () => apiResponses.some((entry) => entry.path === '/api/market-snapshot'),
      { timeout: 20_000 },
    )
    .toBe(true)

  const unexpected5xx = apiResponses.filter((entry) =>
    entry.status >= 500 && entry.path !== '/api/xrpl/dev-account')
  await testInfo.attach('api-responses', {
    body: JSON.stringify(apiResponses, null, 2),
    contentType: 'application/json',
  })
  await testInfo.attach('unexpected-5xx-responses', {
    body: JSON.stringify(unexpected5xx, null, 2),
    contentType: 'application/json',
  })
  expect(
    unexpected5xx,
    `Unexpected 5xx API responses: ${JSON.stringify(unexpected5xx)}`,
  ).toEqual([])
})

test('core backend routes return structured responses in prod-like mode', async ({ request }) => {
  const marketRes = await request.get('/api/market-snapshot')
  expect(marketRes.status()).toBe(200)
  const marketBody = await marketRes.json() as {
    ok?: boolean
    assets?: unknown[]
  }
  expect(marketBody.ok).toBe(true)
  expect(Array.isArray(marketBody.assets)).toBe(true)

  const sessionRes = await request.get('/api/auth/session')
  expect(sessionRes.status()).not.toBe(404)
  expect(sessionRes.status()).toBeLessThan(600)

  const xrplDevRes = await request.get('/api/xrpl/dev-account?network=testnet')
  expect([200, 401, 404, 500]).toContain(xrplDevRes.status())
  const xrplBody = await xrplDevRes.json() as { ok?: boolean }
  expect(typeof xrplBody.ok).toBe('boolean')
})

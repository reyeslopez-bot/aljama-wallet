import { expect, test, type Page, type TestInfo } from '@playwright/test'
import {
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from '../../infra/consent/constants'

const HOME_ROUTE = '/en'
const MAX_HOME_VISIBLE_MS = Number(process.env.MAX_HOME_VISIBLE_MS ?? 12_000)
const MAX_DOM_CONTENT_LOADED_MS = Number(process.env.MAX_DOM_CONTENT_LOADED_MS ?? 10_000)
const ENABLE_VISUAL_BASELINE = process.env.PLAYWRIGHT_VISUAL === 'true'
const VISUAL_MAX_DIFF_PIXEL_RATIO = Number(process.env.PLAYWRIGHT_VISUAL_MAX_DIFF_RATIO ?? 0.01)

async function attachLocatorScreenshot(
  testInfo: TestInfo,
  page: Page,
  name: string,
  target: 'page' | ReturnType<Page['locator']>,
) {
  const fileName = `${name}.png`
  const path = testInfo.outputPath(fileName)
  if (target === 'page') {
    await page.screenshot({ path, fullPage: true, animations: 'disabled' })
  } else {
    await target.screenshot({ path, animations: 'disabled' })
  }
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

async function assertVisualBaseline(page: Page, name: string, target: 'page' | ReturnType<Page['locator']>) {
  if (!ENABLE_VISUAL_BASELINE) return

  const fileName = `${name}.png`
  if (target === 'page') {
    await expect(page).toHaveScreenshot(fileName, {
      animations: 'disabled',
      fullPage: true,
      maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO,
    })
    return
  }

  await expect(target).toHaveScreenshot(fileName, {
    animations: 'disabled',
    maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO,
  })
}

async function mockHomeApi(page: Page) {
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })

  await page.route('**/api/auth/session', (route) =>
    route.fulfill(json({ user: null, expires: '2099-01-01T00:00:00.000Z' })),
  )
  await page.route('**/api/market-snapshot', (route) =>
    route.fulfill(
      json({
        ok: true,
        source: 'fallback',
        updatedAt: '2026-02-20T00:00:00.000Z',
        assets: [
          {
            id: 'xrp',
            symbol: 'XRP',
            name: 'XRP',
            marketGroup: 'xrpl',
            network: 'XRPL',
            priceUsd: 0.62,
            change24h: 1.2,
            series: [1, 1.02, 1.01],
          },
          {
            id: 'btc',
            symbol: 'BTC',
            name: 'Bitcoin',
            marketGroup: 'reference',
            network: 'Bitcoin',
            priceUsd: 69_000,
            change24h: -0.1,
            series: [1, 0.99, 1.01],
          },
        ],
      }),
    ),
  )
  await page.route('**/api/xrpl/dev-account**', (route) =>
    route.fulfill(
      json({
        ok: true,
        network: 'testnet',
        account: {
          address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
          xrpBalance: '42.15',
        },
      }),
    ),
  )
  await page.route('**/api/xrpl/account-assets**', (route) =>
    route.fulfill(
      json({
        ok: true,
        network: 'testnet',
        account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
        assets: [
          { assetType: 'xrp', currency: 'XRP', issuer: null, value: '12.1', limit: null },
          {
            assetType: 'issued',
            currency: 'USD',
            issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
            value: '21.0',
            limit: '1000',
          },
        ],
      }),
    ),
  )
  await page.route('**/api/xrpl/nfts**', (route) =>
    route.fulfill(
      json({
        ok: true,
        nfts: [
          {
            nftokenId: 'NFT1',
            uri: 'https://example.com/meta.json',
            issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
            metadata: {
              name: 'Demo NFT',
              description: 'Demo',
              image: null,
            },
          },
        ],
      }),
    ),
  )
  await page.route('**/api/xrpl/orderbook**', (route) =>
    route.fulfill(
      json({
        ok: true,
        offers: [
          {
            account: 'rOffer',
            sequence: 1,
            quality: '1.1',
            takerGets: '10',
            takerPays: '20',
          },
        ],
      }),
    ),
  )
  await page.route('**/api/xrpl/action-history**', (route) =>
    route.fulfill(
      json({
        ok: true,
        actions: [
          {
            id: 'act-1',
            action: 'offer_create',
            status: 'validated',
            txHash: 'AABBCC',
            engineResult: 'tesSUCCESS',
            updatedAt: '2026-02-20T00:00:00.000Z',
          },
        ],
      }),
    ),
  )
  await page.route('**/api/telemetry', (route) => route.fulfill(json({ ok: true })))
  await page.route('**/api/track-wallet', (route) => route.fulfill(json({ ok: true })))
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockHomeApi(page)
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

test('home functional checks: text, color, and screenshots', async ({ page }, testInfo) => {
  await page.goto(HOME_ROUTE, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('home-overview-section')).toBeVisible()
  await page.evaluate(() => document.fonts?.ready)

  const title = page.getByRole('heading', {
    level: 1,
    name: 'Encrypted custody designed for cross-border capital.',
  })
  const subtitle = page.getByText(
    'Create encrypted vaults, move across EVM networks, and operate under policy-controlled custody without noisy onboarding.',
  )
  const brandMark = page
    .getByTestId('home-overview-section')
    .getByText('Aljama Wallet', { exact: true })

  await expect(title).toBeVisible()
  await expect(subtitle).toBeVisible()
  await expect(page.getByTestId('home-region-map-section')).toBeVisible()
  await expect(page.getByTestId('home-wallet-section')).toBeVisible()
  await expect(page.getByTestId('home-xrpl-section')).toBeVisible()
  await expect(page.getByTestId('home-trade-desk-section')).toBeVisible()

  const titleClass = await title.getAttribute('class')
  const brandClass = await brandMark.getAttribute('class')
  const colorTokens = await page.evaluate(() => ({
    ivory: getComputedStyle(document.documentElement).getPropertyValue('--ivory').trim(),
    saffron: getComputedStyle(document.documentElement).getPropertyValue('--saffron').trim(),
  }))
  expect(titleClass ?? '').toContain('text-ivory')
  expect(brandClass ?? '').toContain('text-saffron/80')
  expect(colorTokens.ivory).toBe('245 236 219')
  expect(colorTokens.saffron).toBe('210 167 98')

  await attachLocatorScreenshot(
    testInfo,
    page,
    `home-overview-${testInfo.project.name}`,
    page.getByTestId('home-overview-section'),
  )
  await assertVisualBaseline(
    page,
    'home-overview',
    page.getByTestId('home-overview-section'),
  )
  await attachLocatorScreenshot(testInfo, page, `home-full-page-${testInfo.project.name}`, 'page')
  await assertVisualBaseline(page, 'home-full-page', 'page')
})

test('home load-time checks and wallet-section screenshot', async ({ page }, testInfo) => {
  await page.goto(HOME_ROUTE, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('home-overview-section')).toBeVisible()

  const start = Date.now()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('home-overview-section')).toBeVisible()
  const visibleInMs = Date.now() - start

  const timing = await page.evaluate(() => {
    const navEntry = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined
    const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0]
    return {
      domContentLoadedMs: navEntry?.domContentLoadedEventEnd ?? null,
      loadEventMs: navEntry?.loadEventEnd ?? null,
      firstContentfulPaintMs: fcpEntry?.startTime ?? null,
    }
  })

  expect(visibleInMs).toBeLessThan(MAX_HOME_VISIBLE_MS)
  if (typeof timing.domContentLoadedMs === 'number') {
    expect(timing.domContentLoadedMs).toBeLessThan(MAX_DOM_CONTENT_LOADED_MS)
  }

  await testInfo.attach('home-load-metrics', {
    body: JSON.stringify(
      {
        visibleInMs,
        ...timing,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  })

  const walletSection = page.getByTestId('home-wallet-section')
  await walletSection.scrollIntoViewIfNeeded()
  await expect(walletSection).toBeVisible()
  await attachLocatorScreenshot(
    testInfo,
    page,
    `home-wallet-section-${testInfo.project.name}`,
    walletSection,
  )
  await assertVisualBaseline(page, 'home-wallet-section', walletSection)
})

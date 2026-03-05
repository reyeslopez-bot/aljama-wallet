import { expect, test, type Page, type TestInfo } from '@playwright/test'
import {
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from '../../infra/consent/constants'

const HOME_ROUTE = '/en'
const RTL_HOME_ROUTES = ['/ar', '/he'] as const
const MAX_HOME_VISIBLE_MS = Number(process.env.MAX_HOME_VISIBLE_MS ?? 12_000)
const MAX_DOM_CONTENT_LOADED_MS = Number(process.env.MAX_DOM_CONTENT_LOADED_MS ?? 10_000)
const ENABLE_VISUAL_BASELINE = process.env.PLAYWRIGHT_VISUAL === 'true'
const VISUAL_MAX_DIFF_PIXEL_RATIO = Number(process.env.PLAYWRIGHT_VISUAL_MAX_DIFF_RATIO ?? 0.01)
const UNAUTHENTICATED_SESSION = { user: null, expires: '2099-01-01T00:00:00.000Z' }

function jsonResponse(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  }
}

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

async function getViewportRect(target: ReturnType<Page['locator']>) {
  return target.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    }
  })
}

async function expectFullyInViewport(page: Page, target: ReturnType<Page['locator']>, label: string) {
  const viewport = page.viewportSize()
  expect(viewport).toBeTruthy()
  await expect(target).toBeVisible()

  const rect = await getViewportRect(target)
  expect(rect.left, `${label}: left`).toBeGreaterThanOrEqual(-1)
  expect(rect.top, `${label}: top`).toBeGreaterThanOrEqual(-1)
  expect(rect.right, `${label}: right`).toBeLessThanOrEqual((viewport?.width ?? 0) + 1)
  expect(rect.bottom, `${label}: bottom`).toBeLessThanOrEqual((viewport?.height ?? 0) + 1)
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))

  expect(dimensions.scrollWidth, `${label}: scroll width`).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}

async function mockHomeApi(page: Page) {
  await page.route('**/api/market-snapshot', (route) =>
    route.fulfill(
      jsonResponse({
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
      jsonResponse({
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
      jsonResponse({
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
      jsonResponse({
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
      jsonResponse({
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
      jsonResponse({
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
  await page.route('**/api/telemetry', (route) => route.fulfill(jsonResponse({ ok: true })))
  await page.route('**/api/track-wallet', (route) => route.fulfill(jsonResponse({ ok: true })))
}

async function mockAuthSession(page: Page, session: unknown) {
  await page.route('**/api/auth/session', (route) => route.fulfill(jsonResponse(session)))
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockAuthSession(page, UNAUTHENTICATED_SESSION)
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
  await expect(page.getByTestId('mapbox-map')).toBeVisible()
  await expect(page.getByTestId('region-compliance-panel')).toBeVisible()
  await expect(page.getByTestId('create-wallet-panel')).toBeVisible()
  await expect(page.getByTestId('connect-wallet-panel')).toBeVisible()
  await expect(page.getByTestId('xrpl-panel')).toBeVisible()
  await expect(page.getByTestId('xrpl-market-panel')).toBeVisible()
  await expect(page.getByTestId('xrpl-trade-desk')).toBeVisible()

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

test('dynamic info card stays inside the viewport across zoom-equivalent layouts', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop zoom coverage only')

  const zoomCases = [
    { label: 'zoom-67', viewport: { width: 2148, height: 1432 } },
    { label: 'zoom-90', viewport: { width: 1600, height: 1067 } },
    { label: 'zoom-110', viewport: { width: 1309, height: 873 } },
    { label: 'zoom-125', viewport: { width: 1152, height: 768 } },
    { label: 'zoom-150', viewport: { width: 960, height: 640 } },
    { label: 'zoom-200', viewport: { width: 720, height: 480 } },
  ] as const

  for (const zoomCase of zoomCases) {
    await page.setViewportSize(zoomCase.viewport)
    await page.goto(HOME_ROUTE, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('home-overview-section')).toBeVisible()

    const infoCard = page.getByTestId('dynamic-info-card')
    await expectFullyInViewport(page, infoCard, `${zoomCase.label} collapsed`)

    await infoCard.hover()
    await expect(page.getByTestId('dynamic-info-card-expanded')).toBeVisible()
    await expectFullyInViewport(page, infoCard, `${zoomCase.label} expanded`)
  }
})

test('dynamic info card remains in frame when text scales up', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop text scaling coverage only')

  await page.setViewportSize({ width: 960, height: 640 })
  await page.goto(HOME_ROUTE, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('home-overview-section')).toBeVisible()

  await page.addStyleTag({
    content: `
      html {
        font-size: 125% !important;
      }
    `,
  })

  const infoCard = page.getByTestId('dynamic-info-card')
  await expectFullyInViewport(page, infoCard, 'text-scale-125 collapsed')

  await infoCard.hover()
  await expect(page.getByTestId('dynamic-info-card-expanded')).toBeVisible()
  await expectFullyInViewport(page, infoCard, 'text-scale-125 expanded')
})

test('home layout stays within frame on smartphone device projects', async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, 'Mobile device projects only')

  await page.goto(HOME_ROUTE, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('home-overview-section')).toBeVisible()

  const label = testInfo.project.name
  const infoCard = page.getByTestId('dynamic-info-card')
  const toggleButton = page.getByTestId('dynamic-info-card-toggle')

  await expectNoHorizontalOverflow(page, `${label} initial`)
  await expectFullyInViewport(page, infoCard, `${label} collapsed`)
  await expect(page.getByTestId('dynamic-info-card-collapsed')).toBeVisible()

  await toggleButton.click()
  await expect(page.getByTestId('dynamic-info-card-expanded')).toBeVisible()
  await expectFullyInViewport(page, infoCard, `${label} expanded`)
  await expectNoHorizontalOverflow(page, `${label} expanded`)

  await page.getByTestId('home-wallet-section').scrollIntoViewIfNeeded()
  await expect(page.getByTestId('home-wallet-section')).toBeVisible()
  await expectNoHorizontalOverflow(page, `${label} wallet-section`)
})

test('home supports keyboard interaction for the market chart and info card', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Keyboard desktop coverage only')

  await page.goto(HOME_ROUTE, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('home-overview-section')).toBeVisible()

  const chart = page.getByTestId('xrpl-market-chart')
  await chart.focus()
  await expect(chart).toBeFocused()
  await chart.press('ArrowRight')
  await expect(page.getByTestId('xrpl-market-hover-snapshot')).toBeVisible()
  await expect(page.getByTestId('xrpl-market-hover-row-xrp')).toBeVisible()
  await chart.press('End')
  await expect(page.getByTestId('xrpl-market-hover-row-btc')).toBeVisible()

  const collapsedToggle = page.getByTestId('dynamic-info-card-collapsed').getByTestId('dynamic-info-card-toggle')
  await collapsedToggle.focus()
  await expect(collapsedToggle).toBeFocused()
  await collapsedToggle.press('Enter')
  await expect(page.getByTestId('dynamic-info-card-expanded')).toBeVisible()

  const expandedToggle = page.getByTestId('dynamic-info-card-expanded').getByTestId('dynamic-info-card-toggle')
  await expandedToggle.focus()
  await expect(expandedToggle).toBeFocused()
  await expandedToggle.press('Enter')
  await expect(page.getByTestId('dynamic-info-card-collapsed')).toBeVisible()
})

test('rtl home routes avoid horizontal overflow', async ({ page }, testInfo) => {
  for (const route of RTL_HOME_ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('home-overview-section')).toBeVisible()

    const localeDir = await page.evaluate(() => document.documentElement.dataset.localeDir)
    expect(localeDir).toBe('rtl')

    const label = `${testInfo.project.name}-${route}`
    const infoCard = page.getByTestId('dynamic-info-card')
    const toggleButton = page.getByTestId('dynamic-info-card-toggle')

    await expectNoHorizontalOverflow(page, `${label} initial`)
    await expectFullyInViewport(page, infoCard, `${label} collapsed`)

    await toggleButton.click()
    await expect(page.getByTestId('dynamic-info-card-expanded')).toBeVisible()
    await expectFullyInViewport(page, infoCard, `${label} expanded`)
    await expectNoHorizontalOverflow(page, `${label} expanded`)

    await page.getByTestId('home-xrpl-section').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('home-xrpl-section')).toBeVisible()
    await expectNoHorizontalOverflow(page, `${label} xrpl-section`)
  }
})

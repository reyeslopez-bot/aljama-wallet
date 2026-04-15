import { expect, type Page, type TestInfo } from '@playwright/test'
import {
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from '../../infra/consent/constants'

export const HOME_ROUTE = '/en'
export const RTL_HOME_ROUTES = ['/ar', '/he'] as const
export const MAX_HOME_VISIBLE_MS = Number(
  process.env.MAX_HOME_VISIBLE_MS ?? (process.env.CI ? 20_000 : 12_000),
)
export const MAX_DOM_CONTENT_LOADED_MS = Number(process.env.MAX_DOM_CONTENT_LOADED_MS ?? 10_000)
const FIXED_E2E_NOW_ISO = '2026-02-20T00:00:00.000Z'

const ENABLE_VISUAL_BASELINE = process.env.PLAYWRIGHT_VISUAL === 'true'
const VISUAL_MAX_DIFF_PIXEL_RATIO = Number(process.env.PLAYWRIGHT_VISUAL_MAX_DIFF_RATIO ?? 0.01)
const MAX_PAGE_CAPTURE_DIMENSION = 32_000
const UNAUTHENTICATED_SESSION = { user: null, expires: '2099-01-01T00:00:00.000Z' }
export const AUTHENTICATED_SESSION = {
  user: {
    id: 'e2e-user-1',
    name: 'Test User',
    email: 'test@example.com',
    image: null,
  },
  expires: '2099-01-01T00:00:00.000Z',
}

type PrepareMockedHomeOptions = {
  session?: unknown
}

type LocatorTarget = ReturnType<Page['locator']>

function jsonResponse(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  }
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
  await page.route('**/api/xrpl/trade/swap/quote**', (route) =>
    route.fulfill(
      jsonResponse({
        ok: true,
        quote: {
          sourceAmount: { currency: 'XRP', value: '50' },
          quotedSourceAmount: { currency: 'XRP', value: '50' },
          destinationAmount: {
            currency: 'USD',
            issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
            value: '45.5',
          },
          deliverMin: {
            currency: 'USD',
            issuer: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
            value: '45.2725',
          },
          pathCount: 1,
          alternativeCount: 2,
          fullReply: true,
          slippageBps: 50,
        },
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

async function resolvePageCaptureStrategy(page: Page) {
  const viewport = page.viewportSize()
  const dimensions = await page.evaluate(() => {
    const root = document.documentElement
    const body = document.body
    return {
      width: Math.max(
        root.scrollWidth,
        root.clientWidth,
        body?.scrollWidth ?? 0,
        body?.clientWidth ?? 0,
      ),
      height: Math.max(
        root.scrollHeight,
        root.clientHeight,
        body?.scrollHeight ?? 0,
        body?.clientHeight ?? 0,
      ),
      devicePixelRatio: window.devicePixelRatio || 1,
    }
  })
  const maxCssCaptureDimension = Math.max(
    1,
    Math.floor(MAX_PAGE_CAPTURE_DIMENSION / dimensions.devicePixelRatio),
  )

  if (
    dimensions.width <= maxCssCaptureDimension &&
    dimensions.height <= maxCssCaptureDimension
  ) {
    return {
      mode: 'full-page' as const,
      fullPage: true as const,
      maxCssCaptureDimension,
      dimensions,
    }
  }

  return {
    mode: 'clipped-page' as const,
    fullPage: false as const,
    dimensions,
    clip: {
      x: 0,
      y: 0,
      width: Math.max(
        1,
        Math.min(dimensions.width, viewport?.width ?? dimensions.width, maxCssCaptureDimension),
      ),
      height: Math.max(1, Math.min(dimensions.height, maxCssCaptureDimension)),
    },
    maxCssCaptureDimension,
  }
}

async function getViewportRect(target: LocatorTarget) {
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

async function waitForStableTypography(page: Page) {
  await page.evaluate(async () => {
    await document.fonts?.ready
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
  })
}

export async function prepareMockedHome(page: Page, options: PrepareMockedHomeOptions = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.unroute('**/api/auth/session')
  await mockAuthSession(page, options.session ?? UNAUTHENTICATED_SESSION)
  await mockHomeApi(page)
  await page.addInitScript(
    ({ fixedNowIso, promptKey, siteEntryKey }) => {
      window.__ALJAMA_E2E_FIXED_NOW__ = fixedNowIso
      window.localStorage.setItem('aljama.telemetry.consent', 'denied')
      window.localStorage.setItem('aljama.location.consent', 'denied')
      window.sessionStorage.setItem(promptKey, 'seen')
      window.sessionStorage.setItem(siteEntryKey, 'seen')
    },
    {
      fixedNowIso: FIXED_E2E_NOW_ISO,
      promptKey: CONSENT_PROMPT_SESSION_KEY,
      siteEntryKey: CONSENT_SITE_ENTRY_SESSION_KEY,
    },
  )
}

export async function waitForAppHydration(page: Page) {
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.appHydrated === 'true' &&
      !document.querySelector('[data-interactive-ready="false"]'),
  )
}

export async function expectHomeShellVisible(page: Page) {
  await expect(page.getByTestId('home-overview-section')).toBeVisible()
  await expect(page.getByTestId('home-region-map-section')).toBeVisible()
  await expect(page.getByTestId('home-wallet-section')).toBeVisible()
  await expect(page.getByTestId('home-xrpl-section')).toBeVisible()
  await expect(page.getByTestId('home-trade-desk-section')).toBeVisible()
  await expect(page.getByTestId('mapbox-map')).toBeVisible()
  await expect(page.getByTestId('region-compliance-panel')).toBeVisible()
  const createWalletPanel = page.getByTestId('create-wallet-panel')
  const connectWalletPanel = page.getByTestId('connect-wallet-panel')
  const mobileShell = page.getByTestId('wallet-access-mobile-shell')
  const desktopShell = page.getByTestId('wallet-access-desktop-shell')

  const [
    createVisible,
    connectVisible,
    mobileShellVisible,
    desktopShellVisible,
  ] = await Promise.all([
    createWalletPanel.isVisible().catch(() => false),
    connectWalletPanel.isVisible().catch(() => false),
    mobileShell.isVisible().catch(() => false),
    desktopShell.isVisible().catch(() => false),
  ])

  expect(createVisible || connectVisible).toBe(true)
  expect(mobileShellVisible || desktopShellVisible || (createVisible && connectVisible)).toBe(true)
  await expect(page.getByTestId('xrpl-panel')).toBeVisible()
  await expect(page.getByTestId('xrpl-market-panel')).toBeVisible()
  await expect(page.getByTestId('xrpl-trade-desk')).toBeVisible()
}

export async function attachLocatorScreenshot(
  testInfo: TestInfo,
  page: Page,
  name: string,
  target: 'page' | LocatorTarget,
) {
  const fileName = `${name}.png`
  const path = testInfo.outputPath(fileName)
  if (target === 'page') {
    const strategy = await resolvePageCaptureStrategy(page)
    await page.screenshot({
      path,
      animations: 'disabled',
      ...(strategy.fullPage ? { fullPage: true } : { clip: strategy.clip }),
    })
    if (!strategy.fullPage) {
      await testInfo.attach(`${name}-capture-strategy`, {
        body: JSON.stringify(strategy, null, 2),
        contentType: 'application/json',
      })
    }
  } else {
    await target.screenshot({ path, animations: 'disabled' })
  }
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

export async function assertVisualBaseline(page: Page, name: string, target: 'page' | LocatorTarget) {
  if (!ENABLE_VISUAL_BASELINE) return

  const fileName = `${name}.png`
  if (target === 'page') {
    const strategy = await resolvePageCaptureStrategy(page)
    await expect(page).toHaveScreenshot(fileName, {
      animations: 'disabled',
      maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO,
      ...(strategy.fullPage ? { fullPage: true } : { clip: strategy.clip }),
    })
    return
  }

  await expect(target).toHaveScreenshot(fileName, {
    animations: 'disabled',
    maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO,
  })
}

export async function expectFullyInViewport(page: Page, target: LocatorTarget, label: string) {
  const viewport = page.viewportSize()
  expect(viewport).toBeTruthy()
  await expect(target).toBeVisible()
  await waitForStableTypography(page)

  const rect = await getViewportRect(target)
  expect(rect.left, `${label}: left`).toBeGreaterThanOrEqual(-1)
  expect(rect.top, `${label}: top`).toBeGreaterThanOrEqual(-1)
  expect(rect.right, `${label}: right`).toBeLessThanOrEqual((viewport?.width ?? 0) + 1)
  expect(rect.bottom, `${label}: bottom`).toBeLessThanOrEqual((viewport?.height ?? 0) + 1)
}

export async function expectNoHorizontalOverflow(page: Page, label: string) {
  await waitForStableTypography(page)
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))

  expect(dimensions.scrollWidth, `${label}: scroll width`).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}

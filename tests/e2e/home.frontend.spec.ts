import { expect, test } from '@playwright/test'
import {
  HOME_ROUTE,
  MAX_DOM_CONTENT_LOADED_MS,
  MAX_HOME_VISIBLE_MS,
  RTL_HOME_ROUTES,
  assertVisualBaseline,
  attachLocatorScreenshot,
  expectFullyInViewport,
  expectHomeShellVisible,
  expectNoHorizontalOverflow,
  prepareMockedHome,
} from './home.helpers'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await prepareMockedHome(page)
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
  await expectHomeShellVisible(page)

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
    page.getByTestId('home-overview-visual'),
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

test('dynamic info card stays inside the viewport across zoom-equivalent layouts', async ({ page }) => {
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
    const toggleButton = page.getByTestId('dynamic-info-card-expand-button')
    await expectFullyInViewport(page, infoCard, `${zoomCase.label} collapsed`)

    await toggleButton.focus()
    await expect(toggleButton).toBeFocused()
    await toggleButton.press('Enter')
    await expect(page.getByTestId('dynamic-info-card-expanded')).toBeVisible()
    await expectFullyInViewport(page, infoCard, `${zoomCase.label} expanded`)
  }
})

test('dynamic info card remains in frame when text scales up', async ({ page }) => {
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
  const toggleButton = page.getByTestId('dynamic-info-card-expand-button')
  await expectFullyInViewport(page, infoCard, 'text-scale-125 collapsed')

  await toggleButton.focus()
  await expect(toggleButton).toBeFocused()
  await toggleButton.press('Enter')
  await expect(page.getByTestId('dynamic-info-card-expanded')).toBeVisible()
  await expectFullyInViewport(page, infoCard, 'text-scale-125 expanded')
})

test('home supports keyboard interaction for the market chart and info card', async ({ page }) => {
  await page.goto(HOME_ROUTE, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('home-overview-section')).toBeVisible()

  const chart = page.getByTestId('xrpl-market-chart')
  await page.getByTestId('home-xrpl-section').scrollIntoViewIfNeeded()
  await expect(page.getByTestId('home-xrpl-section')).toBeVisible()
  await chart.evaluate((element) => {
    ;(element as SVGElement).focus()
  })
  await expect.poll(() =>
    chart.evaluate((element) => element === element.ownerDocument.activeElement),
  ).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('xrpl-market-hover-snapshot')).toBeVisible()
  await expect(page.getByTestId('xrpl-market-hover-row-xrp')).toBeVisible()
  await page.keyboard.press('End')
  await expect(page.getByTestId('xrpl-market-hover-row-btc')).toBeVisible()

  const collapsedToggle = page.getByTestId('dynamic-info-card-expand-button')
  await collapsedToggle.focus()
  await expect(collapsedToggle).toBeFocused()
  await collapsedToggle.press('Enter')
  await expect(page.getByTestId('dynamic-info-card-expanded')).toBeVisible()

  const expandedToggle = page.getByTestId('dynamic-info-card-collapse-button')
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
    const toggleButton = page.getByTestId('dynamic-info-card-expand-button')

    await expectNoHorizontalOverflow(page, `${label} initial`)
    await expectFullyInViewport(page, infoCard, `${label} collapsed`)

    await toggleButton.focus()
    await expect(toggleButton).toBeFocused()
    await toggleButton.press('Enter')
    await expect(page.getByTestId('dynamic-info-card-expanded')).toBeVisible()
    await expectFullyInViewport(page, infoCard, `${label} expanded`)
    await expectNoHorizontalOverflow(page, `${label} expanded`)

    await page.getByTestId('home-xrpl-section').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('home-xrpl-section')).toBeVisible()
    await expectNoHorizontalOverflow(page, `${label} xrpl-section`)
  }
})

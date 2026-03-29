import { expect, test } from '@playwright/test'
import {
  HOME_ROUTE,
  MAX_DOM_CONTENT_LOADED_MS,
  MAX_HOME_VISIBLE_MS,
  RTL_HOME_ROUTES,
  attachLocatorScreenshot,
  expectFullyInViewport,
  expectHomeShellVisible,
  expectNoHorizontalOverflow,
  prepareMockedHome,
} from './home.helpers'

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
  await attachLocatorScreenshot(testInfo, page, `home-full-page-${testInfo.project.name}`, 'page')
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
})

test('home layout stays within frame on device projects', async ({ page }, testInfo) => {
  await page.goto(HOME_ROUTE, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('home-overview-section')).toBeVisible()

  const label = testInfo.project.name
  const infoCard = page.getByTestId('dynamic-info-card')
  const toggleButton = page.getByTestId('dynamic-info-card-expand-button')

  await expectNoHorizontalOverflow(page, `${label} initial`)
  await expectFullyInViewport(page, infoCard, `${label} collapsed`)
  await expect(page.getByTestId('dynamic-info-card-collapsed')).toBeVisible()

  await toggleButton.focus()
  await expect(toggleButton).toBeFocused()
  await toggleButton.click()
  await expect(page.getByTestId('dynamic-info-card-expanded')).toBeVisible()
  await expectFullyInViewport(page, infoCard, `${label} expanded`)
  await expectNoHorizontalOverflow(page, `${label} expanded`)

  await page.getByTestId('home-wallet-section').scrollIntoViewIfNeeded()
  await expect(page.getByTestId('home-wallet-section')).toBeVisible()
  await expectNoHorizontalOverflow(page, `${label} wallet-section`)
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
    await expect(page.getByTestId('dynamic-info-card-collapsed')).toBeVisible()

    await toggleButton.focus()
    await expect(toggleButton).toBeFocused()
    await toggleButton.click()
    await expect(page.getByTestId('dynamic-info-card-expanded')).toBeVisible()
    await expectFullyInViewport(page, infoCard, `${label} expanded`)
    await expectNoHorizontalOverflow(page, `${label} expanded`)

    await page.getByTestId('home-xrpl-section').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('home-xrpl-section')).toBeVisible()
    await expectNoHorizontalOverflow(page, `${label} xrpl-section`)
  }
})

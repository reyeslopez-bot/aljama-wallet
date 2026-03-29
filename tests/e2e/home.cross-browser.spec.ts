import { expect, test } from '@playwright/test'
import {
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from '../../infra/consent/constants'
import { waitForAppHydration } from './home.helpers'

const HOME_ROUTE = '/en'
const HOME_SHELL_TEST_IDS = [
  'home-overview-section',
  'home-region-map-section',
  'home-wallet-section',
  'home-xrpl-section',
  'home-trade-desk-section',
  'mapbox-map',
  'region-compliance-panel',
  'create-wallet-panel',
  'connect-wallet-panel',
  'xrpl-panel',
  'xrpl-market-panel',
  'xrpl-trade-desk',
] as const

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
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

test('home shell renders in all supported browsers', async ({ page }) => {
  test.setTimeout(240_000)

  const response = await page.goto(HOME_ROUTE, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  expect(response?.ok()).toBeTruthy()
  await waitForAppHydration(page)

  for (const testId of HOME_SHELL_TEST_IDS) {
    const locator = page.getByTestId(testId)
    await locator.scrollIntoViewIfNeeded()
    await expect(locator).toBeVisible({ timeout: testId === 'home-overview-section' ? 90_000 : 45_000 })
  }
})

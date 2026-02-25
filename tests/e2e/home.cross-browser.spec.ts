import { expect, test } from '@playwright/test'
import {
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from '../../infra/consent/constants'

const HOME_ROUTE = '/en'

test.beforeEach(async ({ page }) => {
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
  await expect(page.getByTestId('home-overview-section')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByTestId('home-region-map-section')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByTestId('home-wallet-section')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByTestId('home-xrpl-section')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByTestId('home-trade-desk-section')).toBeVisible({ timeout: 45_000 })
})

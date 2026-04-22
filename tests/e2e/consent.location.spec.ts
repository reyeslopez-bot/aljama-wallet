import { expect, test } from '@playwright/test'
import { waitForAppHydration } from './home.helpers'

const CONSENT_ROUTE = '/en/consent?next=%2Fen%2Fcompliance'
const UNAUTHENTICATED_SESSION = { user: null, expires: '2099-01-01T00:00:00.000Z' }

function jsonResponse(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  }
}

test('consent gate enables location access by default', async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill(jsonResponse(UNAUTHENTICATED_SESSION)),
  )
  await page.route('**/api/telemetry', (route) => route.fulfill(jsonResponse({ ok: true })))

  await page.goto(CONSENT_ROUTE, { waitUntil: 'domcontentloaded' })
  await waitForAppHydration(page)

  await expect(page.getByTestId('consent-gate-optional-services-switch')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('consent-gate-continue').click()

  await page.waitForURL('**/en/compliance')
  await expect
    .poll(async () =>
      page.evaluate(() => ({
        locationConsent: window.localStorage.getItem('aljama.location.consent'),
        telemetryConsent: window.localStorage.getItem('aljama.telemetry.consent'),
      })),
    )
    .toEqual({
      locationConsent: 'granted',
      telemetryConsent: 'granted',
    })
})

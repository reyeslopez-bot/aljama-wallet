import { expect, test } from '@playwright/test'
import {
  CONSENT_PROMPT_SESSION_KEY,
  CONSENT_SITE_ENTRY_SESSION_KEY,
} from '../../infra/consent/constants'
import { waitForAppHydration } from './home.helpers'

const LOGIN_ROUTE = '/en/login?mode=register'
const UNAUTHENTICATED_SESSION = { user: null, expires: '2099-01-01T00:00:00.000Z' }

function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return {
    status: init?.status ?? 200,
    contentType: 'application/json',
    headers: init?.headers,
    body: JSON.stringify(body),
  }
}

test('register flow shows localized retry windows for 429 and 503 backend responses', async ({ page }) => {
  let registerAttempt = 0

  await page.route('**/api/auth/session', (route) =>
    route.fulfill(jsonResponse(UNAUTHENTICATED_SESSION)),
  )
  await page.route('**/api/telemetry', (route) => route.fulfill(jsonResponse({ ok: true })))
  await page.route('**/api/auth/register', (route) => {
    registerAttempt += 1

    if (registerAttempt === 1) {
      return route.fulfill(
        jsonResponse(
          {
            ok: false,
            code: 'rate_limited',
            error: 'RATE_LIMITED',
            details: { retryAfter: 2 },
          },
          {
            status: 429,
            headers: { 'retry-after': '2' },
          },
        ),
      )
    }

    return route.fulfill(
      jsonResponse(
        {
          ok: false,
          code: 'rate_limit_backend_unavailable',
          error: 'RATE_LIMIT_BACKEND_UNAVAILABLE',
          details: { retryAfter: 1 },
        },
        {
          status: 503,
          headers: { 'retry-after': '1' },
        },
      ),
    )
  })

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

  await page.goto(LOGIN_ROUTE, { waitUntil: 'domcontentloaded' })
  await waitForAppHydration(page)

  await page.getByTestId('secure-gate-username-input').fill('retry_user')
  await page.getByTestId('secure-gate-password-input').fill('VeryStrongPassphrase1!')
  await expect(page.getByTestId('secure-gate-auth-submit')).toBeEnabled()
  await page.getByTestId('secure-gate-auth-submit').click()

  await expect(page.getByText('Too many attempts. Retry in 2s.')).toBeVisible()
  await expect(page.getByTestId('secure-gate-auth-submit')).toHaveText('Retry in 2s')
  await expect(page.getByTestId('secure-gate-auth-submit')).toBeDisabled()

  await expect(page.getByTestId('secure-gate-auth-submit')).toBeEnabled({ timeout: 5_000 })
  await page.getByTestId('secure-gate-auth-submit').click()

  await expect(page.getByText('Registration is temporarily unavailable. Retry in 1s.')).toBeVisible()
  await expect(page.getByTestId('secure-gate-auth-submit')).toHaveText('Retry in 1s')
  await expect(page.getByTestId('secure-gate-auth-submit')).toBeDisabled()
})

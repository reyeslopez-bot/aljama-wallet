import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000)
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`
const ENABLE_ALL_BROWSERS = process.env.PLAYWRIGHT_ALL_BROWSERS === 'true'
const ENABLE_EXTENDED_DEVICES = process.env.PLAYWRIGHT_EXTENDED_DEVICES === 'true'
const INCLUDE_PRODLIKE_SPECS = process.env.PLAYWRIGHT_INCLUDE_PRODLIKE === 'true'
const DISABLE_WEB_SERVER = process.env.PLAYWRIGHT_DISABLE_WEBSERVER === 'true'
const WEB_SERVER_NODE_ENV = process.env.PLAYWRIGHT_NODE_ENV ?? 'test'
const WEB_SERVER_NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? 'playwright-nextauth-secret'
const WEB_SERVER_NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? BASE_URL
const SERVER_COMMAND =
  process.env.PLAYWRIGHT_SERVER_COMMAND ??
  `pnpm prisma:generate && pnpm exec next dev --turbopack --port ${PORT}`

const defaultIgnoredSpecs = INCLUDE_PRODLIKE_SPECS ? [] : ['**/home.production.spec.ts']
const desktopIgnoredSpecs = [...defaultIgnoredSpecs, '**/home.mobile.spec.ts']
const mobileIgnoredSpecs = [
  ...defaultIgnoredSpecs,
  '**/home.frontend.spec.ts',
  '**/home.cross-browser.spec.ts',
]

const projects = [
  {
    name: 'chromium',
    testIgnore: desktopIgnoredSpecs,
    use: {
      ...devices['Desktop Chrome'],
    },
  },
  {
    name: 'iphone-13',
    testIgnore: mobileIgnoredSpecs,
    use: {
      ...devices['iPhone 13'],
    },
  },
  {
    name: 'pixel-7',
    testIgnore: mobileIgnoredSpecs,
    use: {
      ...devices['Pixel 7'],
    },
  },
]

if (ENABLE_ALL_BROWSERS) {
  projects.push(
    {
      name: 'firefox',
      testIgnore: desktopIgnoredSpecs,
      use: {
        ...devices['Desktop Firefox'],
      },
    },
    {
      name: 'webkit',
      testIgnore: desktopIgnoredSpecs,
      use: {
        ...devices['Desktop Safari'],
      },
    },
  )
}

if (ENABLE_EXTENDED_DEVICES) {
  projects.push(
    {
      name: 'iphone-15-pro',
      testIgnore: mobileIgnoredSpecs,
      use: {
        ...devices['iPhone 15 Pro'],
      },
    },
    {
      name: 'galaxy-s24',
      testIgnore: mobileIgnoredSpecs,
      use: {
        ...devices['Galaxy S24'],
      },
    },
    {
      name: 'ipad-pro-11',
      testIgnore: mobileIgnoredSpecs,
      use: {
        ...devices['iPad Pro 11'],
      },
    },
    {
      name: 'galaxy-tab-s9',
      testIgnore: mobileIgnoredSpecs,
      use: {
        ...devices['Galaxy Tab S9'],
      },
    },
  )
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}',
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 960 },
  },
  webServer: DISABLE_WEB_SERVER
    ? undefined
    : {
      command: SERVER_COMMAND,
      port: PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        NODE_ENV: WEB_SERVER_NODE_ENV,
        NEXT_PUBLIC_MAPBOX_TOKEN: '',
        NEXTAUTH_SECRET: WEB_SERVER_NEXTAUTH_SECRET,
        NEXTAUTH_URL: WEB_SERVER_NEXTAUTH_URL,
      },
    },
  projects,
})

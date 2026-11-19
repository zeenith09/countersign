import { defineConfig, devices } from '@playwright/test'
import { readEnv } from './src/lib/config/env.mjs'

function getLocalE2EDatabaseUrl() {
  const value = readEnv('E2E_DATABASE_URL')
  if (!value) {
    throw new Error('E2E_DATABASE_URL is required and must target the local disposable test database.')
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('E2E_DATABASE_URL must be a valid Postgres connection URL.')
  }
  if (
    (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '5432' ||
    url.pathname !== '/countersign_test'
  ) {
    throw new Error('E2E_DATABASE_URL must target 127.0.0.1:5432/countersign_test.')
  }
  return value
}

const e2eDatabaseUrl = getLocalE2EDatabaseUrl()

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!readEnv('CI'),
  retries: readEnv('CI') ? 2 : 0,
  workers: readEnv('CI') ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    env: {
      APP_ORIGIN: "http://127.0.0.1:3100",
      DATABASE_URL: e2eDatabaseUrl,
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
})

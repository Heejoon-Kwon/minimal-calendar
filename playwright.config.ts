import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 75_000,
  reporter: 'list',
  testIgnore: ['**/touch.spec.ts', '**/auth.spec.ts'],
  outputDir: 'test-results',
  use: { baseURL: 'http://localhost:4174/monthline/', trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone-390', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: 'iphone-375', use: { browserName: 'webkit', viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: 'desktop-1440', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'supabase-fixture', testIgnore: [], testMatch: '**/auth.spec.ts', use: { browserName: 'chromium' } },
    { name: 'supabase-fixture-mobile', testIgnore: [], testMatch: '**/auth.spec.ts', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'chromium-touch', testIgnore: [], testMatch: '**/touch.spec.ts', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [{
    command: 'npm run build && npm run preview -- --port 4174 --strictPort --base /monthline/',
    url: 'http://localhost:4174/monthline/',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
  }, {
    command: 'npm run build -- --outDir dist-auth && npm run preview -- --outDir dist-auth --port 4175 --strictPort --base /auth-test/',
    url: 'http://localhost:4175/auth-test/',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_SUPABASE_URL: 'http://localhost:55334', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture' },
  }],
})

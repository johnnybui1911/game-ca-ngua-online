import { defineConfig } from '@playwright/test';

/**
 * Two server environments, run one after another on the same port by `e2e/run.mjs`:
 *  - `none`: no OAuth credentials (CLOUDFLARE_ENV=e2e-none picks `.dev.vars.e2e-none`).
 *  - `mock`: fake credentials and provider endpoints pointing at the mock server
 *            (`.dev.vars.e2e-mock`).
 * A named env file replaces a developer's own `.dev.vars`, which is never touched.
 */
const mode = process.env.E2E_ENV === 'none' ? 'none' : 'mock';
const MOCK_PORT = 5199;

export default defineConfig({
  testDir: 'e2e',
  testMatch: mode === 'none' ? 'auth-unconfigured.spec.ts' : /auth-(?!unconfigured).*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5173', locale: 'vi-VN', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'npm run db:migrate:local && npx vite',
      url: 'http://127.0.0.1:5173/api/health',
      env: { CLOUDFLARE_ENV: `e2e-${mode}` },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    ...(mode === 'mock'
      ? [
          {
            command: 'node e2e/mock-oauth/server.mjs',
            port: MOCK_PORT,
            reuseExistingServer: false,
            timeout: 30_000,
          },
        ]
      : []),
  ],
});

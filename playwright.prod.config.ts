import { defineConfig } from '@playwright/test';

/** Smoke checks against a deployed site: `PROD_URL=https://... npm run e2e:prod`. Starts no server. */
const baseURL = process.env.PROD_URL;
if (!baseURL) throw new Error('Set PROD_URL to the deployed site origin.');

export default defineConfig({
  testDir: 'e2e/prod',
  workers: 1,
  reporter: [['list']],
  use: { baseURL, locale: 'vi-VN', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});

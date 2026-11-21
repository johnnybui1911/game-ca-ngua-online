import { expect, test } from '@playwright/test';
import { ORIGIN_HEADER } from './auth-helpers';
import {
  GAME_TIMEOUT,
  VIEWPORT,
  createRoom,
  freshAddress,
  newGuest,
  ORIGIN,
  startAutoPlayer,
} from './helpers/rooms';

const PROVIDERS = ['google', 'facebook', 'x'];

test('without credentials no provider button and no divider is rendered on sign-in or sign-up', async ({ page }) => {
  for (const path of ['/dang-nhap', '/dang-ky']) {
    await page.goto(path);
    await expect(page.locator('form')).toBeVisible();
    for (const p of PROVIDERS) await expect(page.getByTestId(`oauth-${p}`)).toHaveCount(0);
    await expect(page.getByTestId('provider-divider')).toHaveCount(0);
    await expect(page.locator('.provider-list')).toHaveCount(0);
  }
});

test('the start route of an unconfigured provider redirects with an error', async ({ page }) => {
  await page.goto('/api/auth/oauth/google/start');
  await expect(page).toHaveURL(/\/dang-nhap\?error=provider_not_configured/);
  await expect(page.getByTestId('signin-error')).toBeVisible();
});

test('/api/auth/me reports no provider as configured', async ({ request }) => {
  const body = await (await request.get('/api/auth/me')).json();
  expect(body).toEqual({ user: null, providers: { google: false, facebook: false, x: false } });
});

test('guest creation is limited per client address and answers 429 once the limit is spent', async ({ browser }) => {
  const address = freshAddress();
  const create = (ip: string) =>
    // A new request context each time: no session cookie, so only the address limit can refuse.
    browser.newContext({ baseURL: ORIGIN }).then(async (ctx) => {
      const res = await ctx.request.post('/api/auth/guest', {
        headers: { ...ORIGIN_HEADER, 'CF-Connecting-IP': ip },
        data: { displayName: 'Khách Hạn Mức' },
      });
      const body = (await res.json()) as { error?: { code: string; message: string } };
      await ctx.close();
      return { status: res.status(), body };
    });
  for (let i = 0; i < 10; i++) expect((await create(address)).status).toBe(200);
  const refused = await create(address);
  expect(refused.status).toBe(429);
  expect(refused.body.error?.code).toBe('too_many_guests');
  expect(refused.body.error?.message).toMatch(/quá nhiều/);
  // Another address is unaffected.
  expect((await create(freshAddress())).status).toBe(200);
});

test('the end-of-match save-account block shows the email form and no provider button or divider', async ({ browser }) => {
  test.setTimeout(GAME_TIMEOUT + 60_000);
  const host = await newGuest(browser, 'Khách Không Nhà Cung Cấp', VIEWPORT);
  const code = await createRoom(host, { name: 'Một người ba máy', seats: 4 });
  await host.page.goto(`/r/${code}`);
  for (const seat of [1, 2, 3]) await host.page.getByTestId(`add-cpu-${seat}`).click();
  await host.page.getByTestId('start-button').click();
  await expect(host.page.getByTestId('hud')).toBeVisible();
  await startAutoPlayer(host.page);
  await expect(host.page.getByTestId('win-dialog')).toBeVisible({ timeout: GAME_TIMEOUT });
  await expect(host.page.getByTestId('save-account')).toBeVisible();
  await expect(host.page.getByTestId('save-email')).toBeVisible();
  for (const p of PROVIDERS) await expect(host.page.getByTestId(`oauth-${p}`)).toHaveCount(0);
  await expect(host.page.getByTestId('provider-divider')).toHaveCount(0);
  await host.context.close();
});

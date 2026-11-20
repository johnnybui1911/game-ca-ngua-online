import { expect, test } from '@playwright/test';

test('without credentials the provider buttons are disabled and labelled', async ({ page }) => {
  await page.goto('/dang-nhap');
  await expect(page.getByTestId('oauth-google')).toHaveText('Google (chưa cấu hình)');
  await expect(page.getByTestId('oauth-facebook')).toHaveText('Facebook (chưa cấu hình)');
  await expect(page.getByTestId('oauth-x')).toHaveText('X (chưa cấu hình)');
  for (const p of ['google', 'facebook', 'x']) await expect(page.getByTestId(`oauth-${p}`)).toBeDisabled();
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

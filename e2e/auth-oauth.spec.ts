import { expect, test } from '@playwright/test';
import { PASSWORD, control, enterLobby, signOut, signUp, uniqueEmail } from './auth-helpers';

test.beforeEach(async () => {
  await control('reset');
});

for (const [provider, label] of [
  ['google', 'Google'],
  ['facebook', 'Facebook'],
  ['x', 'X'],
] as const) {
  test(`${label}: sign in completes and a second sign-in reuses the user`, async ({ page }) => {
    const id = `${provider}-${Date.now()}`;
    await control('profile', { provider, profile: { id, name: `Mock ${label} ${id.slice(-4)}` } });

    await page.goto('/dang-nhap?returnTo=%2Fr%2FABC234');
    await expect(page.getByTestId(`oauth-${provider}`)).toBeEnabled();
    await page.getByTestId(`oauth-${provider}`).click();
    await expect(page).toHaveURL('/r/ABC234');
    await page.goto('/');
    const greeting = `Xin chào, Mock ${label} ${id.slice(-4)}`;
    await expect(page.getByTestId('greeting')).toHaveText(greeting);
    const first = await (await page.request.get('/api/auth/me')).json();

    await signOut(page);
    // The profile name changed at the provider; the existing account must be reused, not recreated.
    await control('profile', { provider, profile: { id, name: 'Tên Khác' } });
    await page.getByTestId(`oauth-${provider}`).click();
    await expect(page.getByTestId('greeting')).toHaveText(greeting);
    const second = await (await page.request.get('/api/auth/me')).json();
    expect(second.user.id).toBe(first.user.id);
  });
}

test('Google verified email links to the existing email account', async ({ page }) => {
  const email = uniqueEmail('lien-ket');
  await signUp(page, email, 'Chủ Tài Khoản');
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Chủ Tài Khoản');
  const before = await (await page.request.get('/api/auth/me')).json();
  await signOut(page);

  await control('profile', {
    provider: 'google',
    profile: { id: `g-${Date.now()}`, name: 'Tên Từ Google', email, emailVerified: true },
  });
  await page.getByTestId('oauth-google').click();
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Chủ Tài Khoản');
  const after = await (await page.request.get('/api/auth/me')).json();
  expect(after.user.id).toBe(before.user.id);
});

test('linking Google hands the account to the Google owner: old password and old sessions stop working', async ({
  page,
  browser,
}) => {
  const email = uniqueEmail('chiem-quyen');
  await signUp(page, email, 'Người Đăng Ký Trước');
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Người Đăng Ký Trước');
  const before = await (await page.request.get('/api/auth/me')).json();

  // A second browser holds a session created by password sign-in, before the link exists.
  const attacker = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  const origin = { Origin: 'http://127.0.0.1:5173' };
  const login = () => attacker.request.post('/api/auth/signin', { headers: origin, data: { email, password: PASSWORD } });
  expect((await login()).status()).toBe(200);
  expect(((await (await attacker.request.get('/api/auth/me')).json()) as { user: unknown }).user).not.toBeNull();

  await signOut(page);
  await control('profile', {
    provider: 'google',
    profile: { id: `g-${Date.now()}`, name: 'Chủ Google', email, emailVerified: true },
  });
  await page.getByTestId('oauth-google').click();
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Người Đăng Ký Trước');
  const after = await (await page.request.get('/api/auth/me')).json();
  expect(after.user.id).toBe(before.user.id);

  expect(((await (await attacker.request.get('/api/auth/me')).json()) as { user: unknown }).user).toBeNull();
  expect((await login()).status()).toBe(401);
  await attacker.close();
});

test('Google with an unverified email does not link', async ({ page }) => {
  const email = uniqueEmail('chua-xac-minh');
  await signUp(page, email, 'Chủ Thật');
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Chủ Thật');
  const before = await (await page.request.get('/api/auth/me')).json();
  await signOut(page);

  await control('profile', {
    provider: 'google',
    profile: { id: `g-${Date.now()}`, name: 'Kẻ Mạo Danh', email, emailVerified: false },
  });
  await page.getByTestId('oauth-google').click();
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Kẻ Mạo Danh');
  const after = await (await page.request.get('/api/auth/me')).json();
  expect(after.user.id).not.toBe(before.user.id);
});

test('Facebook with the same email creates a separate user', async ({ page }) => {
  const email = uniqueEmail('facebook');
  await signUp(page, email, 'Chủ Email');
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Chủ Email');
  const before = await (await page.request.get('/api/auth/me')).json();
  await signOut(page);

  await control('profile', {
    provider: 'facebook',
    profile: { id: `f-${Date.now()}`, name: 'Người Facebook', email, emailVerified: true },
  });
  await page.getByTestId('oauth-facebook').click();
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Người Facebook');
  const after = await (await page.request.get('/api/auth/me')).json();
  expect(after.user.id).not.toBe(before.user.id);

  // The email account keeps its password sign-in.
  await signOut(page);
  await page.getByTestId('signin-email').fill(email);
  await page.getByTestId('signin-password').fill('mat-khau-123');
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Chủ Email');
});

test('a provider-only account cannot sign in with a password', async ({ page }) => {
  const email = uniqueEmail('chi-google');
  await control('profile', {
    provider: 'google',
    profile: { id: `g-${Date.now()}`, name: 'Chỉ Google', email, emailVerified: true },
  });
  await page.goto('/dang-nhap');
  await page.getByTestId('oauth-google').click();
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Chỉ Google');
  await signOut(page);

  await page.getByTestId('signin-email').fill(email);
  await page.getByTestId('signin-password').fill('bat-ky-mat-khau');
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('signin-error')).toHaveText('Email hoặc mật khẩu không đúng.');
});

test('a denied authorization shows a generic error', async ({ page }) => {
  await control('deny', { provider: 'x', deny: true });
  await page.goto('/dang-nhap');
  await page.getByTestId('oauth-x').click();
  await expect(page).toHaveURL(/\/dang-nhap\?error=oauth_failed/);
  await expect(page.getByTestId('signin-error')).toHaveText('Đăng nhập không thành công. Vui lòng thử lại.');
});

test('a callback with a wrong state is refused', async ({ page, request }) => {
  await page.goto('/dang-nhap');
  const res = await request.get('/api/auth/oauth/google/callback?code=abc&state=forged', { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers().location).toBe('/dang-nhap?error=oauth_failed');
});

test('returnTo that leaves the site is replaced by /', async ({ page }) => {
  await control('profile', { provider: 'facebook', profile: { id: `f-${Date.now()}`, name: 'Người Đi' } });
  await page.goto('/api/auth/oauth/facebook/start?returnTo=//evil.example/x');
  await expect(page).toHaveURL('/');
  // A tab that starts on the provider's return lands on the home page first.
  await enterLobby(page);
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Người Đi');
});

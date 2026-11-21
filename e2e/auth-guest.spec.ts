import { expect, test } from '@playwright/test';
import { ORIGIN_HEADER, PASSWORD, control, signUp, uniqueEmail, whoAmI } from './auth-helpers';
import { createRoom, newGuest, newPlayer, ORIGIN } from './helpers/rooms';

test.beforeEach(async () => {
  await control('reset');
});

test('an invite link opens the entry screen, one name seats the visitor and no email field is shown', async ({ browser }) => {
  const host = await newPlayer(browser, 'Chủ Phòng Khách');
  const code = await createRoom(host, { name: 'Phòng chào khách', visibility: 'private', seats: 3 });
  await host.page.goto(`/r/${code}`);

  const visitor = await browser.newContext({ baseURL: ORIGIN, locale: 'vi-VN' });
  const page = await visitor.newPage();
  await page.goto(`/r/${code}?utm_source=invite`);
  // The tag is remembered as the visitor's source and dropped from the address, so it never reaches returnTo.
  await expect(page).toHaveURL(new RegExp(`/bat-dau\\?returnTo=%2Fr%2F${code}$`));
  expect((await visitor.cookies()).find((c) => c.name === 'ca_src')?.value).toBe('invite');
  await expect(page.getByTestId('entry-room-name')).toHaveText('Phòng chào khách');
  await expect(page.getByTestId('entry-room-host')).toHaveText('Chủ Phòng Khách');
  await expect(page.getByTestId('guest-submit')).toHaveText('Vào phòng');
  await expect(page.locator('input[type=email], input[type=password]')).toHaveCount(0);

  await page.getByTestId('guest-name').fill('Khách Vào Phòng');
  await page.getByTestId('guest-submit').click();
  await expect(page).toHaveURL(`/r/${code}`);
  await expect(page.getByTestId('seat-1-name')).toContainText('Khách Vào Phòng (bạn)');
  await expect(host.page.getByTestId('seat-1-name')).toContainText('Khách Vào Phòng');
  expect(await whoAmI(page)).toMatchObject({ displayName: 'Khách Vào Phòng', guest: true });
  await visitor.close();
  await host.context.close();
});

test('an unknown room code says so and continues to the lobby', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: ORIGIN, locale: 'vi-VN' });
  const page = await context.newPage();
  await page.goto('/r/ZZZZ22');
  await expect(page.getByTestId('entry-room-missing')).toHaveText(/Không tìm thấy phòng/);
  await page.getByTestId('guest-name').fill('Khách Lạc');
  await page.getByTestId('guest-submit').click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Khách Lạc');
  await context.close();
});

test('the entry screen validates the name and /bat-dau with a session goes on to returnTo', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: ORIGIN, locale: 'vi-VN' });
  const page = await context.newPage();
  await page.goto('/bat-dau');
  await page.getByTestId('guest-name').fill('A');
  await page.getByTestId('guest-submit').click();
  await expect(page.getByTestId('guest-error')).toBeVisible();
  expect(await whoAmI(page)).toBeNull();

  await page.getByTestId('guest-name').fill('Khách Hợp Lệ');
  await page.getByTestId('guest-submit').click();
  await expect(page).toHaveURL('/');
  await page.goto('/bat-dau?returnTo=%2Fr%2FABC234');
  await expect(page).toHaveURL('/r/ABC234');
  await context.close();
});

test('a visitor at / enters a name, reaches the lobby and keeps the same user after reload', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: ORIGIN, locale: 'vi-VN' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page).toHaveURL(/\/bat-dau\?returnTo=%2F$/);
  await expect(page.getByTestId('guest-submit')).toHaveText('Chơi ngay');
  await expect(page.getByTestId('entry-room')).toHaveCount(0);
  await page.getByTestId('guest-name').fill('Khách Sảnh');
  await page.getByTestId('guest-submit').click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Khách Sảnh');
  const before = await whoAmI(page);
  await page.reload();
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Khách Sảnh');
  expect((await whoAmI(page))?.id).toBe(before?.id);

  // The lobby tells a guest so and asks before a sign-out throws the name away.
  await expect(page.getByTestId('guest-notice')).toContainText('Bạn đang chơi với tư cách khách');
  await expect(page.getByTestId('guest-save-link')).toHaveAttribute('href', '/dang-ky?returnTo=/');
  await expect(page.getByTestId('signout')).toHaveText('Thoát');
  await page.getByTestId('signout').click();
  await expect(page.getByTestId('signout-confirm-box')).toContainText('mất tên khách');
  await page.getByTestId('signout-cancel').click();
  await expect(page.getByTestId('greeting')).toBeVisible();
  await page.getByTestId('signout').click();
  await page.getByTestId('signout-confirm').click();
  await expect(page).toHaveURL(/\/bat-dau/);
  expect(await whoAmI(page)).toBeNull();
  await context.close();
});

test('a registered player sees no guest notice and the usual sign-out', async ({ browser }) => {
  const p = await newPlayer(browser, 'Người Đã Đăng Ký');
  await p.page.goto('/');
  await expect(p.page.getByTestId('greeting')).toBeVisible();
  await expect(p.page.getByTestId('guest-notice')).toHaveCount(0);
  await expect(p.page.getByTestId('signout')).toHaveText('Đăng xuất');
  await p.context.close();
});

test('guests created at the same moment all get a working session', async ({ browser }) => {
  const results = await Promise.all(
    Array.from({ length: 6 }, async (_, i) => {
      const ctx = await browser.newContext({ baseURL: ORIGIN });
      const res = await ctx.request.post('/api/auth/guest', { headers: ORIGIN_HEADER, data: { displayName: `Khách Song Song ${i}` } });
      const me = (await (await ctx.request.get('/api/auth/me')).json()) as { user: { guest: boolean } | null };
      await ctx.close();
      return { status: res.status(), guest: me.user?.guest };
    }),
  );
  expect(results).toEqual(Array.from({ length: 6 }, () => ({ status: 200, guest: true })));
});

test('guest creation refuses a visitor who already has a session', async ({ browser }) => {
  const g = await newGuest(browser, 'Khách Hai Lần');
  const again = await g.context.request.post('/api/auth/guest', { headers: ORIGIN_HEADER, data: { displayName: 'Lần Hai' } });
  expect(again.status()).toBe(409);
  expect(((await again.json()) as { error: { code: string } }).error.code).toBe('already_signed_in');
  const cross = await browser.newContext({ baseURL: ORIGIN });
  const res = await cross.request.post('/api/auth/guest', { headers: { Origin: 'https://evil.example' }, data: { displayName: 'Kẻ Lạ' } });
  expect(res.status()).toBe(403);
  await cross.close();
  await g.context.close();
});

test('the sign-up page turns a guest into a registered user in place, and a taken email changes nothing', async ({ browser }) => {
  const owner = await browser.newContext({ baseURL: ORIGIN, locale: 'vi-VN' });
  const ownerEmail = uniqueEmail('chu');
  const ownerPage = await owner.newPage();
  await signUp(ownerPage, ownerEmail, 'Chủ Email Hai');
  await expect(ownerPage.getByTestId('greeting')).toBeVisible();

  const g = await newGuest(browser, 'Khách Lưu Thử');
  await g.page.goto('/dang-ky?returnTo=/');
  await expect(g.page.getByRole('heading', { name: 'Lưu tài khoản' })).toBeVisible();
  await expect(g.page.getByTestId('signup-name')).toHaveValue('Khách Lưu Thử');

  await g.page.getByTestId('signup-email').fill(ownerEmail);
  await g.page.getByTestId('signup-password').fill(PASSWORD);
  await g.page.getByTestId('signup-submit').click();
  await expect(g.page.getByTestId('signup-error')).toHaveText('Email này đã được đăng ký.');
  expect(await whoAmI(g.page)).toMatchObject({ id: g.id, guest: true });

  const email = uniqueEmail('khach-luu');
  await g.page.getByTestId('signup-email').fill(email);
  await g.page.getByTestId('signup-submit').click();
  await expect(g.page).toHaveURL('/');
  expect(await whoAmI(g.page)).toEqual({ id: g.id, displayName: 'Khách Lưu Thử', guest: false });
  await expect(g.page.getByTestId('guest-notice')).toHaveCount(0);

  const other = await browser.newContext({ baseURL: ORIGIN });
  const res = await other.request.post('/api/auth/signin', { headers: ORIGIN_HEADER, data: { email, password: PASSWORD } });
  expect(((await res.json()) as { user: { id: string } }).user.id).toBe(g.id);
  await other.close();
  await g.context.close();
  await owner.close();
});

test('a guest who signs in by email is switched to that account and the guest user is gone', async ({ browser }) => {
  const email = uniqueEmail('co-san');
  const owner = await browser.newContext({ baseURL: ORIGIN, locale: 'vi-VN' });
  const ownerPage = await owner.newPage();
  await signUp(ownerPage, email, 'Tài Khoản Có Sẵn');
  await expect(ownerPage.getByTestId('greeting')).toBeVisible();
  const ownerId = (await whoAmI(ownerPage))?.id;

  const g = await newGuest(browser, 'Khách Đăng Nhập');
  const guestCookies = await g.context.cookies();
  await g.page.goto('/dang-nhap');
  await g.page.getByTestId('signin-email').fill(email);
  await g.page.getByTestId('signin-password').fill(PASSWORD);
  await g.page.getByTestId('signin-submit').click();
  await expect(g.page.getByTestId('greeting')).toHaveText('Xin chào, Tài Khoản Có Sẵn');
  const me = await whoAmI(g.page);
  expect(me).toMatchObject({ id: ownerId, guest: false });
  expect(me?.id).not.toBe(g.id);

  const stale = await browser.newContext({ baseURL: ORIGIN });
  await stale.addCookies(guestCookies);
  expect(await whoAmI(await stale.newPage())).toBeNull();
  await stale.close();
  await g.context.close();
  await owner.close();
});

test('a guest signing in with a provider seen for the first time keeps the user and the chosen name', async ({ browser }) => {
  const g = await newGuest(browser, 'Tên Khách Chọn');
  await control('profile', { provider: 'facebook', profile: { id: `f-${Date.now()}`, name: 'Tên Từ Facebook' } });
  await g.page.goto('/dang-nhap');
  await g.page.getByTestId('oauth-facebook').click();
  await expect(g.page).toHaveURL('/');
  await expect(g.page.getByTestId('greeting')).toHaveText('Xin chào, Tên Khách Chọn');
  expect(await whoAmI(g.page)).toEqual({ id: g.id, displayName: 'Tên Khách Chọn', guest: false });
  await g.context.close();
});

test('a guest signing in with a provider that already has an account switches to it', async ({ browser }) => {
  const profileId = `g-${Date.now()}`;
  await control('profile', { provider: 'google', profile: { id: profileId, name: 'Chủ Google Cũ' } });
  const first = await browser.newContext({ baseURL: ORIGIN, locale: 'vi-VN' });
  const firstPage = await first.newPage();
  await firstPage.goto('/dang-nhap');
  await firstPage.getByTestId('oauth-google').click();
  await expect(firstPage.getByTestId('greeting')).toHaveText('Xin chào, Chủ Google Cũ');
  const ownerId = (await whoAmI(firstPage))?.id;

  const g = await newGuest(browser, 'Khách Sắp Đổi');
  const guestCookies = await g.context.cookies();
  await g.page.goto('/dang-nhap');
  await g.page.getByTestId('oauth-google').click();
  await expect(g.page.getByTestId('greeting')).toHaveText('Xin chào, Chủ Google Cũ');
  expect((await whoAmI(g.page))?.id).toBe(ownerId);

  const stale = await browser.newContext({ baseURL: ORIGIN });
  await stale.addCookies(guestCookies);
  expect(await whoAmI(await stale.newPage())).toBeNull();
  await stale.close();
  await g.context.close();
  await first.close();
});

test('a guest signing in with Google whose verified email belongs to an account switches to that account', async ({ browser }) => {
  const email = uniqueEmail('chu-email');
  const owner = await browser.newContext({ baseURL: ORIGIN, locale: 'vi-VN' });
  const ownerPage = await owner.newPage();
  await signUp(ownerPage, email, 'Chủ Của Email');
  await expect(ownerPage.getByTestId('greeting')).toBeVisible();
  const ownerId = (await whoAmI(ownerPage))?.id;

  const g = await newGuest(browser, 'Khách Có Email');
  await control('profile', { provider: 'google', profile: { id: `g-${Date.now()}`, name: 'Tên Google', email, emailVerified: true } });
  await g.page.goto('/dang-nhap');
  await g.page.getByTestId('oauth-google').click();
  await expect(g.page.getByTestId('greeting')).toHaveText('Xin chào, Chủ Của Email');
  expect((await whoAmI(g.page))?.id).toBe(ownerId);
  await g.context.close();
  await owner.close();
});

test('the landing page explains the game and its play button leads to the entry screen', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: ORIGIN, locale: 'vi-VN' });
  const page = await context.newPage();
  await page.goto('/co-ca-ngua-online?utm_source=facebook');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cờ cá ngựa online, đúng luật Việt Nam');
  await expect(page.locator('#luat-choi')).toBeVisible();
  expect((await context.cookies()).find((c) => c.name === 'ca_src')?.value).toBe('facebook');
  await page.getByTestId('landing-play').click();
  await expect(page).toHaveURL(/\/bat-dau\?returnTo=%2F$/);
  await expect(page.getByTestId('entry-landing-link')).toHaveAttribute('href', '/co-ca-ngua-online');
  await context.close();
});

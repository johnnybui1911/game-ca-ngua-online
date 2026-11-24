import { expect, test, type Page } from '@playwright/test';
import { ORIGIN_HEADER, PASSWORD, control, uniqueEmail, whoAmI } from './auth-helpers';
import { GAME_TIMEOUT, newGuest, ORIGIN, startAutoPlayer, startTwoPlayerGame } from './helpers/rooms';

test.setTimeout(GAME_TIMEOUT + 120_000);

const myColor = (page: Page) => page.getByTestId('hud').getAttribute('data-my-color');

test('two guests play a match; both are offered to save, an email upgrade keeps seat and name, a provider upgrade keeps the user', async ({
  browser,
}) => {
  await control('reset');
  const { a, b, code } = await startTwoPlayerGame(browser, ['Khách Một', 'Khách Hai'], undefined, newGuest);
  const colorA = await myColor(a.page);
  const colorB = await myColor(b.page);
  await startAutoPlayer(a.page);
  await startAutoPlayer(b.page);
  await expect(a.page.getByTestId('win-dialog')).toBeVisible({ timeout: GAME_TIMEOUT });
  await expect(b.page.getByTestId('win-dialog')).toBeVisible({ timeout: 30_000 });

  // The winner and the loser both see the block, and it leaves the dialog's buttons reachable.
  for (const p of [a, b]) {
    await expect(p.page.getByTestId('save-account')).toBeVisible();
    await expect(p.page.getByTestId('to-lobby')).toBeVisible();
    await expect(p.page.getByTestId('save-email')).toBeVisible();
    await expect(p.page.getByTestId('oauth-google')).toBeVisible();
    for (const provider of ['facebook', 'x']) await expect(p.page.getByTestId(`oauth-${provider}`)).toHaveCount(0);
  }
  await expect(a.page.getByTestId('rematch-button')).toBeVisible();

  // The block can be dismissed, and the dialog stays.
  await b.page.getByTestId('save-dismiss').click();
  await expect(b.page.getByTestId('save-account')).toHaveCount(0);
  await expect(b.page.getByTestId('win-dialog')).toBeVisible();

  // An email that already has an account is refused inline and the guest stays a guest.
  const takenEmail = uniqueEmail('da-co');
  const taken = await browser.newContext({ baseURL: ORIGIN });
  expect((await taken.request.post('/api/auth/signup', { headers: ORIGIN_HEADER, data: { email: takenEmail, password: PASSWORD, displayName: 'Đã Có' } })).ok()).toBe(true);
  await taken.close();
  await a.page.getByTestId('save-email').fill(takenEmail);
  await a.page.getByTestId('save-password').fill(PASSWORD);
  await a.page.getByTestId('save-submit').click();
  await expect(a.page.getByTestId('save-error')).toHaveText('Email này đã được đăng ký.');
  expect(await whoAmI(a.page)).toMatchObject({ id: a.id, guest: true });

  // A new email upgrades in place without leaving the room.
  const email = uniqueEmail('luu-sau-van');
  await a.page.getByTestId('save-email').fill(email);
  await a.page.getByTestId('save-submit').click();
  await expect(a.page.getByTestId('save-account-done')).toBeVisible();
  await expect(a.page).toHaveURL(`/r/${code}`);
  await expect(a.page.getByTestId('win-dialog')).toBeVisible();
  expect(await whoAmI(a.page)).toEqual({ id: a.id, displayName: 'Khách Một', guest: false });
  expect(await myColor(a.page)).toBe(colorA);
  await expect(a.page.getByTestId('save-account')).toHaveCount(0);

  await a.page.reload();
  await expect(a.page.getByTestId('hud')).toBeVisible();
  expect(await myColor(a.page)).toBe(colorA);
  expect((await whoAmI(a.page))?.id).toBe(a.id);

  const elsewhere = await browser.newContext({ baseURL: ORIGIN });
  const signin = await elsewhere.request.post('/api/auth/signin', { headers: ORIGIN_HEADER, data: { email, password: PASSWORD } });
  expect(((await signin.json()) as { user: { id: string; guest: boolean } }).user).toMatchObject({ id: a.id, guest: false });
  await elsewhere.close();

  // The loser upgrades through a provider from the room: same user, same name, same seat.
  await b.page.reload();
  await expect(b.page.getByTestId('win-dialog')).toBeVisible();
  await control('profile', { provider: 'google', profile: { id: `g-${Date.now()}`, name: 'Tên Google Khác' } });
  expect(await whoAmI(b.page)).toMatchObject({ id: b.id, guest: true });
  await b.page.getByTestId('oauth-google').click();
  await expect(b.page).toHaveURL(`/r/${code}`);
  await expect(b.page.getByTestId('hud')).toBeVisible();
  expect(await whoAmI(b.page)).toEqual({ id: b.id, displayName: 'Khách Hai', guest: false });
  expect(await myColor(b.page)).toBe(colorB);

  await a.context.close();
  await b.context.close();
});

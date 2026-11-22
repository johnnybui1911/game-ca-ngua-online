import { expect, type Page } from '@playwright/test';

export const MOCK = 'http://127.0.0.1:5199';
export const PASSWORD = 'mat-khau-123';

export const uniqueEmail = (tag: string) =>
  `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;

export async function control(path: string, body: unknown = {}) {
  const res = await fetch(`${MOCK}/__control/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(res.ok).toBe(true);
}

export async function signUp(page: Page, email: string, name: string, password = PASSWORD) {
  await page.goto('/dang-ky');
  await page.getByTestId('signup-name').fill(name);
  await page.getByTestId('signup-email').fill(email);
  await page.getByTestId('signup-password').fill(password);
  await page.getByTestId('signup-submit').click();
}

/** Signs out from the lobby, which leaves the visitor on the home page, and opens the sign-in page. */
export async function signOut(page: Page) {
  await page.getByTestId('signout').click();
  await expect(page.getByTestId('play-now')).toBeVisible();
  await expect(page).toHaveURL('/');
  await page.goto('/dang-nhap');
}

/**
 * Goes on to the lobby from `/`: a fresh tab shows the home page and needs "Chơi ngay", a tab that
 * already went past it (a room, a sign-in page) is taken to the lobby directly.
 */
export async function enterLobby(page: Page) {
  const play = page.getByTestId('play-now');
  const greeting = page.getByTestId('greeting');
  await expect(play.or(greeting)).toBeVisible();
  if (await play.isVisible()) await play.click();
  await expect(greeting).toBeVisible();
}

/** Opens `/` and goes on to the lobby. */
export async function openLobby(page: Page) {
  await page.goto('/');
  await enterLobby(page);
}

export const ORIGIN_HEADER = { Origin: 'http://127.0.0.1:5173' };

/** Current user of the page's session, from the server. */
export async function whoAmI(page: Page): Promise<{ id: string; displayName: string; guest: boolean } | null> {
  const me = (await (await page.request.get('/api/auth/me')).json()) as {
    user: { id: string; displayName: string; guest: boolean } | null;
  };
  return me.user;
}

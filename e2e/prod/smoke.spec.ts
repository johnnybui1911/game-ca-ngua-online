/**
 * Smoke check against a deployed site (PROD_URL). Creates throwaway users that can be removed
 * from the database afterwards: guests named `Khoi-smoke-...` and accounts whose emails start
 * with `prod-smoke-`.
 */
import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, signOut, signUp } from '../auth-helpers';

const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** Display names are at most 24 characters. */
const tag = stamp.slice(-8);
const email = (who: string) => `prod-smoke-${who}-${stamp}@example.com`;

test.setTimeout(240_000);

async function hud(page: Page) {
  const el = page.getByTestId('hud');
  return {
    seq: Number(await el.getAttribute('data-seq')),
    horses: await el.getAttribute('data-horses'),
  };
}

/** Enters as a guest through the entry screen, from wherever the page is sent. */
async function enterAsGuest(page: Page, name: string) {
  await expect(page).toHaveURL(/\/bat-dau/);
  await page.getByTestId('guest-name').fill(name);
  await page.getByTestId('guest-submit').click();
}

/** Rolls or moves when the HUD offers it; returns whether it acted. */
async function act(page: Page): Promise<boolean> {
  for (const target of [page.getByTestId('roll-button'), page.locator('[data-testid^=move-button-]').first()]) {
    if ((await target.isVisible()) && (await target.isEnabled())) {
      await target.click({ timeout: 5000 }).catch(() => undefined);
      return true;
    }
  }
  return false;
}

test('accounts, a shared room and a live two-player match work on the deployed site', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();

  // Email sign-up, sign-out and sign-in.
  await signUp(a, email('a'), 'Khói Một');
  await expect(a.getByTestId('greeting')).toContainText('Khói Một');
  await signOut(a);
  // A provider button exists exactly when the deployment holds credentials for it.
  const me = (await (await ctxA.request.get('/api/auth/me')).json()) as { providers: Record<string, boolean> };
  for (const p of ['google', 'facebook', 'x']) {
    await expect(a.getByTestId(`oauth-${p}`)).toHaveCount(me.providers[p] ? 1 : 0);
  }
  await a.getByTestId('signin-email').fill(email('a'));
  await a.getByTestId('signin-password').fill(PASSWORD);
  await a.getByTestId('signin-submit').click();
  await expect(a.getByTestId('greeting')).toContainText('Khói Một');

  // A private two-seat room, shared by link.
  await a.getByTestId('create-visibility-private').check();
  await a.getByTestId('create-seats').selectOption('2');
  await a.getByTestId('create-submit').click();
  await expect(a).toHaveURL(/\/r\/[A-Z2-9]{6}$/);
  const roomUrl = a.url();

  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const b = await ctxB.newPage();
  // The second player follows the link, names themselves once and never sees an email form.
  await b.goto(roomUrl);
  await expect(b.getByTestId('entry-room')).toBeVisible();
  await expect(b.locator('input[type=email]')).toHaveCount(0);
  await enterAsGuest(b, `Khoi-smoke-b-${tag}`);
  await expect(b).toHaveURL(roomUrl);

  await expect(a.getByTestId('seat-1-name')).toContainText(`Khoi-smoke-b-${tag}`);
  await a.getByTestId('start-button').click();
  await expect(a.getByTestId('hud')).toBeVisible();
  await expect(b.getByTestId('hud')).toBeVisible();
  const colorB = await b.getByTestId('hud').getAttribute('data-my-color');
  await expect(a.locator('[data-testid=scene-host] canvas')).toBeVisible();
  await expect(b.locator('[data-testid=scene-host] canvas')).toBeVisible();

  // Both players take turns until the match has clearly progressed.
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline && (await hud(a)).seq < 24) {
    const acted = (await act(a)) || (await act(b));
    if (!acted) await a.waitForTimeout(150);
  }
  const reached = (await hud(a)).seq;
  expect(reached).toBeGreaterThanOrEqual(24);
  await expect.poll(async () => (await hud(b)).seq, { timeout: 15_000 }).toBeGreaterThanOrEqual(reached);
  await expect
    .poll(async () => {
      const [x, y] = [await hud(a), await hud(b)];
      return x.seq === y.seq && x.horses === y.horses;
    }, { timeout: 15_000 })
    .toBe(true);

  // The guest saves an account from inside the room: same user, same seat.
  const guestId = ((await (await ctxB.request.get('/api/auth/me')).json()) as { user: { id: string; guest: boolean } }).user;
  expect(guestId.guest).toBe(true);
  const saved = await ctxB.request.post('/api/auth/signup', {
    headers: { Origin: new URL(roomUrl).origin },
    data: { email: email('b'), password: PASSWORD, displayName: `Khoi-smoke-b-${tag}` },
  });
  expect(saved.ok()).toBe(true);
  const after = ((await saved.json()) as { user: { id: string; guest: boolean } }).user;
  expect(after).toMatchObject({ id: guestId.id, guest: false });
  await b.reload();
  await expect(b.getByTestId('hud')).toBeVisible();
  expect(await b.getByTestId('hud').getAttribute('data-my-color')).toBe(colorB);

  // Leaving frees the room.
  for (const page of [a, b]) {
    await page.getByTestId('match-menu-button').click();
    await page.getByTestId('leave-room').click();
    await page.getByTestId('leave-confirm').click();
    await expect(page).toHaveURL(/\/$/);
  }
  await ctxA.close();
  await ctxB.close();
});

test('a CPU seat takes its turns on the deployed site', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByTestId('play-now').click();
  await enterAsGuest(page, `Khoi-smoke-c-${tag}`);
  await expect(page.getByTestId('greeting')).toContainText(`Khoi-smoke-c-${tag}`);
  await page.getByTestId('create-visibility-private').check();
  await page.getByTestId('create-seats').selectOption('2');
  await page.getByTestId('create-submit').click();
  await page.getByTestId('add-cpu-1').click();
  await expect(page.getByTestId('seat-1-name')).toContainText('Máy 1');
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('hud')).toBeVisible();

  // Play until the turn has gone to the CPU and come back at least twice: only the
  // server's own timer can have played those turns.
  const banner = page.getByTestId('turn-banner');
  let cpuTurns = 0;
  let onCpu = false;
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline && cpuTurns < 2) {
    const text = (await banner.textContent()) ?? '';
    if (text.includes('Máy 1')) onCpu = true;
    else if (onCpu) {
      onCpu = false;
      cpuTurns++;
    }
    if (!(await act(page))) await page.waitForTimeout(100);
  }
  expect(cpuTurns).toBeGreaterThanOrEqual(2);

  await page.getByTestId('match-menu-button').click();
  await page.getByTestId('leave-room').click();
  await page.getByTestId('leave-confirm').click();
  await expect(page).toHaveURL(/\/$/);
  await ctx.close();
});

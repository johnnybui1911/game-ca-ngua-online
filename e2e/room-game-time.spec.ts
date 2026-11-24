import { expect, test } from '@playwright/test';
import { createRoom, dismissQuickIntro, lastRawState, newPlayer, openRawSocket, rawSend, VIEWPORT } from './helpers/rooms';

test.setTimeout(90_000);

for (const quick of [false, true]) {
  test(`the game clock ends a ${quick ? 'quick' : 'classic'} game`, async ({ browser }) => {
    const host = await newPlayer(browser, 'Chủ Đồng Hồ', VIEWPORT);
    const guest = await newPlayer(browser, 'Khách Đồng Hồ', VIEWPORT);
    const code = await createRoom(host, { seats: 2 });
    await host.page.goto(`/r/${code}`);
    await guest.page.goto(`/r/${code}`);
    await expect(host.page.getByTestId('seat-1-name')).toContainText('Khách Đồng Hồ');
    if (quick) {
      await host.page.getByTestId('mode-quick').click();
      await expect(guest.page.getByTestId('mode-label')).toHaveText('Ván Nhanh');
    }
    const raw = await openRawSocket(host, code);
    await expect.poll(async () => (await lastRawState(raw))?.status).toBe('waiting');
    const seq = (await lastRawState(raw))!.seq;
    // Only the local fast-timer environment accepts this host-only override.
    await rawSend(raw, { t: 'testGameDuration', ms: 20_000 } as never);
    await expect.poll(async () => (await lastRawState(raw))?.seq).toBeGreaterThan(seq);
    await host.page.getByTestId('start-button').click();
    if (quick) await dismissQuickIntro(host.page);
    await expect(host.page.getByTestId('game-countdown')).toBeVisible();
    await expect(host.page.getByTestId('game-countdown')).toHaveClass(/is-low/);
    await expect(host.page.getByTestId('game-countdown')).toHaveAttribute('aria-label', /Thời gian ván còn lại \d\d:\d\d/);
    await expect(guest.page.getByTestId('turn-banner')).toHaveText('Lượt Chủ Đồng Hồ');
    await expect.poll(async () => (await lastRawState(raw))?.status, { timeout: 35_000 }).toBe('finished');
    expect((await lastRawState(raw))?.game?.timeWinReason).toBeDefined();
    await expect(host.page.getByTestId('win-dialog')).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByTestId('win-condition')).toContainText('Hết thời gian');
    await expect(guest.page.getByTestId('win-condition')).toContainText('Hết thời gian');
    await host.context.close();
    await guest.context.close();
  });
}

test('unlimited games do not show a game clock', async ({ browser }) => {
  const host = await newPlayer(browser, 'Chủ Vô Cực', VIEWPORT);
  const code = await createRoom(host, { seats: 2 });
  await host.page.goto(`/r/${code}`);
  await host.page.getByTestId('game-time-0').click();
  await host.page.getByTestId('add-cpu-1').click();
  await host.page.getByTestId('start-button').click();
  await expect(host.page.getByTestId('hud')).toBeVisible();
  await expect(host.page.getByTestId('game-countdown')).toHaveCount(0);
  await expect(host.page.getByTestId('turn-banner').locator('.turn-short')).toBeVisible();
  await expect(host.page.getByTestId('turn-banner').locator('.turn-full')).toBeHidden();
  await host.page.setViewportSize({ width: 1280, height: 800 });
  await expect(host.page.getByTestId('turn-banner').locator('.turn-full')).toHaveText('Lượt của bạn');
  await expect(host.page.getByTestId('turn-banner').locator('.turn-full')).toBeVisible();
  await host.context.close();
});

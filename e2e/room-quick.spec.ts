import { expect, test, type Page } from '@playwright/test';
import { CLASSIC_RULES, CLASSIC_MODE_SUMMARY, QUICK_DIFFERENCES, QUICK_MODE_SUMMARY, QUICK_WIN_TEXT } from '../shared/rules-text';
import {
  GAME_TIMEOUT,
  VIEWPORT,
  createRoom,
  dismissQuickIntro,
  newPlayer,
  openRawSocket,
  rawLog,
  startAutoPlayer,
  startTwoPlayerGame,
} from './helpers/rooms';

test.setTimeout(GAME_TIMEOUT + 60_000);

/** True when some state message carried a roll and a move of the same colour in one go. */
async function sawCombinedRollAndMove(page: Page): Promise<boolean> {
  return (await rawLog(page)).some(
    (m) =>
      m.t === 'state' &&
      m.events.some((r) => r.type === 'rolled' && m.events.some((e) => e.type === 'moved' && e.color === r.color)),
  );
}

test('the host sets the turn time and Ván nhanh; others see them read-only', async ({ browser }) => {
  const host = await newPlayer(browser, 'Chủ Cài Đặt', VIEWPORT);
  const guest = await newPlayer(browser, 'Khách Cài Đặt', VIEWPORT);
  const code = await createRoom(host, { seats: 3 });
  await host.page.goto(`/r/${code}`);
  await guest.page.goto(`/r/${code}`);
  await expect(host.page.getByTestId('seat-1-name')).toContainText('Khách Cài Đặt');

  // Defaults: 30 s, classic.
  await expect(host.page.getByTestId('turn-seconds')).toHaveValue('30');
  await expect(host.page.getByTestId('mode-basic')).toHaveAttribute('aria-checked', 'true');
  await expect(host.page.getByTestId('auto-roll-toggle')).not.toBeChecked();
  await expect(host.page.getByTestId('mode-summary')).toContainText(CLASSIC_MODE_SUMMARY);
  await expect(guest.page.getByTestId('turn-seconds')).toHaveText('30 giây');
  await expect(host.page.getByTestId('game-settings')).toContainText('Máy đổ giúp sau 1,5 giây.');

  // Turning quick on from 30 s preselects 20 s; the guest sees it live, read-only.
  await host.page.getByTestId('mode-quick').click();
  await expect(host.page.getByTestId('mode-quick')).toHaveAttribute('aria-checked', 'true');
  await expect(host.page.getByTestId('turn-seconds')).toHaveValue('20');
  await expect(host.page.getByTestId('mode-summary')).toContainText(QUICK_MODE_SUMMARY);
  await expect(guest.page.getByTestId('turn-seconds')).toHaveText('20 giây');
  await expect(guest.page.getByTestId('mode-label')).toHaveText('Ván Nhanh');
  await expect(guest.page.getByTestId('mode-quick')).toHaveCount(0);
  await expect(guest.page.getByTestId('auto-roll-toggle')).toBeDisabled();
  await expect(guest.page.getByTestId('mode-summary')).toContainText(QUICK_MODE_SUMMARY);
  await expect(guest.page.locator('select')).toHaveCount(0);

  // Another time is kept when quick goes off and on again; auto-roll is a separate switch.
  await host.page.getByTestId('turn-seconds').selectOption('60');
  await expect(guest.page.getByTestId('turn-seconds')).toHaveText('60 giây');
  await host.page.getByTestId('mode-basic').click();
  await expect(guest.page.getByTestId('mode-label')).toHaveText('Cơ Bản');
  await host.page.getByTestId('mode-quick').click();
  await expect(guest.page.getByTestId('mode-label')).toHaveText('Ván Nhanh');
  await expect(host.page.getByTestId('turn-seconds')).toHaveValue('60');
  // The host's settings changes share a budget of four in a burst, refilled at two a second.
  await host.page.waitForTimeout(1_500);
  await host.page.getByTestId('auto-roll-toggle').click();
  await expect(guest.page.getByTestId('auto-roll-toggle')).toBeChecked();

  // A reload shows the same values.
  await guest.page.reload();
  await expect(guest.page.getByTestId('turn-seconds')).toHaveText('60 giây');
  await expect(guest.page.getByTestId('mode-label')).toHaveText('Ván Nhanh');
  await host.context.close();
  await guest.context.close();
});

test('the rules sheet lists the quick differences first in a quick room, from the waiting room and the match', async ({ browser }) => {
  const host = await newPlayer(browser, 'Chủ Luật Nhanh', VIEWPORT);
  const code = await createRoom(host, { seats: 2 });
  await host.page.goto(`/r/${code}`);
  const sheet = host.page.getByTestId('rules-sheet');

  // Classic room: the classic rules, then the house rule a new room has on.
  await host.page.getByTestId('mode-rules').click();
  await expect(sheet.locator('h3')).toHaveText(['Luật cá ngựa', 'Luật thêm của phòng']);
  await expect(sheet.locator('li')).toHaveCount(CLASSIC_RULES.length + 1);
  await host.page.keyboard.press('Escape');

  await host.page.getByTestId('mode-quick').click();
  await expect(host.page.getByTestId('mode-quick')).toHaveAttribute('aria-checked', 'true');
  await host.page.getByTestId('mode-rules').click();
  await expect(sheet.locator('h3').first()).toHaveText('Ván nhanh khác ván thường');
  await expect(sheet.locator('li')).toHaveCount(QUICK_DIFFERENCES.length + CLASSIC_RULES.length + 1);
  await expect(sheet.locator('li').first()).toHaveText(QUICK_DIFFERENCES[0]!);
  await host.page.keyboard.press('Escape');
  await host.page.getByTestId('waiting-rules').click();
  await expect(sheet.locator('h3').first()).toHaveText('Ván nhanh khác ván thường');
  await host.page.keyboard.press('Escape');

  // In the match the "?" button and the Menu item show the same.
  await host.page.getByTestId('add-cpu-1').click();
  await host.page.getByTestId('start-button').click();
  await dismissQuickIntro(host.page);
  await host.page.getByTestId('rules-button').click();
  await expect(sheet.locator('h3').first()).toHaveText('Ván nhanh khác ván thường');
  await host.page.keyboard.press('Escape');
  await host.page.getByTestId('match-menu-button').click();
  // The waiting room's "Hoạt cảnh" choice is in the match menu too, stored for this browser.
  const menu = host.page.getByTestId('match-menu');
  await menu.getByTestId('motion-level-reduced').click();
  await expect(menu.getByTestId('motion-level')).toHaveAttribute('data-level', 'reduced');
  expect(await host.page.evaluate(() => localStorage.getItem('ca-ngua:motion'))).toBe('reduced');
  await host.page.getByTestId('menu-rules').click();
  await expect(sheet.locator('h3').first()).toHaveText('Ván nhanh khác ván thường');
  await host.context.close();
});

test('the first-match card appears once per device and the lock cues show in a quick match', async ({ browser }) => {
  const host = await newPlayer(browser, 'Người Xem Thẻ', VIEWPORT);
  const code = await createRoom(host, { seats: 2 });
  await host.page.goto(`/r/${code}`);
  await host.page.getByTestId('mode-quick').click();
  await expect(host.page.getByTestId('mode-quick')).toHaveAttribute('aria-checked', 'true');
  await host.page.getByTestId('add-cpu-1').click();
  await host.page.getByTestId('start-button').click();

  const card = host.page.getByTestId('quick-intro');
  await expect(card).toBeVisible();
  await expect(card.locator('li')).toHaveCount(3);
  await expect(host.page.getByTestId('quick-tag')).toHaveText('Ván nhanh');
  await dismissQuickIntro(host.page);
  await expect(host.page.getByTestId('roll-button')).toBeVisible({ timeout: 15_000 });

  // Every player tile shows its lock state; nobody has kicked yet.
  await expect(host.page.getByTestId('lock-0')).toContainText('Chưa mở chuồng');
  await expect(host.page.getByTestId('lock-2')).toContainText('Chưa mở chuồng');

  // Back on the same device the card does not return.
  await host.page.reload();
  await expect(host.page.getByTestId('hud')).toBeVisible();
  await expect(host.page.getByTestId('lock-0')).toBeVisible();
  await expect(host.page.getByTestId('quick-intro')).toHaveCount(0);
  await host.context.close();
});

test('a quick match with one human and three CPUs plays to the win dialog; settings survive the rematch', async ({ browser }) => {
  const host = await newPlayer(browser, 'Người Ván Nhanh', VIEWPORT);
  const code = await createRoom(host, { name: 'Ván nhanh một người', seats: 4 });
  await host.page.goto(`/r/${code}`);
  for (const seat of [1, 2, 3]) await host.page.getByTestId(`add-cpu-${seat}`).click();
  await expect(host.page.getByTestId('seat-3-name')).toHaveText('Máy 3');
  await host.page.getByTestId('mode-quick').click();
  await expect(host.page.getByTestId('mode-quick')).toHaveAttribute('aria-checked', 'true');
  await expect(host.page.getByTestId('turn-seconds')).toHaveValue('20');
  const observer = await openRawSocket(host, code);
  await host.page.getByTestId('start-button').click();

  await expect(host.page.getByTestId('hud')).toBeVisible();
  await dismissQuickIntro(host.page);
  await expect(host.page.getByTestId('quick-tag')).toBeVisible();
  for (const color of [0, 1, 2, 3]) await expect(host.page.getByTestId(`lock-${color}`)).toBeVisible();
  await startAutoPlayer(host.page);

  await expect(host.page.getByTestId('win-dialog')).toBeVisible({ timeout: GAME_TIMEOUT });
  await expect(host.page.getByTestId('win-title')).toHaveText(/ thắng!$/);
  await expect(host.page.getByTestId('win-condition')).toHaveText(QUICK_WIN_TEXT);
  expect(await sawCombinedRollAndMove(observer)).toBe(true);

  await host.page.getByTestId('rematch-button').click();
  await expect(host.page.getByTestId('start-button')).toBeEnabled();
  await expect(host.page.getByTestId('mode-quick')).toHaveAttribute('aria-checked', 'true');
  await expect(host.page.getByTestId('turn-seconds')).toHaveValue('20');
  await host.page.getByTestId('start-button').click();
  await expect(host.page.getByTestId('hud')).toBeVisible();
  await expect(host.page.getByTestId('quick-tag')).toBeVisible();
  // The card was already dismissed on this device.
  await expect(host.page.getByTestId('quick-intro')).toHaveCount(0);
  await host.context.close();
});

test('a player who misses two turns goes on autopilot, others see the tag, and coming back ends it', async ({ browser }) => {
  // 10 s per action is 4 s with the fast e2e timers (400 ms per turn-second), so two misses take about 8 s.
  const { a, b } = await startTwoPlayerGame(browser, ['Người Chơi Đều', 'Người Bỏ Lượt'], async (pa, pb) => {
    await pa.page.getByTestId('turn-seconds').selectOption('10');
    await expect(pa.page.getByTestId('turn-seconds')).toHaveValue('10');
    await expect(pb.page.getByTestId('turn-seconds')).toHaveText('10 giây');
  });
  await startAutoPlayer(a.page);

  // B never acts: the server plays for B, and after two misses B is on autopilot.
  await expect(b.page.getByTestId('autopilot-banner')).toBeVisible({ timeout: 45_000 });
  await expect(b.page.getByTestId('autopilot-banner')).toContainText('Đang chơi tự động vì bạn không thao tác.');
  await expect(a.page.getByTestId('auto-tag-2')).toHaveText('(tự động)');
  await expect(b.page.getByTestId('auto-tag-2')).toHaveCount(0);

  // B returns and plays; the banner and the tag go.
  await b.page.getByTestId('autopilot-back').click();
  await startAutoPlayer(b.page);
  await expect(b.page.getByTestId('autopilot-banner')).toBeHidden();
  await expect(a.page.getByTestId('auto-tag-2')).toHaveCount(0);
  await b.page.waitForTimeout(2000);
  await expect(b.page.getByTestId('autopilot-banner')).toHaveCount(0);
  await a.context.close();
  await b.context.close();
});

test('a normal match shows none of the quick match cues and plays no combined roll and move', async ({ browser }) => {
  const raw: Page[] = [];
  const { a, b } = await startTwoPlayerGame(browser, ['Người Thường Một', 'Người Thường Hai'], async (pa, _pb, room) => {
    raw.push(await openRawSocket(pa, room));
  });
  const observer = raw[0] as Page;
  await startAutoPlayer(a.page);
  await startAutoPlayer(b.page);
  await expect
    .poll(async () => Number(await a.page.getByTestId('hud').getAttribute('data-seq')), { timeout: 30_000 })
    .toBeGreaterThan(12);
  for (const page of [a.page, b.page]) {
    await expect(page.getByTestId('quick-tag')).toHaveCount(0);
    await expect(page.getByTestId('quick-intro')).toHaveCount(0);
    await expect(page.getByTestId('lock-0')).toHaveCount(0);
    await expect(page.getByTestId('autopilot-banner')).toHaveCount(0);
    await expect(page.getByTestId('need-kick-hint')).toHaveCount(0);
  }
  expect(await sawCombinedRollAndMove(observer)).toBe(false);
  await a.context.close();
  await b.context.close();
});

import { expect, test, type Page } from '@playwright/test';
import type { RoomClientMessage, RoomServerMessage } from '../shared/protocol';
import { ORIGIN, lastRawState, openRawSocket, rawLog, rawSend, startTwoPlayerGame } from './helpers/rooms';

/** The first error the server sends after `msg`, whatever state messages are interleaved. */
async function errorAfter(p: Page, msg: RoomClientMessage) {
  const before = (await rawLog(p)).length;
  await rawSend(p, msg);
  let found: Extract<RoomServerMessage, { t: 'error' }> | undefined;
  await expect
    .poll(async () => {
      found = (await rawLog(p)).slice(before).find((m) => m.t === 'error');
      return found !== undefined;
    }, { timeout: 5000 })
    .toBe(true);
  return found;
}

test('a player names their horses in the waiting room and everyone sees the names on the board', async ({ browser }) => {
  const { a, b } = await startTwoPlayerGame(browser, ['Người Đặt Tên', 'Người Xem'], async (pa, pb, code) => {
    await pa.page.getByTestId('rename-horses').click();
    await pa.page.getByTestId('horse-name-0').fill('Xích Thố');
    await pa.page.getByTestId('horse-name-2').fill('  Ô Truy  ');
    await pa.page.getByTestId('horse-names-save').click();
    await expect(pb.page.getByTestId('seat-0-horses')).toHaveText('Quân: Xích Thố · 2 · Ô Truy · 4');
    // Only the player's own seat offers renaming.
    await expect(pb.page.getByTestId('rename-horses')).toHaveCount(1);
    const raw = await openRawSocket(pa, code);
    expect(await errorAfter(raw, { t: 'horseNames', names: ['x'.repeat(13), '', '', ''] })).toMatchObject({ code: 'bad_name' });
  });

  for (const page of [a.page, b.page]) {
    await expect(page.getByTestId('horse-label-0-0')).toHaveText('Xích Thố');
    await expect(page.getByTestId('horse-label-0-0')).toBeVisible();
    await expect(page.getByTestId('horse-label-0-1')).toHaveText('2');
    await expect(page.getByTestId('horse-label-0-2')).toHaveText('Ô Truy');
    await expect(page.getByTestId('horse-label-2-3')).toHaveText('4');
  }

  // Renaming mid-game from the menu updates the other player's board.
  await b.page.getByTestId('match-menu-button').click();
  await b.page.getByTestId('rename-horses').click();
  await b.page.getByTestId('horse-name-3').fill('Đích Lư');
  await b.page.getByTestId('horse-names-save').click();
  await expect(a.page.getByTestId('horse-label-2-3')).toHaveText('Đích Lư');
  await a.context.close();
  await b.context.close();
});

test('the host pauses and resumes a game; nobody can play while it is paused', async ({ browser }) => {
  const raw: Page[] = [];
  const { a, b } = await startTwoPlayerGame(browser, ['Chủ Phòng', 'Khách Mời'], async (pa, pb, code) => {
    // The longest turn: the server must not roll for the host before this test does, however slow the browser is.
    await pa.page.getByTestId('turn-seconds').selectOption('60');
    await expect(pb.page.getByTestId('turn-seconds')).toHaveText('60 giây');
    raw.push(await openRawSocket(pa, code), await openRawSocket(pb, code));
  });
  const [rawA, rawB] = raw as [Page, Page];
  await expect(a.page.getByTestId('roll-button')).toBeVisible();
  await expect(a.page.getByTestId('countdown')).toBeVisible();

  expect(await errorAfter(rawB, { t: 'pause' })).toMatchObject({ code: 'not_host' });

  await a.page.getByTestId('match-menu-button').click();
  await a.page.getByTestId('pause-button').click();
  await expect(b.page.getByTestId('pause-banner')).toBeVisible();
  await expect(b.page.getByTestId('resume-button')).toHaveCount(0);
  await expect(a.page.getByTestId('turn-banner')).toHaveText('Ván đấu đang tạm dừng');
  await expect(a.page.getByTestId('roll-button')).toHaveCount(0);
  await expect(a.page.getByTestId('countdown')).toHaveCount(0);
  expect(await errorAfter(rawA, { t: 'roll' })).toMatchObject({ code: 'paused' });
  const pausedState = await lastRawState(rawB);
  expect(pausedState?.paused).toBe(true);
  expect(pausedState?.turnDeadline).toBeNull();

  await a.page.getByTestId('resume-button').click();
  await expect(b.page.getByTestId('pause-banner')).toHaveCount(0);
  await expect(a.page.getByTestId('roll-button')).toBeVisible();
  await expect(a.page.getByTestId('countdown')).toBeVisible();
  await a.page.getByTestId('roll-button').click();
  await expect(a.page.getByTestId('dice-value')).not.toHaveText('–');
  await a.context.close();
  await b.context.close();
});

test('the host closes a running room and everyone is sent out', async ({ browser }) => {
  const raw: Page[] = [];
  const { a, b, code } = await startTwoPlayerGame(browser, ['Chủ Đóng', 'Người Ở Lại'], async (_pa, pb, room) => {
    raw.push(await openRawSocket(pb, room));
  });
  expect(await errorAfter(raw[0] as Page, { t: 'closeRoom' })).toMatchObject({ code: 'not_host' });

  await a.page.getByTestId('match-menu-button').click();
  await a.page.getByTestId('leave-room').click();
  await a.page.getByTestId('host-leave-close').click();
  await expect(a.page).toHaveURL(`${ORIGIN}/`);
  await expect(b.page.getByTestId('room-error')).toHaveAttribute('data-code', 'closed_by_host');
  await expect(b.page.getByTestId('room-error')).toHaveText('Chủ phòng đã đóng phòng.');
  await expect.poll(async () => (await a.context.request.get(`/api/rooms/${code}`)).status()).toBe(404);
  await a.context.close();
  await b.context.close();
});

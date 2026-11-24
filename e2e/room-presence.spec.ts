import { expect, test, type Page } from '@playwright/test';
import {
  GAME_TIMEOUT,
  createRoom,
  horsesOf,
  lastRawState,
  newPlayer,
  openRawSocket,
  rawCloses,
  rawLog,
  rawSend,
  startAutoPlayer,
  startTwoPlayerGame,
} from './helpers/rooms';

test.setTimeout(GAME_TIMEOUT + 60_000);

test('a CPU plays on for a player who dropped mid-game while the other human stays', async ({ browser }) => {
  const { a, b } = await startTwoPlayerGame(browser, ['Người Ở Lại', 'Người Rớt Mạng']);
  await startAutoPlayer(a.page);
  await b.context.close();

  await expect(a.page.getByTestId('hud-player-2')).toContainText('Offline');
  await expect(a.page.getByTestId('hud-player-2')).not.toContainText('CPU');
  const before = await horsesOf(a.page, 2);
  await expect.poll(() => horsesOf(a.page, 2), { timeout: 90_000, intervals: [500] }).not.toBe(before);
  // The seat is still the absent player's, not a CPU's.
  await expect(a.page.getByTestId('hud-player-2')).toContainText('Offline');
  await a.context.close();
});

test('leaving mid-game turns the seat into a CPU that keeps playing', async ({ browser }) => {
  const { a, b } = await startTwoPlayerGame(browser, ['Người Ở Lại', 'Người Rời Đi']);
  await startAutoPlayer(a.page);
  await b.page.getByTestId('leave-room').click();
  await b.page.getByTestId('leave-confirm').click();
  await expect(b.page).toHaveURL('/');

  await expect(a.page.getByTestId('hud-player-2')).toContainText('Máy ·');
  await expect(a.page.getByTestId('hud-player-2')).not.toContainText('Offline');
  const before = await horsesOf(a.page, 2);
  await expect.poll(() => horsesOf(a.page, 2), { timeout: 60_000, intervals: [500] }).not.toBe(before);
  await a.context.close();
  await b.context.close();
});

test('when the host leaves a waiting room the next player becomes host', async ({ browser }) => {
  const host = await newPlayer(browser, 'Chủ Cũ');
  const guest = await newPlayer(browser, 'Chủ Mới');
  const code = await createRoom(host, { seats: 3 });
  await host.page.goto(`/r/${code}`);
  await guest.page.goto(`/r/${code}`);
  await expect(guest.page.getByTestId('seat-1-name')).toContainText('Chủ Mới (bạn)');
  await expect(guest.page.getByTestId('await-host')).toBeVisible();
  await expect(guest.page.getByTestId('start-button')).toHaveCount(0);

  await host.page.getByTestId('leave-room').click();
  // With someone else in the room the host chooses: hand the room over, or end it for everyone.
  await expect(host.page.getByTestId('host-leave-dialog')).toBeVisible();
  await host.page.getByTestId(`host-leave-heir-${guest.id}`).check();
  await host.page.getByTestId('host-leave-handover').click();
  await expect(host.page).toHaveURL('/');
  await expect(guest.page.getByTestId('seat-0-name')).toHaveText('Chỗ trống');
  await expect(guest.page.getByTestId('start-button')).toBeVisible();
  await expect(guest.page.getByTestId('await-host')).toHaveCount(0);
  await guest.page.getByTestId('add-cpu-0').click();
  await expect(guest.page.getByTestId('seat-0-name')).toHaveText('Máy 1');
  await host.context.close();
  await guest.context.close();
});

test('a finished game can be rematched after the host dropped: the remaining player takes over as host', async ({ browser }) => {
  const { a, b } = await startTwoPlayerGame(browser, ['Chủ Rớt Mạng', 'Người Còn Lại']);
  await startAutoPlayer(b.page);
  await a.context.close();

  await expect(b.page.getByTestId('win-dialog')).toBeVisible({ timeout: GAME_TIMEOUT });
  // The dropped host holds the room only for the disconnect grace; then the connected human can rematch.
  await expect(b.page.getByTestId('rematch-button')).toBeVisible({ timeout: 30_000 });
  await b.page.getByTestId('rematch-button').click();
  await expect(b.page.getByTestId('room-name')).toBeVisible();
  await expect(b.page.getByTestId('seat-1-name')).toContainText('Người Còn Lại (bạn)');
  await b.context.close();
});

test('a refused outsider causes no state change or broadcast', async ({ browser }) => {
  const a = await newPlayer(browser, 'Chủ Phòng Đầy');
  const b = await newPlayer(browser, 'Khách Phòng Đầy');
  const outsider = await newPlayer(browser, 'Người Lạ');
  const code = await createRoom(a, { seats: 2 });
  const rawA = await openRawSocket(a, code);
  await openRawSocket(b, code);
  await expect.poll(async () => (await lastRawState(rawA))?.seats[1]?.occupant?.kind).toBe('human');
  await expect
    .poll(async () => {
      const seat = (await lastRawState(rawA))?.seats[1]?.occupant;
      return seat?.kind === 'human' && seat.connected;
    })
    .toBe(true);
  const settled = await lastRawState(rawA);
  const count = (await rawLog(rawA)).length;

  for (let i = 0; i < 3; i++) {
    const raw = await openRawSocket(outsider, code);
    await expect.poll(() => rawCloses(raw), { timeout: 5000 }).toEqual([4002]);
    expect(await rawLog(raw)).toMatchObject([{ t: 'error', code: 'room_full' }]);
  }
  await rawA.waitForTimeout(500);
  expect(await rawLog(rawA)).toHaveLength(count);
  expect((await lastRawState(rawA))?.seq).toBe(settled?.seq);
  await a.context.close();
  await b.context.close();
  await outsider.context.close();
});

test('a fifth tab on the same room closes the oldest one with a clear message', async ({ browser }) => {
  const p = await newPlayer(browser, 'Nhiều Tab');
  const code = await createRoom(p, { seats: 2 });
  const pages: Page[] = [];
  for (let i = 0; i < 5; i++) {
    const page = i === 0 ? p.page : await p.context.newPage();
    await page.goto(`/r/${code}`);
    await expect(page.getByTestId('seat-0-name')).toContainText('Nhiều Tab');
    pages.push(page);
  }
  await expect(pages[0]!.getByTestId('room-error')).toHaveAttribute('data-code', 'too_many_connections');
  for (const page of pages.slice(1)) await expect(page.getByTestId('seat-0-name')).toBeVisible();
  await p.context.close();
});

test('a message flood closes the socket, ordinary traffic does not', async ({ browser }) => {
  const p = await newPlayer(browser, 'Gửi Dồn');
  const code = await createRoom(p, { seats: 2 });
  const raw = await openRawSocket(p, code);
  for (let i = 0; i < 20; i++) await rawSend(raw, { t: 'roll' });
  await raw.waitForTimeout(300);
  expect(await rawCloses(raw)).toEqual([]);
  await raw.evaluate(() => {
    const ws = (window as unknown as { __ws: WebSocket }).__ws;
    for (let i = 0; i < 400; i++) ws.send(JSON.stringify({ t: 'roll' }));
  });
  await expect.poll(() => rawCloses(raw), { timeout: 5000 }).toEqual([4005]);
  expect(await rawLog(raw)).toContainEqual(expect.objectContaining({ t: 'error', code: 'rate_limited' }));
  await p.context.close();
});

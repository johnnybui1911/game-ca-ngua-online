import { expect, test, type Page } from '@playwright/test';
import type { RoomClientMessage, RoomServerMessage } from '../shared/protocol';
import { VIEWPORT, createRoom, horsesOf, newPlayer, openRawSocket, rawLog, rawSend, startAutoPlayer, startTwoPlayerGame } from './helpers/rooms';

/** The first error the server sends after `msg`. */
async function errorAfter(page: Page, msg: RoomClientMessage) {
  const before = (await rawLog(page)).length;
  await rawSend(page, msg);
  let found: Extract<RoomServerMessage, { t: 'error' }> | undefined;
  await expect
    .poll(async () => {
      found = (await rawLog(page)).slice(before).find((m) => m.t === 'error');
      return found !== undefined;
    }, { timeout: 5000 })
    .toBe(true);
  return found;
}

test('the host picks the CPU level, the guest sees it live and after a reload', async ({ browser }) => {
  const host = await newPlayer(browser, 'Chủ Độ Khó');
  const guest = await newPlayer(browser, 'Khách Độ Khó');
  const code = await createRoom(host, { seats: 3 });
  await host.page.goto(`/r/${code}`);
  await guest.page.goto(`/r/${code}`);
  await expect(host.page.getByTestId('seat-1-name')).toContainText('Khách Độ Khó');

  // Default Thường: the host gets three radios, the guest a read-only line.
  const group = host.page.getByRole('radiogroup', { name: 'Độ khó máy' });
  await expect(group.getByRole('radio')).toHaveCount(3);
  await expect(host.page.getByTestId('cpu-level-normal')).toHaveAttribute('aria-checked', 'true');
  await expect(host.page.getByTestId('cpu-level-easy')).toHaveAttribute('aria-checked', 'false');
  await expect(host.page.getByTestId('cpu-level-hard')).toHaveText('Khó');
  await expect(guest.page.getByTestId('cpu-level-label')).toHaveText('Thường');
  await expect(guest.page.getByRole('radio')).toHaveCount(0);

  await host.page.getByTestId('cpu-level-hard').click();
  await expect(host.page.getByTestId('cpu-level-hard')).toHaveAttribute('aria-checked', 'true');
  await expect(host.page.getByTestId('cpu-level-normal')).toHaveAttribute('aria-checked', 'false');
  await expect(guest.page.getByTestId('cpu-level-label')).toHaveText('Khó');

  await guest.page.reload();
  await expect(guest.page.getByTestId('cpu-level-label')).toHaveText('Khó');

  await host.page.getByTestId('add-cpu-2').click();
  await expect(host.page.getByTestId('seat-2-state')).toHaveText('Máy · Khó');
  await expect(guest.page.getByTestId('seat-2-state')).toHaveText('Máy · Khó');

  await host.page.getByTestId('cpu-level-easy').click();
  await expect(host.page.getByTestId('seat-2-state')).toHaveText('Máy · Dễ');
  await host.context.close();
  await guest.context.close();
});

test('the server rejects a level from a non-host, an unknown level, and a change after the start', async ({ browser }) => {
  const raw: Page[] = [];
  const { a, b } = await startTwoPlayerGame(browser, ['Chủ Máy Khó', 'Khách Máy Khó'], async (pa, pb, room) => {
    raw.push(await openRawSocket(pa, room), await openRawSocket(pb, room));
  });
  const [rawHost, rawGuest] = raw as [Page, Page];
  expect(await errorAfter(rawGuest, { t: 'cpuLevel', level: 'hard' })).toMatchObject({ code: 'not_host' });
  expect(await errorAfter(rawHost, { t: 'cpuLevel', level: 'ultra' } as unknown as RoomClientMessage)).toMatchObject({ code: 'bad_message' });
  expect(await errorAfter(rawHost, { t: 'cpuLevel', level: 'hard' })).toMatchObject({ code: 'bad_state' });
  await a.context.close();
  await b.context.close();
});

test('a solo match against a Hard CPU shows the level in the HUD and the CPU plays', async ({ browser }) => {
  const host = await newPlayer(browser, 'Người Chơi Khó', VIEWPORT);
  const code = await createRoom(host, { name: 'Một người một máy', seats: 2 });
  await host.page.goto(`/r/${code}`);
  await host.page.getByTestId('cpu-level-hard').click();
  await expect(host.page.getByTestId('cpu-level-hard')).toHaveAttribute('aria-checked', 'true');
  await host.page.getByTestId('add-cpu-1').click();
  await expect(host.page.getByTestId('seat-1-state')).toHaveText('Máy · Khó');
  await host.page.getByTestId('start-button').click();

  await expect(host.page.getByTestId('hud')).toBeVisible();
  await expect(host.page.getByTestId('hud-player-2')).toContainText('Máy · Khó');
  await startAutoPlayer(host.page);
  // The CPU's horses move without any input from the page.
  const before = await horsesOf(host.page, 2);
  await expect.poll(() => horsesOf(host.page, 2), { timeout: 60_000, intervals: [500] }).not.toBe(before);
  await host.context.close();
});

test('a seat vacated mid-game is taken over by a CPU at the room level', async ({ browser }) => {
  const { a, b } = await startTwoPlayerGame(browser, ['Người Ở Lại', 'Người Rời Đi'], async (pa) => {
    await pa.page.getByTestId('cpu-level-hard').click();
    await expect(pa.page.getByTestId('cpu-level-hard')).toHaveAttribute('aria-checked', 'true');
  });
  await startAutoPlayer(a.page);
  await b.page.getByTestId('match-menu-button').click();
  await b.page.getByTestId('leave-room').click();
  await b.page.getByTestId('leave-confirm').click();
  await expect(b.page).toHaveURL('/');
  await expect(a.page.getByTestId('hud-player-2')).toContainText('Máy · Khó');
  await a.context.close();
  await b.context.close();
});

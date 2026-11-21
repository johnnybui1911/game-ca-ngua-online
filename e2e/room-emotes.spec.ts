import { expect, test, type Page } from '@playwright/test';
import type { EmoteId } from '../shared/emotes';
import type { RoomServerMessage } from '../shared/protocol';
import {
  createRoom,
  lastRawState,
  newPlayer,
  openRawSocket,
  rawCloses,
  rawLog,
  rawSend,
  startAutoPlayer,
  startTwoPlayerGame,
  type Player,
} from './helpers/rooms';

type EmoteMsg = Extract<RoomServerMessage, { t: 'emote' }>;

const emotesIn = async (p: Page): Promise<EmoteMsg[]> => (await rawLog(p)).filter((m): m is EmoteMsg => m.t === 'emote');

async function pick(page: Page, id: EmoteId) {
  await page.getByTestId('emote-open').click();
  await page.getByTestId(`emote-${id}`).click();
}

/** Two players in a waiting room, both on the room page. */
async function waitingRoom(browser: Parameters<typeof newPlayer>[0], names: [string, string]) {
  const a = await newPlayer(browser, names[0]);
  const b = await newPlayer(browser, names[1]);
  const code = await createRoom(a, { seats: 2 });
  await a.page.goto(`/r/${code}`);
  await b.page.goto(`/r/${code}`);
  await expect(a.page.getByTestId('seat-1-name')).toContainText(names[1]);
  await expect(b.page.getByTestId('seat-0-name')).toContainText(names[0]);
  return { a, b, code };
}

/** A raw socket for each of two seated users in a room. */
async function rawPair(a: Player, b: Player, code: string) {
  const ra = await openRawSocket(a, code);
  const rb = await openRawSocket(b, code);
  await expect.poll(async () => (await lastRawState(rb))?.seats.filter((s) => s.occupant).length).toBe(2);
  await expect.poll(async () => (await lastRawState(ra))?.seats.filter((s) => s.occupant).length).toBe(2);
  return { ra, rb };
}

test('an emote shows as a bubble on the sender seat for everyone, then goes away', async ({ browser }) => {
  const { a, b } = await waitingRoom(browser, ['Người Gửi', 'Người Nhận']);
  await pick(a.page, 'taunt');
  for (const p of [a, b]) {
    await expect(p.page.getByTestId('emote-bubble-0')).toContainText('Đá nè!');
    await expect(p.page.getByTestId('seat-0').getByTestId('emote-bubble-0')).toHaveAttribute('aria-hidden', 'true');
  }
  await expect(b.page.getByTestId('emote-live')).toHaveText('Người Gửi: 😈 Đá nè!');
  for (const p of [a, b]) await expect(p.page.getByTestId('emote-bubble-0')).toHaveCount(0, { timeout: 6000 });
  await expect(b.page.getByTestId('emote-live')).toHaveText('', { timeout: 6000 });
  await a.context.close();
  await b.context.close();
});

test('the picker locks right after a tap and unlocks again', async ({ browser }) => {
  const { a, b } = await waitingRoom(browser, ['Người Bấm', 'Người Xem']);
  await pick(a.page, 'nice');
  await expect(a.page.getByTestId('emote-open')).toBeDisabled();
  await expect(a.page.getByTestId('emote-open')).toBeEnabled({ timeout: 5000 });
  await a.context.close();
  await b.context.close();
});

test('emotes work during a match, on the sender hud tile, without blocking play', async ({ browser }) => {
  const { a, b } = await startTwoPlayerGame(browser, ['Người Xem', 'Người Giục']);
  const bColor = await b.page.getByTestId('hud').getAttribute('data-my-color');
  await pick(b.page, 'hurry');
  await expect(a.page.getByTestId(`hud-player-${bColor}`).getByTestId('emote-bubble-1')).toContainText('Nhanh lên');
  await expect(b.page.getByTestId(`hud-player-${bColor}`).getByTestId('emote-bubble-1')).toContainText('Nhanh lên');
  // A probe with the bubble class, since the real bubble may expire before it can be inspected.
  const pointerEvents = await a.page.evaluate(() => {
    const probe = document.createElement('span');
    probe.className = 'emote-bubble';
    document.body.append(probe);
    const value = getComputedStyle(probe).pointerEvents;
    probe.remove();
    return value;
  });
  expect(pointerEvents).toBe('none');
  // The board is still playable.
  await startAutoPlayer(a.page);
  await startAutoPlayer(b.page);
  await expect(a.page.getByTestId('dice-value')).not.toHaveText('–', { timeout: 30_000 });
  await a.context.close();
  await b.context.close();
});

test('emotes are allowed while the game is paused', async ({ browser }) => {
  const { a, b } = await startTwoPlayerGame(browser, ['Chủ Phòng', 'Khách']);
  await a.page.getByTestId('match-menu-button').click();
  await a.page.getByTestId('pause-button').click();
  await expect(b.page.getByTestId('pause-banner')).toBeVisible();
  await pick(b.page, 'sorry');
  await expect(a.page.getByTestId('emote-bubble-1')).toContainText('Xin lỗi nha');
  await expect(b.page.getByTestId('emote-bubble-1')).toContainText('Xin lỗi nha');
  await a.context.close();
  await b.context.close();
});

test('an emote is relayed with seat and id only and changes no room state', async ({ browser }) => {
  const { a, b, code } = await waitingRoom(browser, ['Người Một', 'Người Hai']);
  const { ra, rb } = await rawPair(a, b, code);
  const seqBefore = (await lastRawState(ra))?.seq;
  const countBefore = (await rawLog(ra)).length;

  await rawSend(rb, { t: 'emote', id: 'nice', text: 'tự do' } as never);
  await expect.poll(async () => (await emotesIn(ra)).length).toBe(1);
  await expect.poll(async () => (await emotesIn(rb)).length).toBe(1);
  expect((await emotesIn(ra))[0]).toEqual({ t: 'emote', seat: 1, id: 'nice' });
  await a.page.waitForTimeout(500);

  const after = (await rawLog(ra)).slice(countBefore);
  expect(after.map((m) => m.t)).toEqual(['emote']);
  expect((await lastRawState(ra))?.seq).toBe(seqBefore);
  await a.context.close();
  await b.context.close();
});

test('a reloaded page does not replay earlier emotes', async ({ browser }) => {
  const { a, b } = await waitingRoom(browser, ['Người Gửi', 'Người Tải Lại']);
  await pick(a.page, 'mercy');
  await expect(b.page.getByTestId('emote-bubble-0')).toBeVisible();
  await b.page.reload();
  await expect(b.page.getByTestId('seat-list')).toBeVisible();
  await expect(b.page.getByTestId('seat-0-name')).toContainText('Người Gửi');
  await expect(b.page.getByTestId('emote-live')).toHaveText('');
  await expect(b.page.locator('[data-testid^=emote-bubble-]')).toHaveCount(0);
  await a.context.close();
  await b.context.close();
});

test('a flood is dropped silently after the burst and refills over time', async ({ browser }) => {
  const { a, b, code } = await waitingRoom(browser, ['Người Dồn', 'Người Nhận']);
  const { ra, rb } = await rawPair(a, b, code);
  await ra.evaluate(() => {
    const ws = (window as unknown as { __ws: WebSocket }).__ws;
    for (let i = 0; i < 10; i++) ws.send(JSON.stringify({ t: 'emote', id: 'laugh' }));
  });
  await expect.poll(async () => (await emotesIn(rb)).length).toBe(3);
  await a.page.waitForTimeout(1000);
  expect(await emotesIn(rb)).toHaveLength(3);
  expect(await rawCloses(ra)).toEqual([]);
  expect((await rawLog(ra)).filter((m) => m.t === 'error')).toEqual([]);

  await a.page.waitForTimeout(1500);
  await rawSend(ra, { t: 'emote', id: 'laugh' });
  await expect.poll(async () => (await emotesIn(rb)).length).toBe(4);
  await a.context.close();
  await b.context.close();
});

test('an unknown emote id is rejected and not relayed', async ({ browser }) => {
  const { a, b, code } = await waitingRoom(browser, ['Người Sai', 'Người Nhận']);
  const { ra, rb } = await rawPair(a, b, code);
  await rawSend(ra, { t: 'emote', id: 'nope' } as never);
  await expect
    .poll(async () => (await rawLog(ra)).find((m) => m.t === 'error'))
    .toMatchObject({ t: 'error', code: 'bad_emote', message: 'Biểu cảm không hợp lệ.' });
  await a.page.waitForTimeout(500);
  expect(await emotesIn(rb)).toEqual([]);
  expect(await emotesIn(ra)).toEqual([]);
  await a.context.close();
  await b.context.close();
});

test('hiding emotes removes others bubbles but keeps your own, and survives a reload', async ({ browser }) => {
  const { a, b } = await waitingRoom(browser, ['Người Gửi', 'Người Ẩn']);
  await b.page.getByTestId('emote-open').click();
  await b.page.getByTestId('emote-mute').check();
  await b.page.getByTestId('emote-open').click();

  await pick(a.page, 'taunt');
  await expect(a.page.getByTestId('emote-bubble-0')).toBeVisible();
  await b.page.waitForTimeout(500);
  await expect(b.page.getByTestId('emote-bubble-0')).toHaveCount(0);
  await expect(b.page.getByTestId('emote-live')).toHaveText('');

  await pick(b.page, 'laugh');
  await expect(b.page.getByTestId('emote-bubble-1')).toBeVisible();
  await expect(a.page.getByTestId('emote-bubble-1')).toBeVisible();

  await b.page.reload();
  await expect(b.page.getByTestId('seat-list')).toBeVisible();
  await expect(b.page.getByTestId('emote-open')).toBeEnabled();
  await b.page.getByTestId('emote-open').click();
  await expect(b.page.getByTestId('emote-mute')).toBeChecked();
  await a.context.close();
  await b.context.close();
});

test('someone without a seat cannot send emotes', async ({ browser }) => {
  const { a, b, code } = await startTwoPlayerGame(browser, ['Người Một', 'Người Hai']);
  const { ra } = await rawPair(a, b, code);
  const outsider = await newPlayer(browser, 'Người Ngoài');
  const ro = await openRawSocket(outsider, code);
  await expect.poll(async () => (await rawLog(ro)).find((m) => m.t === 'error')).toMatchObject({ code: 'game_in_progress' });
  await expect.poll(() => rawCloses(ro)).not.toEqual([]);
  await rawSend(ro, { t: 'emote', id: 'taunt' }).catch(() => undefined);
  await a.page.waitForTimeout(500);
  expect(await emotesIn(ra)).toEqual([]);
  await a.context.close();
  await b.context.close();
  await outsider.context.close();
});

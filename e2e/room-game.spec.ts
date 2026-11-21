import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../shared/game/types';
import type { RoomClientMessage, RoomServerMessage } from '../shared/protocol';
import {
  GAME_TIMEOUT,
  VIEWPORT,
  createRoom,
  newPlayer,
  openRawSocket,
  rawLog,
  rawSend,
  startAutoPlayer,
  startTwoPlayerGame,
} from './helpers/rooms';

test.setTimeout(GAME_TIMEOUT + 60_000);

test('one human and three CPUs play a full game to the win dialog', async ({ browser }) => {
  const host = await newPlayer(browser, 'Người Chơi Một', VIEWPORT);
  const code = await createRoom(host, { name: 'Một người ba máy', seats: 4 });
  await host.page.goto(`/r/${code}`);
  for (const seat of [1, 2, 3]) await host.page.getByTestId(`add-cpu-${seat}`).click();
  await expect(host.page.getByTestId('seat-3-name')).toHaveText('Máy 3');
  await host.page.getByTestId('start-button').click();

  await expect(host.page.getByTestId('hud')).toBeVisible();
  await expect(host.page.getByTestId('hud-player-1')).toContainText('CPU');
  await startAutoPlayer(host.page);
  await expect(host.page.getByTestId('win-dialog')).toBeVisible({ timeout: GAME_TIMEOUT });
  await expect(host.page.getByTestId('win-title')).toHaveText(/ thắng!$/);
  await expect(host.page.getByTestId('rematch-button')).toBeVisible();
  await expect(host.page.getByTestId('to-lobby')).toBeVisible();

  // Rematch returns everyone to the waiting view with the same seats.
  await host.page.getByTestId('rematch-button').click();
  await expect(host.page.getByTestId('start-button')).toBeEnabled();
  await expect(host.page.getByTestId('seat-0-name')).toContainText('Người Chơi Một');
  await expect(host.page.getByTestId('seat-3-name')).toHaveText('Máy 3');
  await host.context.close();
});

test('two humans play a full game and both see the same winner', async ({ browser }) => {
  const { a, b } = await startTwoPlayerGame(browser, ['Người Một', 'Người Hai']);
  await startAutoPlayer(a.page);
  await startAutoPlayer(b.page);
  await expect(a.page.getByTestId('win-dialog')).toBeVisible({ timeout: GAME_TIMEOUT });
  await expect(b.page.getByTestId('win-dialog')).toBeVisible({ timeout: 30_000 });
  const winner = await a.page.getByTestId('win-title').textContent();
  expect(winner).toMatch(/^(Người Một|Người Hai) thắng!$/);
  await expect(b.page.getByTestId('win-title')).toHaveText(winner ?? '');
  await expect(a.page.getByTestId('rematch-button')).toBeVisible();
  await expect(b.page.getByTestId('await-host')).toHaveText('Chờ chủ phòng');
  // Registered players are never offered to save an account.
  await expect(a.page.getByTestId('save-account')).toHaveCount(0);
  await expect(b.page.getByTestId('save-account')).toHaveCount(0);
  await a.context.close();
  await b.context.close();
});

test('reload mid-game returns to the same seat and board; outsiders see the in-progress message', async ({ browser }) => {
  const { a, b, code } = await startTwoPlayerGame(browser, ['Người Tải Lại', 'Người Kia']);
  await startAutoPlayer(a.page);
  await startAutoPlayer(b.page);
  await expect
    .poll(async () => Number(await b.page.getByTestId('hud').getAttribute('data-seq')), { timeout: 30_000 })
    .toBeGreaterThan(8);

  const read = (page: Page) =>
    page.getByTestId('hud').evaluate((el) => ({
      seq: Number(el.getAttribute('data-seq')),
      color: el.getAttribute('data-my-color'),
      horses: el.getAttribute('data-horses'),
    }));

  // B keeps playing while A reloads. After the reload A must come back to its own seat and, at any
  // sequence number it shares with B, show exactly the board B shows.
  const seqBeforeReload = (await read(a.page)).seq;
  await a.page.reload();
  await expect(a.page.getByTestId('hud')).toBeVisible();
  const afterReload = await read(a.page);
  expect(afterReload.color).toBe('0');
  expect(afterReload.seq).toBeGreaterThanOrEqual(seqBeforeReload);
  expect(JSON.parse(afterReload.horses ?? 'null')).not.toBeNull();

  let compared = 0;
  const mismatches: unknown[] = [];
  await expect
    .poll(
      async () => {
        const [x, y] = [await read(a.page), await read(b.page)];
        if (x.seq !== y.seq) return false;
        if (x.horses !== y.horses) mismatches.push({ seq: x.seq, a: x.horses, b: y.horses });
        compared += 1;
        return compared >= 3;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  expect(mismatches).toEqual([]);

  const outsider = await newPlayer(browser, 'Người Ngoài');
  await outsider.page.goto(`/r/${code}`);
  await expect(outsider.page.getByTestId('room-error')).toHaveText(/Ván đấu đang diễn ra/);
  await expect(outsider.page.getByTestId('room-error')).toHaveAttribute('data-code', 'game_in_progress');
  await outsider.context.close();
  await a.context.close();
  await b.context.close();
});

test('out-of-turn roll and illegal moves answer an error and leave the snapshot unchanged', async ({ browser }) => {
  // The raw sockets are open before the game starts, so the opening checks fit well inside the first turn's clock.
  const raw: Page[] = [];
  const { a, b } = await startTwoPlayerGame(browser, ['Người Đầu', 'Người Sau'], async (pa, pb, room) => {
    raw.push(await openRawSocket(pa, room), await openRawSocket(pb, room));
  });
  const [rawA, rawB] = raw as [Page, Page];
  const bySeat: Record<string, Page> = { '0': rawA, '1': rawB };

  const lastState = async (p: Page) => {
    const msgs = await rawLog(p);
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m?.t === 'state') return m.room;
    }
    return null;
  };

  /** The first error the server sends after `msg`, whatever state messages are interleaved. */
  const errorAfter = async (p: Page, msg: RoomClientMessage) => {
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
  };
  const expectRejected = async (p: Page, msg: RoomClientMessage, code: string) => {
    expect(await errorAfter(p, msg)).toMatchObject({ t: 'error', code });
  };

  await expect.poll(async () => (await lastState(rawA))?.game?.phase, { timeout: 5000 }).toBe('roll');
  const start = await lastState(rawA);
  const game0 = start?.game as GameState;
  // Seat 0 holds colour 0 and moves first; the other player may not act.
  expect(game0.turn).toBe(0);
  await expectRejected(rawB, { t: 'roll' }, 'not_your_turn');
  await expectRejected(rawB, { t: 'move', horse: 0 }, 'not_your_turn');
  await expectRejected(rawA, { t: 'move', horse: 0 }, 'bad_phase');
  await expectRejected(rawA, { t: 'start' }, 'bad_state');
  await expectRejected(rawB, { t: 'addCpu', seat: 0 }, 'not_host');

  // Drive real rolls until the player on turn must pick a horse, then try an illegal one.
  let checked = false;
  for (let i = 0; i < 80 && !checked; i++) {
    const room = await lastState(rawA);
    const game = room?.game;
    if (!room || !game) continue;
    const owner = bySeat[String(room.seats.findIndex((s) => s.color === game.turn))] as Page;
    if (game.phase === 'roll') {
      await rawSend(owner, { t: 'roll' });
      await expect.poll(async () => (await lastState(rawA))?.seq, { timeout: 5000 }).toBeGreaterThan(room.seq);
    } else if (game.phase === 'move') {
      const illegal = [0, 1, 2, 3].find((h) => !game.legalHorses.includes(h)) ?? 9;
      const seqBefore = room.seq;
      await expectRejected(owner, { t: 'move', horse: illegal }, 'illegal_move');
      await expectRejected(owner, { t: 'move', horse: 99 }, 'illegal_move');
      expect((await lastState(rawA))?.seq).toBe(seqBefore);
      checked = true;
    }
  }
  expect(checked).toBe(true);

  // Garbage is answered with an error and an oversized message closes the socket.
  await expectRejected(rawA, { t: 'nope' } as unknown as RoomClientMessage, 'bad_message');
  const closeCode = await rawA.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const w = window as unknown as { __ws: WebSocket };
        w.__ws.onclose = (e) => resolve(e.code);
        w.__ws.send('x'.repeat(2000));
      }),
  );
  expect(closeCode).toBe(1009);
  await a.context.close();
  await b.context.close();
});

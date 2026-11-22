import { request } from 'node:http';
import { expect, test } from '@playwright/test';
import { createRoom, newPlayer, openRawSocket, ORIGIN, rawSend } from './helpers/rooms';
import { PASSWORD, openLobby, uniqueEmail } from './auth-helpers';

test('private room: a signed-out visitor registers from the entry screen link and lands seated beside the host', async ({ browser }) => {
  const host = await newPlayer(browser, 'Chủ Nhà');
  await openLobby(host.page);
  await host.page.getByTestId('create-name').fill('Phòng bạn bè');
  await host.page.getByTestId('create-visibility-private').check();
  await host.page.getByTestId('create-seats').selectOption('3');
  await host.page.getByTestId('create-submit').click();
  await expect(host.page).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  const code = host.page.url().split('/r/')[1] ?? '';
  await expect(host.page.getByTestId('room-name')).toHaveText('Phòng bạn bè');
  await expect(host.page.getByTestId('room-code')).toHaveText(code);
  await expect(host.page.getByTestId('seat-0-name')).toContainText('Chủ Nhà');
  await expect(host.page.getByTestId('seat-list').locator('li')).toHaveCount(3);

  const guestContext = await browser.newContext({ baseURL: ORIGIN, locale: 'vi-VN' });
  const guest = await guestContext.newPage();
  await guest.goto(`/r/${code}`);
  await expect(guest).toHaveURL(/\/bat-dau\?returnTo=/);
  await guest.getByTestId('to-signin').click();
  await expect(guest).toHaveURL(/\/dang-nhap\?returnTo=/);
  await guest.getByTestId('to-signup').click();
  await guest.getByTestId('signup-name').fill('Khách Mời');
  await guest.getByTestId('signup-email').fill(uniqueEmail('khach'));
  await guest.getByTestId('signup-password').fill(PASSWORD);
  await guest.getByTestId('signup-submit').click();
  await expect(guest).toHaveURL(`/r/${code}`);

  await expect(guest.getByTestId('seat-0-name')).toContainText('Chủ Nhà');
  await expect(guest.getByTestId('seat-1-name')).toContainText('Khách Mời (bạn)');
  await expect(host.page.getByTestId('seat-1-name')).toContainText('Khách Mời');
  await expect(host.page.getByTestId('seat-1-state')).toHaveText('Đang kết nối');
  await expect(guest.getByTestId('start-button')).toHaveCount(0);

  await host.context.close();
  await guestContext.close();
});

test('one board for the whole visit: matches, the lobby and the waiting room between them share a single canvas', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: ORIGIN, locale: 'vi-VN', viewport: { width: 360, height: 520 } });
  const page = await context.newPage();
  const canvases = page.locator('[data-testid=scene-host] canvas');
  /** Canvases created since the page loaded; a remount on a route change would raise it. */
  const mounts = () => page.evaluate(() => document.documentElement.dataset.sceneMounts);
  const playAgainstCpu = async () => {
    await page.getByTestId('create-seats').selectOption('2');
    await page.getByTestId('create-submit').click();
    await expect(page).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
    await page.getByTestId('add-cpu-1').click();
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    // The match plays on the shared board: the roll button opens once the board has shown the turn.
    await expect(page.getByTestId('roll-button')).toBeEnabled();
    await expect(page.locator('[data-testid=scene-host][data-load=ready]')).toBeVisible();
  };

  // The whole way in from the home page. (Without a GPU, as in this suite, the board waits for
  // the first match behind its poster; with one it is there from the home page on.)
  await page.goto('/');
  await page.getByTestId('play-now').click();
  await page.getByTestId('guest-name').fill('Khách Một Bàn');
  await page.getByTestId('guest-submit').click();
  await expect(page.getByTestId('greeting')).toBeVisible();
  await playAgainstCpu();
  await expect(canvases).toHaveCount(1);
  expect(await mounts()).toBe('1');

  // Back to the lobby, through a second waiting room and into a second match: still that canvas.
  await page.getByTestId('leave-room').click();
  await page.getByTestId('leave-confirm').click();
  await expect(page.getByTestId('greeting')).toBeVisible();
  await expect(canvases).toHaveCount(1);
  await playAgainstCpu();
  await expect(canvases).toHaveCount(1);
  expect(await mounts()).toBe('1');
  await context.close();
});

test('join by code from the lobby, unknown code, public list shows public rooms only', async ({ browser }) => {
  const host = await newPlayer(browser, 'Chủ Công Khai');
  const other = await newPlayer(browser, 'Người Xem');
  const publicCode = await createRoom(host, { name: 'Sảnh mở', visibility: 'public', seats: 2 });
  const privateCode = await createRoom(host, { name: 'Phòng kín', visibility: 'private', seats: 2 });
  await host.page.goto(`/r/${publicCode}`);
  await expect(host.page.getByTestId('seat-0-state')).toContainText('Đang kết nối');

  await openLobby(other.page);
  await expect(other.page.getByTestId(`room-item-${publicCode}`)).toContainText('Sảnh mở');
  await expect(other.page.getByTestId(`room-item-${publicCode}`)).toContainText('1/2 chỗ');
  await expect(other.page.getByTestId(`room-item-${privateCode}`)).toHaveCount(0);

  await other.page.getByTestId('join-input').fill('ZZZZ22');
  await other.page.getByTestId('join-submit').click();
  await expect(other.page.getByTestId('join-error')).toHaveText('Không tìm thấy phòng');

  await other.page.getByTestId('join-input').fill(`${ORIGIN}/r/${privateCode.toLowerCase()}`);
  await other.page.getByTestId('join-submit').click();
  await expect(other.page).toHaveURL(`/r/${privateCode}`);
  await other.page.getByTestId('leave-room').click();
  await expect(other.page).toHaveURL('/');

  await other.page.getByTestId(`room-join-${publicCode}`).click();
  await expect(other.page).toHaveURL(`/r/${publicCode}`);
  await expect(other.page.getByTestId('seat-1-name')).toContainText('Người Xem (bạn)');
  await openLobby(other.page);
  await expect(other.page.getByTestId(`room-join-${publicCode}`)).toBeDisabled();

  await host.context.close();
  await other.context.close();
});

test('unknown room code shows the not-found message with a way back', async ({ browser }) => {
  const p = await newPlayer(browser, 'Lạc Đường');
  await p.page.goto('/r/ZZZZ22');
  await expect(p.page.getByTestId('room-error')).toHaveText('Không tìm thấy phòng.');
  await p.page.getByTestId('back-to-lobby').click();
  await expect(p.page).toHaveURL('/');
  await expect(p.page.getByTestId('greeting')).toBeVisible();
  await p.context.close();
});

test('host adds and removes CPUs; start needs two occupied seats', async ({ browser }) => {
  const host = await newPlayer(browser, 'Chủ Máy');
  const code = await createRoom(host, { seats: 3 });
  await host.page.goto(`/r/${code}`);
  await expect(host.page.getByTestId('start-button')).toBeDisabled();
  await expect(host.page.getByTestId('start-reason')).toContainText('ít nhất 2');

  await host.page.getByTestId('add-cpu-1').click();
  await expect(host.page.getByTestId('seat-1-name')).toHaveText('Máy 1');
  await expect(host.page.getByTestId('start-button')).toBeEnabled();
  await host.page.getByTestId('add-cpu-2').click();
  await expect(host.page.getByTestId('seat-2-name')).toHaveText('Máy 2');

  await host.page.getByTestId('remove-cpu-1').click();
  await host.page.getByTestId('remove-cpu-2').click();
  await expect(host.page.getByTestId('seat-1-name')).toHaveText('Chỗ trống');
  await expect(host.page.getByTestId('start-button')).toBeDisabled();
  await host.context.close();
});

test('invite: an online player gets a toast and "Vào" seats them', async ({ browser }) => {
  const host = await newPlayer(browser, 'Người Mời');
  const guest = await newPlayer(browser, 'Người Được Mời');
  const code = await createRoom(host, { name: 'Phòng riêng tư', visibility: 'private', seats: 2 });
  await guest.page.goto('/');
  await host.page.goto(`/r/${code}`);

  await expect(host.page.getByTestId(`invite-${guest.id}`)).toBeVisible();
  await host.page.getByTestId(`invite-${guest.id}`).click();
  await expect(host.page.getByTestId(`invite-${guest.id}`)).toHaveText('Đã mời');

  const toast = guest.page.getByTestId('invite-toast');
  await expect(toast).toHaveText(/Người Mời mời bạn vào phòng Phòng riêng tư/);
  await guest.page.getByTestId('invite-accept').click();
  await expect(guest.page).toHaveURL(`/r/${code}`);
  await expect(guest.page.getByTestId('seat-1-name')).toContainText('Người Được Mời (bạn)');
  await expect(host.page.getByTestId('seat-1-name')).toContainText('Người Được Mời');
  await expect(host.page.getByTestId(`online-${guest.id}`)).toHaveCount(0);

  await host.context.close();
  await guest.context.close();
});

test('invite rate limit and invalid invites answer an error toast', async ({ browser }) => {
  const host = await newPlayer(browser, 'Mời Liên Tục');
  const guest = await newPlayer(browser, 'Bị Mời');
  const code = await createRoom(host, { seats: 3 });
  await guest.page.goto('/');
  await host.page.goto(`/r/${code}`);
  await expect(host.page.getByTestId(`invite-${guest.id}`)).toBeVisible();

  const result = await host.page.evaluate(
    ({ to, code: c }) =>
      new Promise<string[]>((resolve) => {
        const ws = new WebSocket(`ws://${location.host}/api/lobby/ws`);
        const got: string[] = [];
        ws.onopen = () => {
          ws.send(JSON.stringify({ t: 'invite', toUserId: to, code: c }));
          ws.send(JSON.stringify({ t: 'invite', toUserId: to, code: c }));
          ws.send(JSON.stringify({ t: 'invite', toUserId: 'khong-co-ai', code: c }));
        };
        ws.onmessage = (ev) => {
          const msg = JSON.parse(String(ev.data)) as { t: string; code?: string };
          if (msg.t === 'error') got.push(msg.code ?? '');
          if (got.length === 2) resolve(got);
        };
      }),
    { to: guest.id, code },
  );
  expect(result.sort()).toEqual(['invite_cooldown', 'not_online']);
  await host.context.close();
  await guest.context.close();
});

test('copy link puts the room URL on the clipboard', async ({ browser }) => {
  const host = await newPlayer(browser, 'Người Chép');
  const code = await createRoom(host);
  await host.page.goto(`/r/${code}`);
  await host.page.getByTestId('copy-link').click();
  await expect(host.page.getByTestId('copy-status')).toHaveText('Đã sao chép link phòng.');
  expect(await host.page.evaluate(() => navigator.clipboard.readText())).toBe(`${ORIGIN}/r/${code}?utm_source=invite`);
  await host.context.close();
});

test('room creation validates input, caps open rooms at three and creations at five per minute', async ({ browser }) => {
  const p = await newPlayer(browser, 'Tạo Nhiều');
  const post = (data: unknown) => p.context.request.post('/api/rooms', { headers: { Origin: ORIGIN }, data });
  expect((await post({ name: '   ', visibility: 'public', seats: 2 })).status()).toBe(400);
  expect((await post({ name: 'x'.repeat(41), visibility: 'public', seats: 2 })).status()).toBe(400);
  expect((await post({ name: 'ok', visibility: 'public', seats: 5 })).status()).toBe(400);
  expect((await post({ name: 'ok', visibility: 'secret', seats: 2 })).status()).toBe(400);
  const cross = await p.context.request.post('/api/rooms', {
    headers: { Origin: 'https://evil.example' },
    data: { name: 'ok', visibility: 'public', seats: 2 },
  });
  expect(cross.status()).toBe(403);
  expect(await cross.json()).toEqual({ error: { code: 'forbidden_origin', message: 'Yêu cầu không hợp lệ.' } });
  const create = async (name: string) => {
    const res = await post({ name, visibility: 'private', seats: 2 });
    return { res, status: res.status(), code: res.status() === 201 ? ((await res.json()) as { code: string }).code : '' };
  };
  // A host who leaves a waiting room that has only them closes it; the lobby then stops counting it.
  const leave = async (code: string) => {
    const page = await openRawSocket(p, code);
    await rawSend(page, { t: 'leave' });
    await page.close();
  };
  // Creates once the lobby has dropped the rooms just left; a refusal for the cap does not use up the per-minute limit.
  const createWhenFree = async (name: string) => {
    let last = await create(name);
    for (let i = 0; i < 50 && last.status === 429 && (await last.res.json()).error.code === 'too_many_rooms'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      last = await create(name);
    }
    return last;
  };

  const first = await create('Phòng 0');
  const second = await create('Phòng 1');
  const third = await create('Phòng 2');
  expect([first.status, second.status, third.status]).toEqual([201, 201, 201]);
  const firstCode = first.code;
  const capped = await create('Thừa');
  expect(capped.status).toBe(429);
  expect(await capped.res.json()).toEqual({
    error: {
      code: 'too_many_rooms',
      message: 'Bạn đang có quá nhiều phòng đang mở. Hãy rời bớt phòng trước khi tạo phòng mới.',
    },
  });

  // Rooms left free the cap, but five creations in a minute are still the limit.
  await leave(second.code);
  await leave(third.code);
  expect((await createWhenFree('Phòng 3')).status).toBe(201);
  expect((await createWhenFree('Phòng 4')).status).toBe(201);
  const limited = await create('Thừa');
  expect(limited.status).toBe(429);
  expect(((await limited.res.json()) as { error: { code: string } }).error.code).toBe('rate_limited');

  const anon = await browser.newContext({ baseURL: ORIGIN });
  expect((await anon.request.post('/api/rooms', { headers: { Origin: ORIGIN }, data: {} })).status()).toBe(401);
  // The room summary is public so the entry screen can name the room; everything else needs a session.
  const summary = await anon.request.get(`/api/rooms/${firstCode}`);
  expect(summary.status()).toBe(200);
  expect(await summary.json()).toMatchObject({ code: firstCode, name: 'Phòng 0', hostName: 'Tạo Nhiều' });
  expect((await anon.request.get('/api/rooms/ABC234')).status()).toBe(404);
  expect((await anon.request.get('/api/lobby/ws')).status()).toBe(401);
  expect((await anon.request.get(`/api/rooms/${firstCode}/ws`)).status()).toBe(401);
  await anon.close();
  await p.context.close();
});

test('a room socket from another origin is refused, the same origin is upgraded', async ({ browser }) => {
  const p = await newPlayer(browser, 'Khác Nguồn');
  const code = await createRoom(p);
  const cookie = (await p.context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');

  const upgrade = (origin: string) =>
    new Promise<number>((resolve) => {
      const req = request(`${ORIGIN}/api/rooms/${code}/ws`, {
        headers: {
          Origin: origin,
          Cookie: cookie,
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        },
      });
      req.on('response', (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('upgrade', (res, socket) => {
        socket.destroy();
        resolve(res.statusCode ?? 0);
      });
      // The dev server drops an upgrade request it answers with a plain error; that counts as refused too.
      req.on('error', () => resolve(0));
      req.end();
    });

  expect([0, 403]).toContain(await upgrade('https://evil.example'));
  expect(await upgrade(ORIGIN)).toBe(101);
  await p.context.close();
});

test('a full room refuses a third player with a clear message', async ({ browser }) => {
  const host = await newPlayer(browser, 'Chủ Phòng Đầy');
  const guest = await newPlayer(browser, 'Khách Đầu');
  const late = await newPlayer(browser, 'Khách Muộn');
  const code = await createRoom(host, { seats: 2 });
  await host.page.goto(`/r/${code}`);
  await guest.page.goto(`/r/${code}`);
  await expect(host.page.getByTestId('seat-1-name')).toContainText('Khách Đầu');

  await late.page.goto(`/r/${code}`);
  await expect(late.page.getByTestId('room-error')).toHaveText('Phòng đã đầy.');
  await expect(late.page.getByTestId('room-error')).toHaveAttribute('data-code', 'room_full');
  await late.page.getByTestId('back-to-lobby').click();
  await expect(late.page).toHaveURL('/');
  for (const p of [host, guest, late]) await p.context.close();
});

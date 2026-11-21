import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { CreateRoomRequest, CreateRoomResponse, RoomClientMessage, RoomServerMessage } from '../../shared/protocol';
import { PASSWORD, uniqueEmail } from '../auth-helpers';

export const ORIGIN = 'http://127.0.0.1:5173';

export interface Player {
  context: BrowserContext;
  page: Page;
  name: string;
  id: string;
}

/** A signed-in player in a fresh browser context, created through the API. */
export async function newPlayer(browser: Browser, name: string, viewport?: { width: number; height: number }): Promise<Player> {
  const context = await browser.newContext({
    baseURL: ORIGIN,
    locale: 'vi-VN',
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: viewport ?? { width: 1100, height: 800 },
  });
  const res = await context.request.post('/api/auth/signup', {
    headers: { Origin: ORIGIN },
    data: { email: uniqueEmail('p'), password: PASSWORD, displayName: name },
  });
  expect(res.ok()).toBe(true);
  const me = (await res.json()) as { user: { id: string } };
  const page = await context.newPage();
  return { context, page, name, id: me.user.id };
}

let nextAddress = Date.now() % 200_000_000;

/** A client address never used before, so guest creation limits do not leak between tests. */
export function freshAddress(): string {
  nextAddress += 1;
  return `10.${(nextAddress >> 16) & 255}.${(nextAddress >> 8) & 255}.${nextAddress & 255}`;
}

/** A guest in a fresh browser context, created through the API from its own client address. */
export async function newGuest(browser: Browser, name: string, viewport?: { width: number; height: number }): Promise<Player> {
  const context = await browser.newContext({
    baseURL: ORIGIN,
    locale: 'vi-VN',
    viewport: viewport ?? { width: 1100, height: 800 },
  });
  const res = await context.request.post('/api/auth/guest', {
    headers: { Origin: ORIGIN, 'CF-Connecting-IP': freshAddress() },
    data: { displayName: name },
  });
  expect(res.status()).toBe(200);
  const me = (await res.json()) as { user: { id: string; guest: boolean } };
  expect(me.user.guest).toBe(true);
  const page = await context.newPage();
  return { context, page, name, id: me.user.id };
}

export async function createRoom(player: Player, req: Partial<CreateRoomRequest> = {}): Promise<string> {
  const res = await player.context.request.post('/api/rooms', {
    headers: { Origin: ORIGIN },
    data: { name: 'Phòng thử', visibility: 'private', seats: 4, ...req },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as CreateRoomResponse).code;
}

/** Clicks roll and the first move button whenever the HUD offers them, from inside the page. */
export async function startAutoPlayer(page: Page): Promise<void> {
  await page.evaluate(() => {
    setInterval(() => {
      document.querySelector<HTMLButtonElement>('[data-testid=roll-button]')?.click();
      document.querySelector<HTMLButtonElement>('[data-testid^=move-button-]')?.click();
    }, 20);
  });
}

/** Closes the first-quick-match card when it is on screen (a fresh browser context always shows it once). */
export async function dismissQuickIntro(page: Page): Promise<void> {
  const ok = page.getByTestId('quick-intro-ok');
  await expect(ok).toBeVisible();
  await ok.click();
  await expect(page.getByTestId('quick-intro')).toBeHidden();
}

export const GAME_TIMEOUT = 8 * 60_000;

/**
 * Headless browsers rasterise WebGL on the CPU, at a cost proportional to the
 * pixel count; a small viewport keeps full games fast without unmounting the scene.
 */
export const VIEWPORT = { width: 360, height: 520 };

export async function startTwoPlayerGame(
  browser: Browser,
  names: [string, string],
  /** Runs once both players are seated in the waiting room, before the host starts the game. */
  beforeStart?: (a: Player, b: Player, code: string) => Promise<void>,
  make: typeof newPlayer = newPlayer,
) {
  const a = await make(browser, names[0], VIEWPORT);
  const b = await make(browser, names[1], VIEWPORT);
  const code = await createRoom(a, { name: 'Ván hai người', visibility: 'private', seats: 2 });
  await a.page.goto(`/r/${code}`);
  await b.page.goto(`/r/${code}`);
  await expect(a.page.getByTestId('seat-1-name')).toContainText(names[1]);
  await expect(a.page.getByTestId('start-button')).toBeEnabled();
  await beforeStart?.(a, b, code);
  await a.page.getByTestId('start-button').click();
  await expect(a.page.getByTestId('hud')).toBeVisible();
  await expect(b.page.getByTestId('hud')).toBeVisible();
  return { a, b, code };
}

export interface RawLog {
  msgs: RoomServerMessage[];
  /** Close codes seen on the socket, in order. */
  closes: number[];
}

export async function openRawSocket(player: Player, code: string): Promise<Page> {
  const page = await player.context.newPage();
  await page.goto('/');
  await page.evaluate(
    (c) =>
      new Promise<void>((resolve) => {
        const w = window as unknown as { __ws: WebSocket; __log: RawLog };
        w.__log = { msgs: [], closes: [] };
        w.__ws = new WebSocket(`ws://${location.host}/api/rooms/${c}/ws`);
        w.__ws.onmessage = (e) => w.__log.msgs.push(JSON.parse(String(e.data)) as RoomServerMessage);
        w.__ws.onclose = (e) => w.__log.closes.push(e.code);
        w.__ws.onopen = () => resolve();
      }),
    code,
  );
  return page;
}

export const rawSend = (page: Page, msg: RoomClientMessage) =>
  page.evaluate((m) => (window as unknown as { __ws: WebSocket }).__ws.send(JSON.stringify(m)), msg);
export const rawLog = (page: Page) => page.evaluate(() => (window as unknown as { __log: RawLog }).__log.msgs);

export const rawCloses = (page: Page) => page.evaluate(() => (window as unknown as { __log: RawLog }).__log.closes);

/** Latest snapshot a raw socket has received, or null. */
export async function lastRawState(page: Page) {
  const msgs = await rawLog(page);
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m?.t === 'state') return m.room;
  }
  return null;
}

/** One colour's horse positions as the HUD currently shows them. */
export async function horsesOf(page: Page, color: number): Promise<string> {
  const raw = (await page.getByTestId('hud').getAttribute('data-horses')) ?? '{}';
  return JSON.stringify((JSON.parse(raw) as Record<number, number[]>)[color]);
}

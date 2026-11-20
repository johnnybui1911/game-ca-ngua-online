import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { CreateRoomRequest, CreateRoomResponse } from '../../shared/protocol';
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

export const GAME_TIMEOUT = 8 * 60_000;

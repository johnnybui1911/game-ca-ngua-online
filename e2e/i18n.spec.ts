import { expect, test } from '@playwright/test';
import { enterLobby } from './auth-helpers';
import { VIEWPORT, createRoom, newPlayer } from './helpers/rooms';

test('the language is Vietnamese by default, whatever the browser locale says', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', locale: 'en-US' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('play-now')).toHaveText('Chơi ngay');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await context.close();
});

test('the switch changes the lobby and the room to English at once, and is remembered', async ({ browser }) => {
  const host = await newPlayer(browser, 'Host Lang', VIEWPORT);
  const code = await createRoom(host, { name: 'Phòng ngôn ngữ', seats: 3 });
  const page = host.page;

  // Home page: the switch is already there, before anyone has signed in or entered.
  await page.goto('/');
  await expect(page.getByTestId('play-now')).toHaveText('Chơi ngay');
  await page.getByTestId('lang-en').click();
  await expect(page.getByTestId('play-now')).toHaveText('Play now');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('lang-en')).toHaveAttribute('aria-pressed', 'true');

  // Lobby, no reload: the choice carries over.
  await enterLobby(page);
  await expect(page.getByTestId('greeting')).toHaveText('Hello, Host Lang');
  await expect(page.getByRole('heading', { name: 'Create a room' })).toBeVisible();
  await expect(page.getByTestId('create-submit')).toHaveText('Create a room');

  // A reload keeps it (localStorage).
  await page.reload();
  await expect(page.getByTestId('greeting')).toHaveText('Hello, Host Lang');

  // The waiting room, over the same game connection.
  await page.goto(`/r/${code}`);
  await expect(page.getByTestId('room-name')).toHaveText('Phòng ngôn ngữ');
  await expect(page.getByText('Waiting room · Private')).toBeVisible();
  await page.getByTestId('add-cpu-1').click();
  await expect(page.getByTestId('seat-1-name')).toHaveText('CPU 1');
  await expect(page.getByTestId('seat-1-state')).toHaveText('CPU · Normal');
  await expect(page.getByTestId('start-button')).toHaveText('Start');

  // Back to Vietnamese without leaving the room: the same seats, the CPU name follows.
  await page.getByTestId('lang-vi').click();
  await expect(page.getByTestId('seat-1-name')).toHaveText('Máy 1');
  await expect(page.getByTestId('seat-1-state')).toHaveText('Máy · Thường');
  await expect(page.getByTestId('start-button')).toHaveText('Bắt đầu');
  await page.getByTestId('lang-en').click();

  // The match HUD.
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('turn-banner')).toHaveText(/^(Your turn|CPU 1's turn)$/);
  await page.getByTestId('match-menu-button').click();
  await expect(page.getByTestId('menu-close')).toHaveText('Close');
  await page.getByTestId('lang-vi').click();
  await expect(page.getByTestId('menu-close')).toHaveText('Đóng');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await host.context.close();
});

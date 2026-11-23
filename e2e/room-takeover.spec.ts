import { expect, test, type Browser } from '@playwright/test';
import { openLobby } from './auth-helpers';
import { VIEWPORT, createRoom, newPlayer, startAutoPlayer, type Player } from './helpers/rooms';

/** A host alone with one CPU (seat 1, colour 2) in a started two-seat game. */
async function startWithCpu(browser: Browser, name: string, visibility: 'public' | 'private') {
  const host = await newPlayer(browser, name, VIEWPORT);
  const code = await createRoom(host, { name: `Phòng ${name}`, visibility, seats: 2 });
  await host.page.goto(`/r/${code}`);
  await host.page.getByTestId('add-cpu-1').click();
  await expect(host.page.getByTestId('seat-1-name')).toContainText('Máy 1');
  await host.page.getByTestId('start-button').click();
  await expect(host.page.getByTestId('hud')).toBeVisible();
  await expect(host.page.getByTestId('hud-player-2')).toContainText('Máy 1');
  return { host, code };
}

/** The newcomer holds colour 2 in place of the CPU, everyone sees it, and they roll when their turn comes. */
async function expectTakenOver(host: Player, joiner: Player) {
  await expect(joiner.page.getByTestId('hud')).toBeVisible();
  await expect(joiner.page.getByTestId('hud-player-2')).toContainText(joiner.name);
  await expect(host.page.getByTestId('hud-player-2')).toContainText(joiner.name);
  await expect(host.page.getByTestId('lobby-notice')).toContainText(`${joiner.name} đã vào thay Máy 1`);
  await expect(joiner.page.getByTestId('lobby-notice')).toHaveCount(0);
  await startAutoPlayer(host.page);
  const roll = joiner.page.getByTestId('roll-button');
  await expect(roll).toBeVisible({ timeout: 90_000 });
  await roll.click();
  await expect(roll).toHaveCount(0, { timeout: 10_000 });
}

test('a person opening the invite link mid-game takes the CPU seat; with none left the next is refused', async ({ browser }) => {
  test.setTimeout(180_000);
  const { host, code } = await startWithCpu(browser, 'Chủ Thay Máy', 'private');
  // The in-game menu copies the invite link while a CPU seat is left.
  await host.page.getByTestId('match-menu-button').click();
  await host.page.getByTestId('menu-invite').click();
  await expect(host.page.getByTestId('lobby-notice').first()).toContainText('Đã sao chép link mời');
  expect(await host.page.evaluate(() => navigator.clipboard.readText())).toContain(`/r/${code}`);

  const joiner = await newPlayer(browser, 'Người Vào Thay', VIEWPORT);
  await joiner.page.goto(`/r/${code}`);
  await expectTakenOver(host, joiner);

  const late = await newPlayer(browser, 'Người Đến Muộn', VIEWPORT);
  await late.page.goto(`/r/${code}`);
  await expect(late.page.getByTestId('room-error')).toHaveAttribute('data-code', 'game_in_progress');
  await expect(late.page.getByTestId('room-error')).toHaveText('Ván đấu đang diễn ra và không còn chỗ máy để vào thay.');
  for (const p of [host, joiner, late]) await p.context.close();
});

test('the lobby lists a public game with a CPU seat as joinable and "Vào" takes that seat', async ({ browser }) => {
  test.setTimeout(180_000);
  const { host, code } = await startWithCpu(browser, 'Chủ Sảnh Máy', 'public');
  const joiner = await newPlayer(browser, 'Khách Từ Sảnh', VIEWPORT);
  await openLobby(joiner.page);
  const item = joiner.page.getByTestId(`room-item-${code}`);
  await expect(item).toContainText('Đang chơi · còn chỗ máy');
  await expect(joiner.page.getByTestId(`room-join-${code}`)).toBeEnabled();
  await joiner.page.getByTestId(`room-join-${code}`).click();
  await expectTakenOver(host, joiner);

  // No CPU seat left: the room reads as a game in progress again and cannot be joined.
  const other = await newPlayer(browser, 'Người Xem Sảnh', VIEWPORT);
  await openLobby(other.page);
  await expect(other.page.getByTestId(`room-item-${code}`)).toContainText('Đang chơi');
  await expect(other.page.getByTestId(`room-item-${code}`)).not.toContainText('còn chỗ máy');
  await expect(other.page.getByTestId(`room-join-${code}`)).toBeDisabled();
  for (const p of [host, joiner, other]) await p.context.close();
});

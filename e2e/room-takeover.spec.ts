import { expect, test, type Browser } from '@playwright/test';
import { openLobby } from './auth-helpers';
import { VIEWPORT, createRoom, newPlayer, startAutoPlayer, startTwoPlayerGame } from './helpers/rooms';

/** A host alone with CPUs on every other seat of a started game. Seat i holds colour `colors[i]`. */
async function startWithCpus(browser: Browser, name: string, opts: { visibility: 'public' | 'private'; seats: number; allowTakeover: boolean }) {
  const host = await newPlayer(browser, name, VIEWPORT);
  const code = await createRoom(host, { name: `Phòng ${name}`, ...opts });
  await host.page.goto(`/r/${code}`);
  for (let i = 1; i < opts.seats; i++) {
    await host.page.getByTestId(`add-cpu-${i}`).click();
    await expect(host.page.getByTestId(`seat-${i}-name`)).toContainText('Máy');
  }
  await host.page.getByTestId('start-button').click();
  await expect(host.page.getByTestId('hud')).toBeVisible();
  return { host, code };
}

test('people ask for a CPU colour by link, one per colour; the host turns one down and lets the other in', async ({ browser }) => {
  test.setTimeout(180_000);
  // Three seats: colour 0 the host, colours 1 and 2 CPUs.
  const { host, code } = await startWithCpus(browser, 'Chủ Duyệt', { visibility: 'private', seats: 3, allowTakeover: true });
  await host.page.getByTestId('match-menu-button').click();
  await host.page.getByTestId('menu-invite').click();
  await expect(host.page.getByTestId('lobby-notice').first()).toContainText('Đã sao chép link mời');
  expect(await host.page.evaluate(() => navigator.clipboard.readText())).toContain(`/r/${code}`);

  const joiner = await newPlayer(browser, 'Người Được Duyệt', VIEWPORT);
  await joiner.page.goto(`/r/${code}`);
  await expect(joiner.page.getByTestId('join-pick')).toContainText('Chọn màu');
  await joiner.page.getByTestId('join-color-2').click();
  await expect(joiner.page.getByTestId('join-waiting')).toBeVisible();

  // The colour already asked for cannot be asked for again.
  const other = await newPlayer(browser, 'Người Bị Từ Chối', VIEWPORT);
  await other.page.goto(`/r/${code}`);
  await expect(other.page.getByTestId('join-color-2')).toBeDisabled();
  await other.page.getByTestId('join-color-1').click();
  await expect(other.page.getByTestId('join-waiting')).toBeVisible();

  await expect(host.page.getByTestId('join-request-2')).toContainText('Người Được Duyệt');
  await expect(host.page.getByTestId('join-request-1')).toContainText('Người Bị Từ Chối');
  await host.page.getByTestId('join-reject-1').click();
  await expect(other.page.getByTestId('join-notice')).toHaveText('Chủ phòng đã từ chối yêu cầu vào thay máy.');
  await other.page.getByTestId('join-color-1').click();
  await expect(other.page.getByTestId('join-notice')).toContainText('hãy đợi');

  await host.page.getByTestId('join-approve-2').click();
  await expect(joiner.page.getByTestId('hud')).toBeVisible();
  await expect(joiner.page.getByTestId('hud-player-2')).toContainText(joiner.name);
  await expect(host.page.getByTestId('hud-player-2')).toContainText(joiner.name);
  await expect(host.page.getByText(`${joiner.name} đã vào thay`)).toBeVisible();
  await expect(host.page.getByTestId('join-requests')).toHaveCount(0);

  await startAutoPlayer(host.page);
  const roll = joiner.page.getByTestId('roll-button');
  await expect(roll).toBeVisible({ timeout: 90_000 });
  await roll.click();
  await expect(roll).toHaveCount(0, { timeout: 10_000 });
  for (const p of [host, joiner, other]) await p.context.close();
});

test('the lobby lists a game that lets people in as joinable; one without the option stays closed', async ({ browser }) => {
  test.setTimeout(180_000);
  const open = await startWithCpus(browser, 'Chủ Mở Cửa', { visibility: 'public', seats: 2, allowTakeover: true });
  const closed = await startWithCpus(browser, 'Chủ Đóng Cửa', { visibility: 'public', seats: 2, allowTakeover: false });
  const joiner = await newPlayer(browser, 'Khách Từ Sảnh', VIEWPORT);
  await openLobby(joiner.page);
  await expect(joiner.page.getByTestId(`room-item-${open.code}`)).toContainText('Đang chơi · còn chỗ máy');
  await expect(joiner.page.getByTestId(`room-item-${closed.code}`)).not.toContainText('còn chỗ máy');
  await expect(joiner.page.getByTestId(`room-join-${closed.code}`)).toBeDisabled();

  await joiner.page.getByTestId(`room-join-${open.code}`).click();
  // A single CPU seat: one button, no colour choice to explain.
  await expect(joiner.page.getByTestId('join-pick')).toHaveText('Xin vào thay máy, chủ phòng sẽ duyệt:');
  await joiner.page.getByTestId('join-color-2').click();
  await open.host.page.getByTestId('join-approve-2').click();
  await expect(joiner.page.getByTestId('hud-player-2')).toContainText(joiner.name);

  const late = await newPlayer(browser, 'Người Đến Muộn', VIEWPORT);
  await late.page.goto(`/r/${open.code}`);
  await expect(late.page.getByTestId('room-error')).toHaveAttribute('data-code', 'no_cpu_seat');
  await late.page.goto(`/r/${closed.code}`);
  await expect(late.page.getByTestId('room-error')).toHaveAttribute('data-code', 'game_in_progress');
  for (const p of [open.host, closed.host, joiner, late]) await p.context.close();
});

test('a host leaving mid-game can end the room for everyone', async ({ browser }) => {
  const { a, b } = await startTwoPlayerGame(browser, ['Chủ Kết Thúc', 'Người Ở Lại']);
  await a.page.getByTestId('leave-room').click();
  await expect(a.page.getByTestId('host-leave-dialog')).toBeVisible();
  await expect(a.page.getByTestId(`host-leave-heir-${b.id}`)).toBeChecked();
  await a.page.getByTestId('host-leave-close').click();
  await expect(b.page.getByTestId('room-error')).toHaveAttribute('data-code', 'closed_by_host');
  await a.context.close();
  await b.context.close();
});

test('a host leaving mid-game hands the room to the person they choose', async ({ browser }) => {
  const { a, b } = await startTwoPlayerGame(browser, ['Chủ Giao Phòng', 'Chủ Được Giao']);
  await a.page.getByTestId('leave-room').click();
  await a.page.getByTestId('host-leave-handover').click();
  await expect(a.page).toHaveURL('/');
  await expect(b.page.getByTestId('hud-player-0')).toContainText('Máy');
  await b.page.getByTestId('match-menu-button').click();
  await expect(b.page.getByTestId('pause-button')).toBeVisible();
  await a.context.close();
  await b.context.close();
});

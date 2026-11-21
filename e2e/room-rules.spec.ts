import { expect, test } from '@playwright/test';
import { VIEWPORT, createRoom, newPlayer, startTwoPlayerGame } from './helpers/rooms';

test('the rules sheet opens from the waiting room', async ({ browser }) => {
  const host = await newPlayer(browser, 'Chủ Luật', VIEWPORT);
  const code = await createRoom(host, { seats: 2 });
  await host.page.goto(`/r/${code}`);
  await host.page.getByTestId('waiting-rules').click();
  const sheet = host.page.getByTestId('rules-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('li')).toHaveCount(7);
  await expect(sheet.getByTestId('rules-countdown')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Đóng' }).click();
  await expect(sheet).toBeHidden();
  await host.context.close();
});

test('the rules sheet opens during a match without pausing the turn clock', async ({ browser }) => {
  const { a, b } = await startTwoPlayerGame(browser, ['Người Đọc', 'Người Xem']);
  const page = a.page;
  await expect(page.getByTestId('roll-button')).toBeVisible();

  const button = page.getByTestId('rules-button');
  await expect(button).toHaveAccessibleName('Luật chơi');
  await button.click();
  const sheet = page.getByTestId('rules-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('li')).toHaveCount(7);

  const read = async () => Number(/(\d+)/.exec((await sheet.getByTestId('rules-countdown').textContent()) ?? '')?.[1]);
  await expect(sheet.getByTestId('rules-countdown')).toContainText('Còn');
  const first = await read();
  await expect.poll(read, { timeout: 5000 }).toBeLessThan(first);

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // Reachable from the menu; the other player's sheet has no countdown while it is not their turn.
  await page.getByTestId('match-menu-button').click();
  await page.getByTestId('menu-rules').click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Đóng' }).click();
  await expect(sheet).toBeHidden();

  await b.page.getByTestId('rules-button').click();
  await expect(b.page.getByTestId('rules-sheet')).toBeVisible();
  await expect(b.page.getByTestId('rules-countdown')).toHaveCount(0);
  await a.context.close();
  await b.context.close();
});

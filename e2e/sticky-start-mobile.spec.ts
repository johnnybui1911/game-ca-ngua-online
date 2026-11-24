import { expect, test } from '@playwright/test';
import { openLobby } from './auth-helpers';
import { createRoom, newPlayer } from './helpers/rooms';

for (const viewport of [{ width: 360, height: 740 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`room header stays visible at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const host = await newPlayer(browser, 'Chủ phòng', viewport);
    const code = await createRoom(host);
    await host.page.goto(`/r/${code}`);
    const header = host.page.locator('.room-head');
    const scroller = host.page.locator('.shell-panel-body > .room-page');
    await expect(host.page.getByTestId('start-reason')).toBeVisible();
    await expect(host.page.getByTestId('allow-takeover-tag')).toBeVisible();
    const before = await header.boundingBox();
    const scroll = await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    });
    const after = await header.boundingBox();
    expect(scroll).toBeGreaterThan(0);
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
    const sound = await host.page.getByTestId('slot-sound').boundingBox();
    if (viewport.width < 900) {
      expect(after!.y).toBeGreaterThanOrEqual(sound!.y + sound!.height);
      const copy = await host.page.getByTestId('copy-link').boundingBox();
      expect(copy!.width).toBeGreaterThanOrEqual(44);
      expect(copy!.height).toBeGreaterThanOrEqual(44);
    }
    await host.context.close();
  });
}

test('mobile creation shows a concise seat count and creates a room open to takeover', async ({ browser }) => {
  const host = await newPlayer(browser, 'Chủ phòng', { width: 360, height: 740 });
  await openLobby(host.page);
  await expect(host.page.getByTestId('create-allow-takeover')).toHaveCount(0);
  await expect(host.page.locator('.seat-count-select > span')).toHaveText('4');
  await host.page.getByTestId('create-seats').selectOption('3');
  await expect(host.page.locator('.seat-count-select > span')).toHaveText('3');
  await host.page.getByTestId('create-submit').click();
  await expect(host.page.getByTestId('allow-takeover-tag')).toBeVisible();
  await host.context.close();
});

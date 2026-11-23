import { expect, test } from '@playwright/test';
import { createRoom, newPlayer } from './helpers/rooms';

for (const viewport of [{ width: 360, height: 740 }, { width: 390, height: 844 }]) {
  test(`host start stays visible while scrolling at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const host = await newPlayer(browser, 'Chủ phòng', viewport);
    const code = await createRoom(host);
    await host.page.goto(`/r/${code}`);
    const button = host.page.getByTestId('start-button');
    await expect(button).toBeVisible();
    const scroller = host.page.locator('.shell-panel-body > .room-page');
    const sound = await host.page.getByTestId('slot-sound').boundingBox();
    for (const enabled of [false, true]) {
      await scroller.evaluate((el) => { el.scrollTop = 0; });
      if (enabled) {
        await host.page.getByTestId('add-cpu-1').click();
        await expect(button).toBeEnabled();
      } else {
        await expect(button).toBeDisabled();
      }
      const before = await button.boundingBox();
      const scroll = await scroller.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
        return { top: el.scrollTop, max: el.scrollHeight - el.clientHeight };
      });
      const after = await button.boundingBox();
      expect(scroll.max).toBeGreaterThan(0);
      expect(scroll.top).toBe(scroll.max);
      expect(before).not.toBeNull();
      expect(after).not.toBeNull();
      expect(sound).not.toBeNull();
      expect(after!.y).toBeGreaterThanOrEqual(sound!.y + sound!.height);
      expect(after!.x).toBeGreaterThan(0);
      expect(after!.x + after!.width).toBeLessThan(viewport.width);
      expect(Math.abs(after!.y - before!.y)).toBeLessThan(32);
    }
    await host.context.close();
  });
}

test('desktop start remains in normal scroll flow', async ({ browser }) => {
  const host = await newPlayer(browser, 'Chủ phòng', { width: 1280, height: 800 });
  const code = await createRoom(host);
  await host.page.goto(`/r/${code}`);
  const button = host.page.getByTestId('start-button');
  await expect(button).toBeVisible();
  const row = host.page.locator('.start-row');
  await expect(row).toHaveCSS('position', 'static');
  const before = await button.boundingBox();
  const scroller = host.page.locator('.shell-panel-body > .room-page');
  const scrollTop = await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return el.scrollTop;
  });
  const after = await button.boundingBox();
  expect(scrollTop).toBeGreaterThan(0);
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(before!.y - after!.y - scrollTop)).toBeLessThan(1);
  await host.context.close();
});

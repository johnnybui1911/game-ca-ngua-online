import { expect, test } from '@playwright/test';
import { createRoom, newPlayer } from './helpers/rooms';

test('the waiting-room start button stays visible while scrolling on mobile', async ({ browser }) => {
  const host = await newPlayer(browser, 'Chủ Sticky', { width: 360, height: 740 });
  const code = await createRoom(host, { seats: 4 });
  await host.page.goto(`/r/${code}`);
  for (const seat of [1, 2, 3]) {
    await host.page.getByTestId(`add-cpu-${seat}`).click();
  }

  const start = host.page.getByTestId('start-button');
  await expect(start).toBeEnabled();
  await host.page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  const box = await start.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(740);
  await host.context.close();
});

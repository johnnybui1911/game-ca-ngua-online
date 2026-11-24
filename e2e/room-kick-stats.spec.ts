import { expect, test } from '@playwright/test';
import { createRoom, newPlayer } from './helpers/rooms';

for (const [label, viewport] of [
  ['desktop', { width: 1100, height: 800 }],
  ['mobile', { width: 360, height: 640 }],
] as const) {
  test(`kick scoreboard opens and closes on ${label}`, async ({ browser }) => {
    const host = await newPlayer(browser, 'Người Chơi', viewport);
    const code = await createRoom(host, { seats: 2 });
    await host.page.goto(`/r/${code}`);
    await host.page.getByTestId('add-cpu-1').click();
    await host.page.getByTestId('start-button').click();
    await expect(host.page.getByTestId('hud')).toBeVisible();
    await host.page.getByTestId('match-menu-button').click();
    const entry = host.page.getByTestId('menu-kick-stats');
    await entry.click();
    const dialog = host.page.getByTestId('kick-stats');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.getByTestId('kick-stats-0')).toContainText('Người Chơi');
    await expect(dialog.getByTestId('kick-stats-1')).toContainText('Máy');
    await expect(dialog.locator('tbody tr')).toHaveCount(2);
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    await host.page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(entry).toBeFocused();
    await entry.click();
    await dialog.getByTestId('kick-stats-close').click();
    await expect(dialog).toBeHidden();
    await entry.click();
    await host.page.locator('.dialog-backdrop').last().click({ position: { x: 2, y: 2 } });
    await expect(dialog).toBeHidden();
    await host.context.close();
  });
}

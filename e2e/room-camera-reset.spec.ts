import { expect, test } from '@playwright/test';
import { createRoom, newPlayer } from './helpers/rooms';

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`the emote button takes the creator badge's corner in a match at ${viewport.width}px`, async ({ browser }) => {
    const host = await newPlayer(browser, 'Người Chơi', viewport);
    const code = await createRoom(host, { seats: 2 });
    await host.page.goto(`/r/${code}`);
    await host.page.getByTestId('add-cpu-1').click();
    await expect(host.page.getByTestId('creator-badge')).toBeVisible();
    await host.page.getByTestId('start-button').click();
    const reset = host.page.getByRole('button', { name: 'Về góc nhìn mặc định' });
    const emote = host.page.getByTestId('emote-open');
    await expect(host.page.getByTestId('creator-badge')).toHaveCount(0);
    await expect(reset).toBeVisible();
    await expect(reset).toHaveAttribute('data-tooltip', 'Reset góc quay');
    await expect(reset).not.toHaveAttribute('title');
    await reset.hover();
    expect(await reset.evaluate((el) => getComputedStyle(el, '::after').visibility)).toBe('visible');
    const [buttonBox, emoteBox, panelBox] = await Promise.all([
      reset.boundingBox(), emote.boundingBox(), host.page.locator('.hud-bottom').boundingBox(),
    ]);
    expect(buttonBox).not.toBeNull();
    expect(emoteBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    expect(buttonBox!.width).toBeCloseTo(emoteBox!.width, 0);
    expect(buttonBox!.height).toBeCloseTo(emoteBox!.height, 0);
    expect(emoteBox!.width).toBeGreaterThanOrEqual(44);
    expect(emoteBox!.height).toBeGreaterThanOrEqual(44);
    expect(buttonBox!.y).toBeCloseTo(emoteBox!.y, 0);
    expect(buttonBox!.x - panelBox!.x).toBeCloseTo(panelBox!.x + panelBox!.width - emoteBox!.x - emoteBox!.width, 0);
    await reset.click();
    await host.page.getByTestId('emote-open').click();
    await expect(host.page.getByRole('group', { name: 'Biểu cảm nhanh' })).toBeVisible();
    await host.context.close();
  });
}

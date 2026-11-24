import { expect, test } from '@playwright/test';
import { createRoom, newPlayer } from './helpers/rooms';

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`camera reset mirrors the creator badge at ${viewport.width}px`, async ({ browser }) => {
    const host = await newPlayer(browser, 'Người Chơi', viewport);
    const code = await createRoom(host, { seats: 2 });
    await host.page.goto(`/r/${code}`);
    await host.page.getByTestId('add-cpu-1').click();
    await host.page.getByTestId('start-button').click();
    const reset = host.page.getByRole('button', { name: 'Về góc nhìn mặc định' });
    const badge = host.page.getByTestId('creator-badge');
    await expect(reset).toBeVisible();
    await expect(reset).toHaveAttribute('title', 'Đặt lại camera');
    const [buttonBox, badgeBox, panelBox] = await Promise.all([
      reset.boundingBox(), badge.boundingBox(), host.page.locator('.hud-bottom').boundingBox(),
    ]);
    expect(buttonBox).not.toBeNull();
    expect(badgeBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    expect(buttonBox!.width).toBeCloseTo(badgeBox!.width, 0);
    expect(buttonBox!.height).toBeCloseTo(badgeBox!.height, 0);
    expect(buttonBox!.y).toBeCloseTo(badgeBox!.y, 0);
    expect(buttonBox!.x - panelBox!.x).toBeCloseTo(panelBox!.x + panelBox!.width - badgeBox!.x - badgeBox!.width, 0);
    await reset.click();
    await host.page.getByTestId('emote-open').click();
    await expect(host.page.getByRole('group', { name: 'Biểu cảm nhanh' })).toBeVisible();
    await host.context.close();
  });
}

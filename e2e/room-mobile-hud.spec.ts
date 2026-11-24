import { expect, test } from '@playwright/test';
import { createRoom, newPlayer } from './helpers/rooms';

for (const seats of [2, 3, 4]) {
  test(`mobile HUD keeps ${seats} seats in two columns with accessible progress`, async ({ browser }) => {
    const player = await newPlayer(browser, 'Nguyễn Hoàng Anh Dũng', { width: 360, height: 740 });
    try {
      const code = await createRoom(player, { seats });
      await player.page.goto(`/r/${code}`);
      for (let i = 1; i < seats; i++) await player.page.getByTestId(`add-cpu-${i}`).click();
      await player.page.getByTestId('start-button').click();
      const cards = player.page.locator('.hud-player');
      await expect(cards).toHaveCount(seats);
      const layout = await cards.evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        const avatar = element.querySelector('.seat-dot')!.getBoundingClientRect();
        const name = element.querySelector('.hud-name')!.getBoundingClientRect();
        return {
          top: rect.top, left: rect.left, right: rect.right, width: rect.width, height: rect.height,
          leftPadding: avatar.left - rect.left, rightPadding: rect.right - name.right, gap: name.left - avatar.right,
        };
      }));
      expect(new Set(layout.map((item) => item.top)).size).toBe(Math.ceil(seats / 2));
      expect(layout.every((item) => item.width <= 108)).toBe(true);
      expect(layout.every((item) => item.height === 44)).toBe(true);
      expect(layout.every((item) => item.leftPadding >= 8 && item.rightPadding >= 8 && item.gap >= 8)).toBe(true);
      expect(layout[1]!.left - layout[0]!.right).toBeGreaterThan(50);
      await expect(cards.first().locator('.hud-name')).toHaveCSS('text-overflow', 'ellipsis');
      if (seats === 4) {
        expect(await cards.first().locator('.hud-name').evaluate((name) => name.scrollWidth > name.clientWidth)).toBe(true);
      }
      for (const card of await cards.all()) {
        await expect(card.locator('.hud-home')).toHaveAttribute('aria-label', /[0-4]\/4/);
        await expect(card.locator('.hud-home-pips > span')).toHaveCount(4);
      }
      await expect(player.page.locator('.hud-player[aria-current="true"]')).toHaveCount(1);
      await expect(cards.nth(1).locator('.hud-badges')).toBeHidden();
    } finally {
      await player.context.close();
    }
  });
}

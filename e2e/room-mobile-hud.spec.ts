import { expect, test } from '@playwright/test';
import { createRoom, newPlayer } from './helpers/rooms';

for (const { seats, name, rows } of [
  { seats: 2, name: 'Nam', rows: 1 },
  { seats: 2, name: 'a b c d e f g h i', rows: 1 },
  { seats: 3, name: 'Nam', rows: 1 },
  { seats: 3, name: 'a b c d e f g h i', rows: 2 },
  { seats: 4, name: 'a b c d e f g h', rows: 1 },
  { seats: 4, name: 'a b c d e f g h i', rows: 2 },
  { seats: 4, name: 'Nguyễn Hoàng Anh Dũng', rows: 1 },
]) {
  test(`mobile HUD lays out ${seats} seats for ${name}`, async ({ browser }) => {
    const player = await newPlayer(browser, name, { width: 360, height: 740 });
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
      expect(new Set(layout.map((item) => item.top)).size).toBe(rows);
      expect(new Set(layout.map((item) => item.width)).size).toBe(1);
      expect(layout.every((item) => item.height === 44)).toBe(true);
      expect(layout.every((item) => item.leftPadding >= 6 && item.rightPadding >= 6 && item.gap >= 6)).toBe(true);
      expect(layout[1]!.left - layout[0]!.right).toBe(4);
      if (seats === 3 && rows === 2) {
        expect((layout[2]!.left + layout[2]!.right) / 2).toBe(180);
      }
      await expect(cards.first().locator('.hud-name')).toHaveCSS('text-overflow', 'ellipsis');
      if (name === 'Nguyễn Hoàng Anh Dũng') {
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

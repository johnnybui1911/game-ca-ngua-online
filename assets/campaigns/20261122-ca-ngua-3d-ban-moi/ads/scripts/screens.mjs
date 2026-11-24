// usage: node screens.mjs <mobile|desktop> <baseUrl> <guestName>
import { chromium } from '/Users/johnny.bui/orca/projects/game-ca-ngua-online/node_modules/@playwright/test/index.mjs';
import { mkdirSync } from 'node:fs';

const [mode, base, who] = process.argv.slice(2);
const mobile = mode === 'mobile';
const vp = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
mkdirSync('/tmp/shots', { recursive: true });
const OUT = `/tmp/shots/${mode}`;
const wsBase = base.replace(/^http/, 'ws');
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const ctx = await browser.newContext({ baseURL: base, locale: 'vi-VN', viewport: vp, deviceScaleFactor: mobile ? 3 : 2, isMobile: mobile, hasTouch: mobile });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('[page]', e.message));
const shot = async (name, wait = 1200) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}-${name}.png` });
  console.log('shot', name);
};

await page.goto('/');
await page.waitForTimeout(9000);
await page.getByTestId('play-now').click();
const gn = page.getByTestId('guest-name');
await gn
  .waitFor({ timeout: 15000 })
  .then(async () => {
    await gn.fill(who);
    await page.getByTestId('guest-submit').click();
  })
  .catch(() => {});
await page.getByTestId('greeting').waitFor({ timeout: 30000 });
await page.waitForTimeout(3000);
await shot('lobby');

await page.getByTestId('create-name').fill('Nhà Ngoại ăn Tết');
await page.getByTestId('create-seats').selectOption('4');
await page.getByTestId('create-visibility-public').click();
await page.getByTestId('create-name').scrollIntoViewIfNeeded();
await shot('create');
await page.getByTestId('create-submit').click();
await page.getByTestId('seat-list').waitFor();
for (const i of [1, 2, 3]) await page.getByTestId(`add-cpu-${i}`).click();
await page.waitForTimeout(2500);
await shot('waiting');
await page.getByTestId('game-settings').scrollIntoViewIfNeeded();
await page.getByTestId('mode-quick').click();
await page.getByTestId('cpu-level-hard').click();
await page
  .getByRole('radio', { name: 'Nhanh', exact: true })
  .first()
  .click()
  .catch((e) => console.log('pace radio', e.message.slice(0, 60)));
await shot('settings');
await page.getByTestId('waiting-rules').scrollIntoViewIfNeeded();
await page.getByTestId('waiting-rules').click();
await shot('rules');
await page.getByTestId('rules-close').click();

await page.getByTestId('start-button').scrollIntoViewIfNeeded();
await page.getByTestId('start-button').click();
await page.getByTestId('hud').waitFor();
const intro = page.getByTestId('quick-intro-ok');
await intro
  .waitFor({ timeout: 6000 })
  .then(async () => {
    await shot('quick-intro', 800);
    await intro.click();
  })
  .catch(() => {});
await page.waitForTimeout(6000);
await shot('match');
await page.evaluate(() => {
  window.__ap = setInterval(() => {
    document.querySelector('[data-testid=roll-button]')?.click();
    document.querySelector('[data-testid^=move-button-]')?.click();
  }, 40);
});

// A second page in the same session reads the room state to know when kicks happened.
const code = page.url().split('/r/')[1].split(/[?#]/)[0];
const raw = await ctx.newPage();
await raw.goto('/gioi-thieu');
await raw.evaluate(
  ([c, ws]) =>
    new Promise((res) => {
      window.__kicks = null;
      const sock = new WebSocket(`${ws}/api/rooms/${c}/ws`);
      sock.onmessage = (e) => {
        const m = JSON.parse(String(e.data));
        if (m.t === 'state' && m.room.game) window.__kicks = m.room.game.kicks ?? {};
      };
      sock.onopen = () => res();
    }),
  [code, wsBase],
);
await page.bringToFront();
let tookKicks = false;
const start = Date.now();
while (Date.now() - start < 14 * 60_000) {
  const k = await raw.evaluate(() => window.__kicks);
  const total = k ? Object.values(k).reduce((a, b) => a + b, 0) : 0;
  if (!tookKicks && total >= 2) {
    tookKicks = true;
    await page.getByTestId('match-menu-button').click();
    await page.getByTestId('menu-kick-stats').click();
    await shot('kickstats', 1500);
    await page.getByTestId('kick-stats-close').click();
    await page.waitForTimeout(500);
    const closeMenu = page.getByTestId('menu-close');
    if (await closeMenu.isVisible().catch(() => false)) await closeMenu.click();
  }
  if (await page.getByTestId('win-title').isVisible().catch(() => false)) break;
  await page.waitForTimeout(3000);
}
await page.waitForTimeout(2500);
await shot('win', 500);
console.log('kicks shot', tookKicks);
await browser.close();

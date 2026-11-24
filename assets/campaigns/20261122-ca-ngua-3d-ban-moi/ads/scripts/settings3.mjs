import { chromium } from '/Users/johnny.bui/orca/projects/game-ca-ngua-online/node_modules/@playwright/test/index.mjs';
const base = process.argv[2];
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const ctx = await browser.newContext({ baseURL: base, locale: 'vi-VN', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto('/'); await page.waitForTimeout(8000);
await page.getByTestId('play-now').click();
const gn = page.getByTestId('guest-name');
await gn.waitFor({ timeout: 15000 }).then(async () => { await gn.fill('Johnny'); await page.getByTestId('guest-submit').click(); }).catch(() => {});
await page.getByTestId('greeting').waitFor({ timeout: 30000 });
await page.getByTestId('create-name').fill('Tối nay chơi một ván');
await page.getByTestId('create-submit').click();
await page.getByTestId('seat-list').waitFor();
for (const i of [1, 2, 3]) await page.getByTestId(`add-cpu-${i}`).click();
await page.getByTestId('cpu-level-hard').click();
await page.getByTestId('mode-quick').click();
await page.waitForTimeout(1500);
const targets = [['cpu', 'cpu-level'], ['time', 'game-time'], ['mode', 'mode']];
for (const [name, id] of targets) {
  await page.evaluate((id) => { const el = document.querySelector(`[data-testid=${id}]`); const y = el.getBoundingClientRect().top + window.scrollY; window.scrollTo(0, y - 300); }, id);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `/tmp/shots/s-${name}.png` });
  console.log('shot', name);
}
await browser.close();

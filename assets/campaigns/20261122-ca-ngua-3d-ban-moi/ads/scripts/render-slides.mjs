import { chromium } from '/Users/johnny.bui/orca/projects/game-ca-ngua-online/node_modules/@playwright/test/index.mjs';
const [dir, only] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1700, height: 1500 }, deviceScaleFactor: 2 });
await page.goto('file://' + dir + '/slides.html');
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1500);
const ids = await page.$$eval('.slide', (els) => els.map((e) => e.id));
for (const id of ids) {
  if (only && !only.split(',').includes(id)) continue;
  await page.locator('#' + id).screenshot({ path: `${dir}/exports/${id}.png` });
  console.log('rendered', id);
}
await browser.close();

// usage: node kickwin.mjs <baseUrl> <outDir>
// Mobile, two seats (Johnny + one CPU), quick mode. The player holds a kick for 2.5 s so the "đá ..." prompt is on screen,
// then plays it; frames around the kick and around the finish (fireworks) are saved from a screencast ring buffer.
import { chromium } from '/Users/johnny.bui/orca/projects/game-ca-ngua-online/node_modules/@playwright/test/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const wsBase = base.replace(/^http/, 'ws');
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const ctx = await browser.newContext({ baseURL: base, locale: 'vi-VN', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto('/');
await page.waitForTimeout(8000);
await page.getByTestId('play-now').click();
const gn = page.getByTestId('guest-name');
await gn.waitFor({ timeout: 15000 }).then(async () => { await gn.fill('Johnny'); await page.getByTestId('guest-submit').click(); }).catch(() => {});
await page.getByTestId('greeting').waitFor({ timeout: 30000 });
await page.getByTestId('create-name').fill('Một chọi một');
await page.getByTestId('create-seats').selectOption('2');
await page.getByTestId('create-submit').click();
await page.getByTestId('seat-list').waitFor();
await page.getByTestId('add-cpu-1').click();
await page.getByTestId('cpu-level-easy').click();
await page.getByTestId('mode-quick').click();
await page.getByTestId('start-button').scrollIntoViewIfNeeded();
await page.getByTestId('start-button').click();
await page.getByTestId('hud').waitFor();
const intro = page.getByTestId('quick-intro-ok');
await intro.waitFor({ timeout: 6000 }).then(() => intro.click()).catch(() => {});

const cdp = await ctx.newCDPSession(page);
let frames = [];
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  frames.push({ t: metadata.timestamp, data });
  const cut = metadata.timestamp - 9;
  while (frames.length && frames[0].t < cut) frames.shift();
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1170, maxHeight: 2532, everyNthFrame: 1 });
const dump = (name) => {
  const snap = frames.slice();
  snap.forEach((f, i) => writeFileSync(`${out}/${name}-${String(i).padStart(4, '0')}.jpg`, Buffer.from(f.data, 'base64')));
  console.log('saved', name, snap.length, 'frames');
};

const code = page.url().split('/r/')[1].split(/[?#]/)[0];
const raw = await ctx.newPage();
await raw.goto('/gioi-thieu');
await raw.evaluate(([c, ws]) => new Promise((res) => {
  window.__phase = ''; window.__kicks = 0;
  const sock = new WebSocket(`${ws}/api/rooms/${c}/ws`);
  sock.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.t === 'state' && m.room.game) { window.__phase = m.room.game.phase; window.__kicks = Object.values(m.room.game.kicks ?? {}).reduce((a, b) => a + b, 0); } };
  sock.onopen = () => res();
}), [code, wsBase]);
await page.bringToFront();

let holdUntil = 0;
let kickShown = 0;
let kickSaved = false;
let winSaved = false;
const start = Date.now();
while (Date.now() - start < 13 * 60_000) {
  // roll whenever offered
  await page.evaluate(() => document.querySelector('[data-testid=roll-button]')?.click());
  const buttons = await page.evaluate(() => [...document.querySelectorAll('[data-testid^=move-button-]')].map((b) => ({ id: b.getAttribute('data-testid'), text: b.textContent || '' })));
  if (buttons.length) {
    const kick = buttons.find((b) => /đá/i.test(b.text));
    if (kick && !kickSaved) {
      if (!kickShown) { kickShown = Date.now(); console.log('kick prompt', kick.text); }
      if (Date.now() - kickShown > 2600) {
        await page.screenshot({ path: `${out}/kick-prompt.png` });
        await page.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.click(), kick.id);
        kickSaved = true;
        await page.waitForTimeout(4800);
        dump('kick');
      }
    } else {
      const rank = (b) => (/đá/i.test(b.text) ? 4 : /lên|về/i.test(b.text) ? 3 : /đi (\d+)/.test(b.text) ? 2 : 1);
      const best = buttons.slice().sort((a, b) => rank(b) - rank(a))[0];
      await page.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.click(), best.id);
    }
  }
  const phase = await raw.evaluate(() => window.__phase);
  if (phase === 'finished' && !winSaved) {
    winSaved = true;
    await page.waitForTimeout(2200);
    dump('fireworks');
    await page.getByTestId('win-title').waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/win.png` });
    console.log('win title:', await page.getByTestId('win-title').textContent().catch(() => '?'));
    break;
  }
  await page.waitForTimeout(250);
}
await cdp.send('Page.stopScreencast').catch(() => {});
await browser.close();

// usage: node extra.mjs <baseUrl>
// Mobile host: settings scrolled, join-in-progress flow with a second guest, then a screencast ring buffer saved around the first kick.
import { chromium } from '/Users/johnny.bui/orca/projects/game-ca-ngua-online/node_modules/@playwright/test/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base] = process.argv.slice(2);
const wsBase = base.replace(/^http/, 'ws');
mkdirSync('/tmp/shots', { recursive: true });
mkdirSync('/tmp/kick', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const mk = () => browser.newContext({ baseURL: base, locale: 'vi-VN', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

async function guest(ctx, name) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto('/');
  await page.waitForTimeout(8000);
  await page.getByTestId('play-now').click();
  const gn = page.getByTestId('guest-name');
  await gn.waitFor({ timeout: 15000 }).then(async () => { await gn.fill(name); await page.getByTestId('guest-submit').click(); }).catch(() => {});
  await page.getByTestId('greeting').waitFor({ timeout: 30000 });
  return page;
}
const shotOf = (page, name) => async (wait = 1200) => { await page.waitForTimeout(wait); await page.screenshot({ path: `/tmp/shots/x-${name}.png` }); console.log('shot', name); };

const hostCtx = await mk();
const host = await guest(hostCtx, 'Johnny');
await host.getByTestId('create-name').fill('Tối nay chơi một ván');
await host.getByTestId('create-visibility-public').click();
await host.getByTestId('create-submit').click();
await host.getByTestId('seat-list').waitFor();
for (const i of [1, 2, 3]) await host.getByTestId(`add-cpu-${i}`).click();
await host.waitForTimeout(2000);
// settings, with the heading just under the sticky header
await host.evaluate(() => {
  const el = document.querySelector('[data-testid=game-settings]');
  const y = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo(0, y - 270);
});
await shotOf(host, 'settings-top')(1000);
await host.mouse.wheel(0, 330);
await shotOf(host, 'settings-mid')(1000);
await host.getByTestId('mode-quick').click();
await host.getByTestId('start-button').scrollIntoViewIfNeeded();
await host.getByTestId('start-button').click();
await host.getByTestId('hud').waitFor();
const intro = host.getByTestId('quick-intro-ok');
await intro.waitFor({ timeout: 6000 }).then(() => intro.click()).catch(() => {});
await host.waitForTimeout(3000);
const code = host.url().split('/r/')[1].split(/[?#]/)[0];
console.log('room', code);

// joiner asks to take over a CPU seat
const joinCtx = await mk();
const joiner = await guest(joinCtx, 'Nam').catch((e) => { console.log('joiner guest failed', e.message.slice(0, 80)); return null; });
if (joiner) {
  await joiner.goto(`/r/${code}`);
  await joiner.getByTestId('join-pick').waitFor({ timeout: 20000 });
  await joiner.evaluate(() => document.activeElement && document.activeElement.blur());
  await shotOf(joiner, 'join-pick')(1500);
  await joiner.getByTestId('join-color-2').click();
  await joiner.getByTestId('join-waiting').waitFor();
  await shotOf(joiner, 'join-waiting')(1000);
  await host.getByTestId('join-requests').waitFor({ timeout: 20000 });
  await shotOf(host, 'join-request')(1500);
  await host.getByTestId('join-approve-2').click();
  await shotOf(host, 'join-approved')(1500);
  await shotOf(joiner, 'join-in')(1000);
}

// screencast ring buffer on the host page
const cdp = await hostCtx.newCDPSession(host);
let frames = [];
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  frames.push({ t: metadata.timestamp, data });
  const cut = metadata.timestamp - 9;
  while (frames.length && frames[0].t < cut) frames.shift();
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1170, maxHeight: 2532, everyNthFrame: 1 });
await host.evaluate(() => {
  window.__ap = setInterval(() => {
    document.querySelector('[data-testid=roll-button]')?.click();
    document.querySelector('[data-testid^=move-button-]')?.click();
  }, 40);
});
const raw = await hostCtx.newPage();
await raw.goto('/gioi-thieu');
await raw.evaluate(([c, ws]) => new Promise((res) => {
  window.__kicks = 0;
  const sock = new WebSocket(`${ws}/api/rooms/${c}/ws`);
  sock.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.t === 'state' && m.room.game) window.__kicks = Object.values(m.room.game.kicks ?? {}).reduce((a, b) => a + b, 0); };
  sock.onopen = () => res();
}), [code, wsBase]);
await host.bringToFront();
let seen = 0;
let saved = 0;
const start = Date.now();
while (Date.now() - start < 15 * 60_000 && saved < 2) {
  const k = await raw.evaluate(() => window.__kicks);
  if (k > seen) {
    seen = k;
    await host.waitForTimeout(4200);
    const snap = frames.slice();
    saved += 1;
    snap.forEach((f, i) => writeFileSync(`/tmp/kick/k${saved}-${String(i).padStart(4, '0')}.jpg`, Buffer.from(f.data, 'base64')));
    console.log('saved kick', saved, snap.length, 'frames', (snap.at(-1).t - snap[0].t).toFixed(1), 's');
  }
  await host.waitForTimeout(400);
}
await cdp.send('Page.stopScreencast').catch(() => {});
await browser.close();

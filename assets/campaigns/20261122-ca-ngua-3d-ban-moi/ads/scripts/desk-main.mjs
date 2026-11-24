// usage: node desk-main.mjs <baseUrl> <outDir>
// Desktop 1920x1080: home orbit, create-room flow, the kick prompt and the kick, the kick scoreboard, the finish.
import { openBrowser, signInAsGuest, startRing } from './desk-lib.mjs';

const [base, out] = process.argv.slice(2);
const wsBase = base.replace(/^http/, 'ws');
const { browser, ctx } = await openBrowser(base);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('[page]', e.message));
const ring = await startRing(ctx, page, 60);

await page.goto('/');
await page.getByTestId('play-now').waitFor({ timeout: 60000 });
await page.waitForTimeout(13500); // the home camera turns slowly around the room
ring.dump(out, 'home', 13);

const flowStart = Date.now();
await signInAsGuest(page, 'Johnny');
await page.waitForTimeout(1200);
await page.getByTestId('create-name').fill('');
await page.getByTestId('create-name').pressSequentially('Nhà Ngoại ăn Tết', { delay: 70 });
await page.getByTestId('create-seats').selectOption('2');
await page.getByTestId('create-visibility-public').click();
await page.waitForTimeout(700);
await page.getByTestId('create-submit').click();
await page.getByTestId('seat-list').waitFor();
await page.waitForTimeout(900);
await page.getByTestId('add-cpu-1').click();
await page.waitForTimeout(900);
await page.getByTestId('cpu-level-easy').click();
await page.waitForTimeout(700);
await page.getByTestId('mode-quick').click();
await page.waitForTimeout(1600);
await page.getByTestId('start-button').click();
await page.getByTestId('hud').waitFor();
const intro = page.getByTestId('quick-intro-ok');
await intro.waitFor({ timeout: 6000 }).then(async () => { await page.waitForTimeout(1800); await intro.click(); }).catch(() => {});
await page.waitForTimeout(2500);
ring.dump(out, 'flow', (Date.now() - flowStart) / 1000 + 0.3);

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

let kickShown = 0;
let kickDone = false;
let statsDone = false;
let finished = false;
const start = Date.now();
while (Date.now() - start < 14 * 60_000) {
  await page.evaluate(() => document.querySelector('[data-testid=roll-button]')?.click());
  const buttons = await page.evaluate(() => [...document.querySelectorAll('[data-testid^=move-button-]')].map((b) => ({ id: b.getAttribute('data-testid'), text: b.textContent || '' })));
  if (buttons.length) {
    const kick = buttons.find((b) => /đá/i.test(b.text));
    if (kick && !kickDone) {
      if (!kickShown) { kickShown = Date.now(); console.log('kick prompt', kick.text); }
      if (Date.now() - kickShown > 2400) {
        await page.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.click(), kick.id);
        kickDone = true;
        await page.waitForTimeout(5200);
        ring.dump(out, 'kick', 8.5);
      }
    } else {
      const rank = (b) => (/đá/i.test(b.text) ? 4 : /lên|về/i.test(b.text) ? 3 : /đi (\d+)/.test(b.text) ? 2 : 1);
      const best = buttons.slice().sort((a, b) => rank(b) - rank(a))[0];
      await page.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.click(), best.id);
    }
  }
  const st = await raw.evaluate(() => ({ phase: window.__phase, kicks: window.__kicks }));
  if (kickDone && !statsDone && st.kicks >= 1) {
    statsDone = true;
    await page.waitForTimeout(1500);
    await page.getByTestId('match-menu-button').click();
    await page.waitForTimeout(900);
    await page.getByTestId('menu-kick-stats').click();
    await page.waitForTimeout(2600);
    ring.dump(out, 'kickstats', 5.5);
    await page.getByTestId('kick-stats-close').click();
    await page.waitForTimeout(500);
    const closeMenu = page.getByTestId('menu-close');
    if (await closeMenu.isVisible().catch(() => false)) await closeMenu.click();
  }
  if (st.phase === 'finished' && !finished) {
    finished = true;
    await page.getByTestId('win-title').waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2200);
    ring.dump(out, 'finish', 10);
    console.log('win title:', await page.getByTestId('win-title').textContent().catch(() => '?'));
    break;
  }
  await page.waitForTimeout(250);
}
await ring.stop();
await browser.close();

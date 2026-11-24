// Shared helpers for the desktop (1920x1080) recordings: a screencast ring buffer that is dumped as
// timestamped JPEG frames plus an ffmpeg concat list, so variable frame rates play back in real time.
import { chromium } from '/Users/johnny.bui/orca/projects/game-ca-ngua-online/node_modules/@playwright/test/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

export const VIEWPORT = { width: 1920, height: 1080 };

export async function openBrowser(base) {
  const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
  const ctx = await browser.newContext({ baseURL: base, locale: 'vi-VN', viewport: VIEWPORT, deviceScaleFactor: 1 });
  return { browser, ctx };
}

export async function startRing(ctx, page, windowSeconds = 45) {
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ t: metadata.timestamp, data });
    const cut = metadata.timestamp - windowSeconds;
    while (frames.length && frames[0].t < cut) frames.shift();
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  return {
    /** Writes the last `seconds` of frames to `${out}/${name}` with concat.txt; returns the frame count. */
    dump(out, name, seconds) {
      const dir = `${out}/${name}`;
      mkdirSync(dir, { recursive: true });
      const last = frames.at(-1).t;
      const snap = frames.filter((f) => f.t >= last - seconds);
      let list = '';
      snap.forEach((f, i) => {
        writeFileSync(`${dir}/f${String(i).padStart(5, '0')}.jpg`, Buffer.from(f.data, 'base64'));
        const next = snap[i + 1]?.t ?? f.t + 0.04;
        list += `file 'f${String(i).padStart(5, '0')}.jpg'\nduration ${(next - f.t).toFixed(4)}\n`;
      });
      writeFileSync(`${dir}/concat.txt`, list);
      console.log('dumped', name, snap.length, 'frames', (snap.at(-1).t - snap[0].t).toFixed(1), 's');
      return snap.length;
    },
    stop: () => cdp.send('Page.stopScreencast').catch(() => {}),
  };
}

export async function signInAsGuest(page, name) {
  await page.getByTestId('play-now').click();
  const gn = page.getByTestId('guest-name');
  await gn
    .waitFor({ timeout: 15000 })
    .then(async () => {
      await gn.pressSequentially(name, { delay: 90 });
      await page.getByTestId('guest-submit').click();
    })
    .catch(() => {});
  await page.getByTestId('greeting').waitFor({ timeout: 30000 });
}

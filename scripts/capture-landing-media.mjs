#!/usr/bin/env node
/**
 * Renders the landing page media from the real 3D scene in headless Chromium, so the
 * hero, background, rule illustrations and share card can be regenerated after the scene
 * changes:
 *
 *   public/landing/hero.webm, hero.mp4    looping muted hero clip (scene-dev.html, CPU game)
 *   public/landing/hero-poster.jpg        first frame of the loop, shown before / instead of the clip
 *   public/landing/hero-mobile.jpg        portrait still for narrow screens
 *   public/landing/board-bg.jpg           near top-down board, the page's fixed background
 *   public/landing/rule-*.webp            ra chuồng, đá ngựa, về đích (scripts/landing-capture/stage.html)
 *   public/og-image.jpg                   1200×630 share card
 *
 * Usage: node scripts/capture-landing-media.mjs [--url http://127.0.0.1:5190] [--only hero,hero-mobile,background,og,rules]
 * Without --url it starts its own Vite dev server on port 5190. Needs ffmpeg with libvpx-vp9,
 * libx264 and libwebp on PATH, and the Playwright Chromium (`npx playwright install chromium`).
 * Headless Chromium must get a hardware WebGL context: on SwiftShader the scene drops to its
 * low tier and the media look flat, so the script stops.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'public/landing');
const PORT = 5190;

const HERO_SIZE = { width: 1280, height: 720 };
const HERO_SECONDS = 7.5;
/** Seconds of the clip's tail cross-faded into its head so the loop has no visible cut. */
const LOOP_FADE = 0.6;
/** Game steps fast-forwarded before recording, so the board is mid-game rather than all in stables. */
const WARMUP_STEPS = 70;

const HIDE_LABELS = '[data-testid^="horse-label-"] { display: none !important; }';
/** The scene-dev toolbar is the first child of the harness column. */
const HIDE_DEV_BAR = '#root > div > div:first-child { display: none !important; }';

const args = process.argv.slice(2);
const urlArg = args.indexOf('--url');
let baseUrl = urlArg >= 0 ? args[urlArg + 1] : null;

function ffmpeg(...ffArgs) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...ffArgs], { stdio: 'inherit' });
}

function kb(path) {
  return `${(statSync(path).size / 1024).toFixed(0)} KB`;
}

async function startServer() {
  const { createServer } = await import('vite');
  const server = await createServer({ root: ROOT, logLevel: 'warn', server: { port: PORT, strictPort: true } });
  await server.listen();
  return server;
}

async function openScene(browser, path, viewport, deviceScaleFactor = 1, css = HIDE_LABELS) {
  const page = await browser.newPage({ viewport, deviceScaleFactor });
  page.on('pageerror', (err) => console.error(`[page] ${err.message}`));
  await page.goto(new URL(path, baseUrl).href);
  await page.addStyleTag({ content: css });
  await page.locator('[data-testid="game-scene"] canvas').waitFor();
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  if (/swiftshader|llvmpipe/i.test(renderer)) throw new Error(`Software WebGL (${renderer}): run on a machine with a GPU.`);
  // Models, environment and the first shadow pass settle.
  await page.waitForTimeout(4000);
  return page;
}

/**
 * scene-dev.html: plays its CPU game at the fastest pace until `steps` moves are played, then at
 * `delayMs` (or pauses it when `delayMs` is null), and hides the harness toolbar so the scene fills the page.
 */
async function warmUp(page, steps, delayMs) {
  const pace = page.locator('input[type=range]');
  await pace.fill('5');
  await page.waitForFunction((n) => Number(document.querySelector('#status')?.getAttribute('data-seq')) >= n, steps, { timeout: 60_000 });
  if (delayMs === null) await page.getByLabel('Tạm dừng').check();
  else await pace.fill(String(delayMs));
  await page.addStyleTag({ content: HIDE_DEV_BAR });
  // Pending animations finish and the canvas resizes to the full page.
  await page.waitForTimeout(2000);
}

/** Collects screencast frames with their capture time until `stop` resolves. */
async function screencast(page, stop, maxWidth, maxHeight) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ data: Buffer.from(data, 'base64'), t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth, maxHeight, everyNthFrame: 1 });
  await stop();
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  return frames;
}

/** Writes frames as a constant 30 fps clip, keeping each frame on screen for as long as it was captured. */
function framesToClip(captured, dir, out, size) {
  // Drop empty or out-of-order frames: either makes the concat list unreadable.
  const frames = captured.filter((f, i) => f.data.length > 0 && Number.isFinite(f.t) && (i === 0 || f.t > captured[i - 1].t));
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    const file = join(dir, `f${String(i).padStart(5, '0')}.jpg`);
    writeFileSync(file, f.data);
    const next = frames[i + 1];
    lines.push(`file '${file}'`, `duration ${next ? (next.t - f.t).toFixed(4) : '0.0333'}`);
  });
  lines.push(`file '${join(dir, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`);
  const list = join(dir, 'frames.txt');
  writeFileSync(list, `${lines.join('\n')}\n`);
  const vf = `scale=${size.width}:${size.height},fps=30,format=yuv420p`;
  ffmpeg('-f', 'concat', '-safe', '0', '-i', list, '-vf', vf, '-c:v', 'libx264', '-crf', '10', '-preset', 'veryfast', out);
}

async function captureHero(browser, work) {
  const page = await openScene(browser, '/scene-dev.html?quality=high', HERO_SIZE);
  await warmUp(page, WARMUP_STEPS, 450);
  const frames = await screencast(page, () => page.waitForTimeout(HERO_SECONDS * 1000), HERO_SIZE.width, HERO_SIZE.height);
  await page.close();
  if (frames.length < HERO_SECONDS * 20) throw new Error(`Only ${frames.length} frames captured; the GPU is too slow for a smooth clip.`);

  const raw = join(work, 'hero-raw.mp4');
  framesToClip(frames, work, raw, HERO_SIZE);
  // Loop: the clip starts at LOOP_FADE and ends on its own frame at LOOP_FADE, the tail fading into the head.
  const loop = join(work, 'hero-loop.mp4');
  const body = HERO_SECONDS - LOOP_FADE;
  ffmpeg(
    '-i', raw,
    '-filter_complex',
    `[0]trim=start=${LOOP_FADE}:end=${HERO_SECONDS},setpts=PTS-STARTPTS[a];[0]trim=end=${LOOP_FADE},setpts=PTS-STARTPTS[b];` +
      `[a][b]xfade=transition=fade:duration=${LOOP_FADE}:offset=${body - LOOP_FADE},format=yuv420p[v]`,
    '-map', '[v]', '-c:v', 'libx264', '-crf', '10', '-preset', 'veryfast', loop,
  );

  const webm = join(OUT, 'hero.webm');
  const mp4 = join(OUT, 'hero.mp4');
  ffmpeg('-i', loop, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '33', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', webm);
  ffmpeg('-i', loop, '-an', '-c:v', 'libx264', '-crf', '25', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4);
  const poster = join(OUT, 'hero-poster.jpg');
  ffmpeg('-i', loop, '-frames:v', '1', '-q:v', '4', poster);
  console.log(`hero.webm ${kb(webm)}, hero.mp4 ${kb(mp4)}, hero-poster.jpg ${kb(poster)}`);
}

async function captureMobileHero(browser) {
  const page = await openScene(browser, '/scene-dev.html?quality=high', { width: 430, height: 860 }, 2);
  await warmUp(page, WARMUP_STEPS, null);
  encodeImage(await page.screenshot({ type: 'png' }), join(OUT, 'hero-mobile.jpg'), 'scale=780:-2:flags=lanczos', JPEG(6));
  await page.close();
}

/** Writes PNG or JPEG bytes through ffmpeg with an optional filter (crop in device pixels, scale). */
function encodeImage(bytes, out, filter, codec) {
  const work = mkdtempSync(join(tmpdir(), 'landing-img-'));
  const src = join(work, bytes[0] === 0xff ? 'src.jpg' : 'src.png');
  writeFileSync(src, bytes);
  ffmpeg('-i', src, ...(filter ? ['-vf', filter] : []), ...codec, out);
  rmSync(work, { recursive: true, force: true });
  console.log(`${out.slice(ROOT.length + 1)} ${kb(out)}`);
}

const JPEG = (q) => ['-q:v', String(q)];
const WEBP = ['-c:v', 'libwebp', '-quality', '78', '-compression_level', '6'];

async function captureBackground(browser) {
  const viewport = { width: 1600, height: 1000 };
  const page = await openScene(browser, '/scene-dev.html?quality=high', viewport);
  await warmUp(page, WARMUP_STEPS + 30, null);
  // Orbit up toward a top-down view: dragging down raises the camera.
  await page.mouse.move(800, 400);
  await page.mouse.down();
  await page.mouse.move(800, 900, { steps: 25 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  encodeImage(await page.screenshot({ type: 'png' }), join(OUT, 'board-bg.jpg'), null, JPEG(8));
  await page.close();
}

const OG_OVERLAY = `
  @font-face { font-family: 'Playfair Display'; font-weight: 600 800; src: url('/fonts/playfair-display-vietnamese.woff2') format('woff2');
    unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB; }
  @font-face { font-family: 'Playfair Display'; font-weight: 600 800; src: url('/fonts/playfair-display-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+2000-206F; }
  @font-face { font-family: 'Be Vietnam Pro'; font-weight: 600; src: url('/fonts/be-vietnam-pro-600-vietnamese.woff2') format('woff2');
    unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB; }
  @font-face { font-family: 'Be Vietnam Pro'; font-weight: 600; src: url('/fonts/be-vietnam-pro-600-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+2000-206F; }
  #og-card { position: fixed; inset: 0; z-index: 10; pointer-events: none; display: flex; flex-direction: column; justify-content: flex-end;
    padding: 0 64px 52px; background: linear-gradient(180deg, rgb(13 8 6 / 0%) 38%, rgb(13 8 6 / 82%) 78%, rgb(13 8 6 / 92%)); }
  #og-card h1 { margin: 0; font: 800 64px/1.05 'Playfair Display', serif; color: #f5ead2; text-shadow: 0 2px 18px rgb(0 0 0 / 60%); }
  #og-card h1 span { color: #e6c27a; }
  #og-card p { margin: 14px 0 0; font: 600 26px/1.3 'Be Vietnam Pro', sans-serif; color: #d9c9aa; letter-spacing: 0.01em; }
  #og-card i { display: inline-block; width: 64px; height: 4px; margin-bottom: 22px; border-radius: 4px; background: linear-gradient(90deg, #b8281f, #e6c27a); }
`;

async function captureOgImage(browser) {
  const page = await openScene(browser, '/scene-dev.html?quality=high', { width: 1200, height: 630 }, 2, HIDE_LABELS + OG_OVERLAY);
  await warmUp(page, WARMUP_STEPS + 15, null);
  await page.evaluate(async () => {
    const card = document.createElement('div');
    card.id = 'og-card';
    card.innerHTML = '<i></i><h1>Cờ cá ngựa <span>online 3D</span></h1><p>Đúng luật Việt Nam · Mở link là chơi, không cần tải</p>';
    document.body.append(card);
    await document.fonts.ready;
  });
  await page.waitForTimeout(300);
  encodeImage(await page.screenshot({ type: 'png' }), join(ROOT, 'public/og-image.jpg'), 'scale=1200:630:flags=lanczos', JPEG(4));
  await page.close();
}

const STAGE_VIEWPORT = { width: 1600, height: 1000 };

/**
 * ffmpeg crop around the staged move, as fractions of the frame so it holds for screenshots
 * (device pixels) and screencast frames (CSS pixels) alike.
 */
function stageCrop(focus) {
  const w = 720;
  const h = 540;
  const x = Math.min(STAGE_VIEWPORT.width - w, Math.max(0, focus.x - w / 2)) / STAGE_VIEWPORT.width;
  const y = Math.min(STAGE_VIEWPORT.height - h, Math.max(0, focus.y - h / 2 - 40)) / STAGE_VIEWPORT.height;
  const fw = w / STAGE_VIEWPORT.width;
  const fh = h / STAGE_VIEWPORT.height;
  return `crop=w=iw*${fw}:h=ih*${fh}:x=iw*${x.toFixed(4)}:y=ih*${y.toFixed(4)},scale=800:600:flags=lanczos`;
}

/** Seconds before the animation ends at which the đá ngựa frame is taken: the kicked horse is mid-flight. */
const KICK_FRAME_BEFORE_END = 0.17;

async function captureRule(browser, stage) {
  const dpr = 2;
  const page = await openScene(browser, `/scripts/landing-capture/stage.html?stage=${stage}&quality=high`, STAGE_VIEWPORT, dpr);
  const focus = await page.evaluate(() => window.__stage.focus());
  const out = join(OUT, `rule-${stage}.webp`);
  if (stage === 'da-ngua') {
    let end = 0;
    const frames = await screencast(
      page,
      async () => {
        await page.evaluate(() => window.__stage.play());
        await page.waitForFunction(() => document.body.dataset.busy === '1');
        await page.waitForFunction(() => document.body.dataset.busy === '0');
        end = Date.now() / 1000;
      },
      STAGE_VIEWPORT.width * dpr,
      STAGE_VIEWPORT.height * dpr,
    );
    const target = end - KICK_FRAME_BEFORE_END;
    const frame = frames.reduce((best, f) => (Math.abs(f.t - target) < Math.abs(best.t - target) ? f : best));
    encodeImage(frame.data, out, stageCrop(focus), WEBP);
  } else {
    await page.evaluate(() => window.__stage.play());
    await page.waitForFunction(() => document.body.dataset.busy === '1');
    await page.waitForFunction(() => document.body.dataset.busy === '0');
    await page.waitForTimeout(600);
    encodeImage(await page.screenshot({ type: 'png' }), out, stageCrop(focus), WEBP);
  }
  await page.close();
}

mkdirSync(OUT, { recursive: true });
const server = baseUrl ? null : await startServer();
baseUrl ??= `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({
  args: ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])],
});
const work = mkdtempSync(join(tmpdir(), 'landing-capture-'));
const jobs = {
  hero: () => captureHero(browser, work),
  'hero-mobile': () => captureMobileHero(browser),
  background: () => captureBackground(browser),
  og: () => captureOgImage(browser),
  rules: async () => {
    for (const stage of ['ra-chuong', 'da-ngua', 've-dich']) await captureRule(browser, stage);
  },
};
const onlyArg = args.indexOf('--only');
const selected = onlyArg >= 0 ? args[onlyArg + 1].split(',') : Object.keys(jobs);
try {
  for (const name of selected) {
    const job = jobs[name];
    if (!job) throw new Error(`Unknown job ${name}; pick from ${Object.keys(jobs).join(', ')}`);
    await job();
  }
} finally {
  rmSync(work, { recursive: true, force: true });
  await browser.close();
  await server?.close();
}

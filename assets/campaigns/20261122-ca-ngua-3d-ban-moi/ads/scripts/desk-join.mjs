// usage: node desk-join.mjs <baseUrl> <outDir>
// Desktop 1920x1080: Nam asks to take a CPU seat of a running game, Johnny (host) approves.
import { openBrowser, signInAsGuest, startRing } from './desk-lib.mjs';

const [base, out] = process.argv.slice(2);
const host = await openBrowser(base);
const hp = await host.ctx.newPage();
hp.on('pageerror', (e) => console.error('[host]', e.message));
await hp.goto('/');
await hp.getByTestId('play-now').waitFor({ timeout: 60000 });
await hp.waitForTimeout(6000);
await signInAsGuest(hp, 'Johnny');
await hp.getByTestId('create-name').fill('Tối nay chơi một ván');
await hp.getByTestId('create-visibility-public').click();
await hp.getByTestId('create-submit').click();
await hp.getByTestId('seat-list').waitFor();
for (const i of [1, 2, 3]) await hp.getByTestId(`add-cpu-${i}`).click();
await hp.getByTestId('mode-quick').click();
await hp.getByTestId('start-button').click();
await hp.getByTestId('hud').waitFor();
const intro = hp.getByTestId('quick-intro-ok');
await intro.waitFor({ timeout: 6000 }).then(() => intro.click()).catch(() => {});
await hp.waitForTimeout(3000);
const code = hp.url().split('/r/')[1].split(/[?#]/)[0];
const ring = await startRing(host.ctx, hp, 30);

const guest = await openBrowser(base);
const gp = await guest.ctx.newPage();
await gp.goto('/');
await gp.getByTestId('play-now').waitFor({ timeout: 60000 });
await gp.waitForTimeout(5000);
await signInAsGuest(gp, 'Nam');
await gp.goto(`/r/${code}`);
await gp.getByTestId('join-pick').waitFor({ timeout: 20000 });
await gp.waitForTimeout(800);
await gp.getByTestId('join-color-2').click();
await hp.bringToFront();
await hp.getByTestId('join-requests').waitFor({ timeout: 20000 });
await hp.waitForTimeout(2600);
await hp.getByTestId('join-approve-2').click();
await hp.waitForTimeout(3000);
ring.dump(out, 'join', 9);
await ring.stop();
await host.browser.close();
await guest.browser.close();

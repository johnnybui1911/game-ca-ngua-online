/** Runs the e2e suite once per server environment; both use port 5173, so they run in sequence. */
import { spawnSync } from 'node:child_process';

for (const mode of ['none', 'mock']) {
  console.log(`\n== e2e: ${mode} ==`);
  const res = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, E2E_ENV: mode },
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

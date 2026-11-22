import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Public landing page, a separate static entry served at this path. */
const LANDING_PATH = '/gioi-thieu';

/**
 * Dev only: serve the landing entry at its clean path. In production, Workers static
 * assets map `/gioi-thieu` to `gioi-thieu.html` by themselves; the old `/co-ca-ngua-online`
 * address is redirected by the worker (`worker/index.ts`).
 */
function landingDevPath(): Plugin {
  return {
    name: 'landing-dev-path',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path, query] = (req.url ?? '').split('?');
        if (path === LANDING_PATH) req.url = `${LANDING_PATH}.html${query ? `?${query}` : ''}`;
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [landingDevPath(), react(), cloudflare()],
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: {
            app: resolve(import.meta.dirname, 'index.html'),
            landing: resolve(import.meta.dirname, 'gioi-thieu.html'),
          },
        },
      },
    },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
});

import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Public static pages, each a separate entry served at its clean path. */
const STATIC_PAGES = ['/gioi-thieu', '/chinh-sach-bao-mat', '/dieu-khoan'];

/**
 * Dev only: serve the static entries at their clean paths. In production, Workers static
 * assets map `/gioi-thieu` to `gioi-thieu.html` (and likewise for the others) by themselves;
 * the old `/co-ca-ngua-online` address is redirected by the worker (`worker/index.ts`).
 */
function staticPagesDevPath(): Plugin {
  return {
    name: 'static-pages-dev-path',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path, query] = (req.url ?? '').split('?');
        if (path !== undefined && STATIC_PAGES.includes(path)) req.url = `${path}.html${query ? `?${query}` : ''}`;
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [staticPagesDevPath(), react(), cloudflare()],
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: {
            app: resolve(import.meta.dirname, 'index.html'),
            landing: resolve(import.meta.dirname, 'gioi-thieu.html'),
            privacy: resolve(import.meta.dirname, 'chinh-sach-bao-mat.html'),
            terms: resolve(import.meta.dirname, 'dieu-khoan.html'),
          },
        },
      },
    },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
});

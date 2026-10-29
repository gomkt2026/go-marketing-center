import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 本機 Vite 不會讀 `_redirects`。/showcase/ 要直接給靜態展示書，不要掉進登入頁。 */
function showcaseStatic() {
  return {
    name: 'showcase-static',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
      server.middlewares.use((req, _res, next) => {
        const path = req.url?.split('?')[0];
        if (path === '/showcase' || path === '/showcase/') req.url = '/showcase/index.html';
        else if (path === '/showcase/admin') req.url = '/showcase/admin.html';
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [showcaseStatic(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
    },
  },
});

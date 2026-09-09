import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Relative base so the built app works at any path — GitHub Pages project
// sites (…/news-dashboard/), a local Express server (/), or vite preview.
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10))
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/data': 'http://localhost:3000'
    }
  }
});

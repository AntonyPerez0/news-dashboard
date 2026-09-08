import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Relative base so the built app works at any path — GitHub Pages project
// sites (…/news-dashboard/), a local Express server (/), or vite preview.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/data': 'http://localhost:3000'
    }
  }
});

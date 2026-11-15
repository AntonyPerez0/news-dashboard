import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

function git(args: string, fallback: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback;
  } catch {
    return fallback; // built from a tarball, no git
  }
}

// Build identity = the commit, not the clock: the scheduled deploys rebuild
// the same commit many times a day and must not look like new releases.
const buildId = git('rev-parse --short=12 HEAD', 'dev');
const buildTime = Number(git('log -1 --format=%ct', '0')) * 1000;

/** Publishes the build identity next to the app so a running tab can tell
 *  when a newer build has been deployed (see src/update.ts). */
function versionJson(): Plugin {
  return {
    name: 'version-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ build: buildId, time: buildTime })
      });
    }
  };
}

// Relative base so the built app works at any path — GitHub Pages project
// sites (…/news-dashboard/), a local Express server (/), or vite preview.
export default defineConfig({
  base: './',
  plugins: [react(), versionJson()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    __BUILD_ID__: JSON.stringify(buildId),
    __BUILD_TIME__: JSON.stringify(buildTime)
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/data': 'http://localhost:3000'
    }
  }
});

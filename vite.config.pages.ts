import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import baseConfig from './vite.config.base';

// GitHub Pages serves project sites from a sub-path (e.g. https://user.github.io/FM-2D/),
// so every built asset reference must be prefixed with the repository base URL.
// The base is resolved from the repository name (GITHUB_REPOSITORY) and can be
// overridden with GITHUB_PAGES_BASE.
const repoBase = (): string => {
  if (process.env.GITHUB_PAGES_BASE) {
    return `/${process.env.GITHUB_PAGES_BASE.replace(/^\/+|\/+$/g, '')}/`;
  }

  const repository = process.env.GITHUB_REPOSITORY || 'CarlosDimare/FM-2D';
  const name = repository.split('/')[1] || 'FM-2D';

  // A repository named `<owner>.github.io` is published at the domain root.
  return name.endsWith('.github.io') ? '/' : `/${name}/`;
};

// Mock virtual:pwa-register for Pages builds (no service worker on static Pages)
const mockPwaRegister = () => ({
  name: 'mock-pwa-register',
  resolveId(id: string) {
    if (id === 'virtual:pwa-register') return id;
  },
  load(id: string) {
    if (id === 'virtual:pwa-register') {
      return `export function registerSW() { console.log('[PWA] SW registration skipped on Pages'); }`;
    }
  },
});

export default defineConfig(() => ({
  ...baseConfig,
  base: repoBase(),
  plugins: [react(), tailwindcss(), mockPwaRegister()],
}));

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import baseConfig from './vite.config.base';

// Plugins declared by the base config that must not run for static GitHub Pages
// builds. `vite-plugin-pwa` needs the virtual module `virtual:pwa-register`
// (unused by the Pages entrypoint) and its manifest assumes a root deployment.
const PAGES_EXCLUDED_PLUGINS = new Set(['vite-plugin-pwa']);

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

export default defineConfig(() => ({
  ...baseConfig,
  base: repoBase(),
  plugins: [react(), tailwindcss()],
}));

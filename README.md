# FM Argentina — Simulador Táctico de Fútbol 2D

Simulador de gestión futbolística con motor de partidos 2D, pizarra táctica en vivo y analítica avanzada.

## Desarrollo

```bash
bun install
bun run dev      # http://localhost:3000
bun run lint     # tsc --noEmit
```

## Despliegue en GitHub Pages

Publicación automática con GitHub Actions (`.github/workflows/deploy-pages.yml`) cada vez que se hace push a `main`.

1. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Hacer push a `main`. El workflow compila con `bun run build:pages` y publica el directorio `dist`.
3. La URL final es `https://<usuario>.github.io/<repo>/`.

Build local equivalente (el sub-path se deduce de `GITHUB_REPOSITORY`):

```bash
GITHUB_REPOSITORY=CarlosDimare/FM-2D bun run build:pages
```

### Detalles del build de Pages

- `vite.config.pages.ts` define `base` a partir del nombre del repositorio (`/FM-2D/`).
  Se puede sobrescribir con `GITHUB_PAGES_BASE` o usando un repo llamado `<usuario>.github.io`.
- El PWA (`vite-plugin-pwa` + service worker) está deshabilitado en este build: asume
  despliegue en la raíz del dominio y requiere el módulo virtual `virtual:pwa-register`,
  que el entrypoint de Pages no utiliza.
- Las rutas de recursos usan `import.meta.env.BASE_URL` para funcionar bajo el sub-path:
  `src/data/convertedDataLoader.ts`, `src/services/notifications.ts` y `src/index.css`.

## Scripts

| Script | Descripción |
| --- | --- |
| `bun run dev` | Servidor de desarrollo (puerto 3000) |
| `bun run build` | Build normal (PWA, despliegue en raíz) |
| `bun run build:pages` | Build estático para GitHub Pages |
| `bun run preview` | Previsualiza el build |
| `bun run lint` | Chequeo de tipos |
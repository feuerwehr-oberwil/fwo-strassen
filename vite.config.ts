import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { readRegion } from './cli/region.ts'
import { fillPage, manifest } from './cli/site.ts'
import { publicConfig } from './src/region.ts'

// `vite build` writes the town-independent app to app/ – index.html keeps its %PLACEHOLDERS% and
// there is no data. `strassen-trainer build` (cli/site.ts) turns it into a site for one town;
// `pnpm build` does both for Oberwil (region.json, data/).

/**
 * Dev server only: index.html, manifest and config.json for this repo's region.json, so the
 * running app looks like the built one. The town data itself is served from ./data/ as is.
 */
function devRegion(): Plugin {
  const region = readRegion(fileURLToPath(new URL('region.json', import.meta.url)))
  const routes: Record<string, { body: string; type: string } | undefined> = {
    '/manifest.webmanifest': { body: manifest(region), type: 'application/manifest+json' },
    '/data/config.json': { body: JSON.stringify(publicConfig(region)), type: 'application/json' },
  }
  return {
    name: 'dev-region',
    apply: 'serve',
    transformIndexHtml: (html) => fillPage(html, region, './data/'),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const route = routes[req.url?.split('?')[0] ?? '']
        if (!route) return next()
        res.setHeader('Content-Type', route.type)
        res.end(route.body)
      })
    },
  }
}

// Relative base so the build works under any path (GitHub Pages project sites, subfolders).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), devRegion()],
  // maplibre alone is ~1 MB; one chunk is fine for a single-screen app
  build: { outDir: 'app', chunkSizeWarningLimit: 1500 },
})

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import region from './region.json'
import { messages } from './src/i18n/messages'

const page = messages[region.language].page
const title = page.title(region.name)
const manifest = JSON.stringify({
  name: title,
  short_name: page.shortName,
  description: page.description(region.name, region.brand),
  lang: region.language,
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#f5f5f4',
  theme_color: '#f5f5f4',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
})

/** Fills index.html's %TITLE% / %SHORT_NAME% / %LANG% and serves (dev) or emits (build) the web manifest, from region.json. */
function regionPage(): Plugin {
  return {
    name: 'region-page',
    transformIndexHtml: (html) =>
      html
        .replaceAll('%TITLE%', title)
        .replaceAll('%SHORT_NAME%', page.shortName)
        .replaceAll('%LANG%', region.language),
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(manifest)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest })
    },
  }
}

// Relative base so the build works under any GitHub Pages path.
export default defineConfig({
  base: './',
  // the app's language (src/i18n), so only that dictionary is bundled
  define: { __LANGUAGE__: JSON.stringify(region.language) },
  plugins: [react(), tailwindcss(), regionPage()],
  // maplibre alone is ~1 MB, the town data and truck routes ~200 KB (routes gzip to ~5 KB);
  // one chunk is fine for a single-screen app
  build: { chunkSizeWarningLimit: 1700 },
})

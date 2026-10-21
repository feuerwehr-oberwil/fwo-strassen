import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works under any GitHub Pages path.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // maplibre alone is ~1 MB, the town data and truck routes ~200 KB (routes gzip to ~5 KB);
  // one chunk is fine for a single-screen app
  build: { chunkSizeWarningLimit: 1700 },
})

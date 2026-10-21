import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works under any GitHub Pages path.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // maplibre alone is ~1 MB; one chunk is fine for a single-screen app
  build: { chunkSizeWarningLimit: 1500 },
})

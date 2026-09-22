import { defineConfig } from 'vite';

export default defineConfig({
  // no HMR/auto-reload: pages are reloaded explicitly (several tools edit files concurrently)
  server: { port: 5173, strictPort: true, hmr: false },
  preview: { port: 4173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 4096 },
  worker: { format: 'es' },
});

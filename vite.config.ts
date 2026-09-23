import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** dev only: POST /__shot?name=x with a PNG body saves it as tmp/shots/x.png (page captures while the tab is hidden) */
function shots(): Plugin {
  return {
    name: 'dev-shots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') return void res.end();
        const name = (new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'shot').replace(/[^\w-]/g, '_');
        const parts: Buffer[] = [];
        req.on('data', (d: Buffer) => parts.push(d));
        req.on('end', () => {
          const dir = resolve(__dirname, 'tmp/shots');
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, name + '.png'), Buffer.concat(parts));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  // no HMR/auto-reload: pages are reloaded explicitly (several tools edit files concurrently)
  server: { port: 5173, strictPort: true, hmr: false },
  preview: { port: 4173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 4096 },
  worker: { format: 'es' },
  plugins: [shots()],
});

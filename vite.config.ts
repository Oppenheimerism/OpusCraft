import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { attachRelay, relayLimits } from './scripts/relay.mjs';
import * as NET from './src/net/config.ts';

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

/**
 * build only: __BUILD_ID__ (net/config.ts), a hash of every file under src/, so a multiplayer host and guest can tell
 * they run the same game (the dev server and the tests go without: 'dev')
 */
function buildId(): Plugin {
  const hash = createHash('sha256');
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else hash.update(p.slice(__dirname.length)).update(readFileSync(p));
    }
  };
  return {
    name: 'build-id',
    apply: 'build',
    config() {
      walk(resolve(__dirname, 'src'));
      return { define: { __BUILD_ID__: JSON.stringify(hash.digest('hex').slice(0, 16)) } };
    },
  };
}

/**
 * the multiplayer relay at /__mp (scripts/relay.mjs): on the preview server (npm run preview on this computer; npm run
 * lan, the one command that opens it to the network) and the dev server (this computer only), with the game's limits
 */
function relay(): Plugin {
  const limits = relayLimits(NET);
  return {
    name: 'mp-relay',
    configureServer(server) {
      // (not when there's no server of its own: the tests' module loader)
      if (server.httpServer) attachRelay(server.httpServer, { ...limits, allowedHosts: server.config.server.allowedHosts, log: (s: string) => server.config.logger.info(s) });
    },
    configurePreviewServer(server) {
      // (scripts/lan.mjs says whether friends come in through a tunnel)
      attachRelay(server.httpServer, { ...limits, allowedHosts: server.config.preview.allowedHosts, tunnel: process.env.MC_LAN_TUNNEL === '1', log: (s: string) => server.config.logger.info(s) });
    },
  };
}

export default defineConfig({
  // no HMR/auto-reload: pages are reloaded explicitly (several tools edit files concurrently)
  server: { port: 5173, strictPort: true, hmr: false },
  preview: { port: 4173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 4096 },
  worker: { format: 'es' },
  plugins: [shots(), buildId(), relay()],
});

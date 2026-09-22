// Load TS modules from src via Vite's SSR loader (no dev server / no HMR socket,
// so several scripts can run concurrently).
import { createServer } from 'vite';
export async function loadModules(paths) {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const mods = [];
  for (const p of paths) mods.push(await server.ssrLoadModule(p));
  return { mods, close: () => server.close() };
}

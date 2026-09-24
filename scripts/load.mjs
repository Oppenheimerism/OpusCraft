// Load TS modules from src via Vite's SSR loader (no dev server / no HMR socket,
// so several scripts can run concurrently). The project is the current directory, or VITE_ROOT if set.
import { createServer } from 'vite';
export async function loadModules(paths) {
  const server = await createServer({
    root: process.env.VITE_ROOT || process.cwd(),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const mods = [];
  for (const p of paths) mods.push(await server.ssrLoadModule(p));
  return { mods, close: () => server.close() };
}

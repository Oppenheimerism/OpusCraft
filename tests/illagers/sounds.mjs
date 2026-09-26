// Generates every Stage 4 sound once per take and checks it's finite and audible (node tests/illagers/sounds.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules(['/src/audio/gen/illagers.ts']);
const all = mods[0].illagerSounds();
let fails = 0;
for (const [name, g] of Object.entries(all)) {
  for (let v = 0; v < g.variants; v++) {
    const t0 = Date.now();
    const b = g.generate(v, 44100);
    let pk = 0, bad = false;
    for (const x of b) { if (!Number.isFinite(x)) bad = true; pk = Math.max(pk, Math.abs(x)); }
    const ok = !bad && pk > 0.1 && b.length > 1000;
    if (!ok) fails++;
    if (!ok || v === 0) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}#${v} ${(b.length / 44100).toFixed(2)}s peak ${pk.toFixed(2)} ${Date.now() - t0}ms`);
  }
}
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

import { loadModules } from './load.mjs';
import { writePNG } from './png.mjs';
const { mods: [blocksMod, genMod, blockMod, biomesMod], close } = await loadModules(['/src/world/blocks.ts', '/src/world/gen/generator.ts', '/src/world/block.ts', '/src/world/gen/biomes.ts']);
const seed = process.argv[2] ?? 'test';
const R = +(process.argv[3] ?? 6);
const gen = new genMod.ChunkGenerator(seed);
const N = R * 2;
const W = N * 16;
const img = new Uint8Array(W * W * 4);
const times = [];
const counts = {};
const { BLOCKS, STATE_BLOCK } = blockMod;
const MIN_Y = -64;
for (let cz = -R; cz < R; cz++) for (let cx = -R; cx < R; cx++) {
  const t0 = performance.now();
  const out = gen.generate(cx, cz);
  times.push(performance.now() - t0);
  for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
    let y = 319;
    let st = 0;
    for (; y >= MIN_Y; y--) { st = out.blocks[((y - MIN_Y) << 8) | (lz << 4) | lx]; if (st !== 0) break; }
    const name = BLOCKS[STATE_BLOCK[st]].name;
    counts[name] = (counts[name] || 0) + 1;
    const b = biomesMod.BIOMES[out.biomes[(lz << 4) | lx]];
    let col = { water: [50, 90, 200], grass_block: null, sand: [219, 207, 163], stone: [125, 125, 125], snow: [240, 240, 250], snow_block: [240,240,250], gravel: [130,125,125], ice: [150,180,240] }[name];
    if (col === null || col === undefined) {
      const g = name.includes('leaves') ? b.foliage : b.grass;
      col = name === 'grass_block' || name.includes('leaves') || name.includes('grass') || name.includes('fern') ? [(g >> 16) & 255, (g >> 8) & 255, g & 255] : [160, 110, 70];
      if (name.includes('leaves')) col = col.map(v => v * 0.7);
      if (name.includes('log')) col = [100, 80, 50];
    }
    const shade = 0.6 + Math.max(0, Math.min(1, (y - 40) / 120)) * 0.6;
    const px = (cx + R) * 16 + lx, pz = (cz + R) * 16 + lz;
    const i = (pz * W + px) * 4;
    img[i] = Math.min(255, col[0] * shade); img[i + 1] = Math.min(255, col[1] * shade); img[i + 2] = Math.min(255, col[2] * shade); img[i + 3] = 255;
  }
}
times.sort((a, b) => a - b);
console.log('chunks', times.length, 'median ms', times[times.length >> 1].toFixed(1), 'p90', times[Math.floor(times.length * 0.9)].toFixed(1), 'first', times[0].toFixed(1));
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => `${k}:${v}`).join(' '));
writePNG(process.argv[4] ?? 'tmp/map.png', W, W, img);
await close();

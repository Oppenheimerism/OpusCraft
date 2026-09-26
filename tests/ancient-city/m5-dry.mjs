// M5: the deep dark is dry. Vanilla's aquifers hold no water or lava where the deep dark can be
// (NoiseBasedAquifer.computeSurfaceLevel asks OverworldBiomeBuilder.isDeepDarkRegion: erosion < -0.225 and
// depth > 0.9), so only the lava sea below y -54 reaches it. Without that rule every ancient city had sheets of water
// and lava hanging from its ceiling where its buildings had been cut out of flooded rock.
// Run: node tests/ancient-city/m5-dry.mjs

import { check, exitWithStatus } from './lib.mjs';
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/gen/generator.ts', '/src/world/gen/ancientCity.ts', '/src/world/gen/aquifer.ts', '/src/world/gen/router.ts',
  '/src/world/block.ts', '/src/world/constants.ts', '/src/world/gen/biomes.ts',
]);
const m = {};
for (const mod of mods) Object.assign(m, mod);
const name = (st) => m.BLOCKS[m.STATE_BLOCK[st]].name;

const cityStubs = (gen, n) => {
  const out = [];
  for (let r = 0; r < 6 && out.length < n; r++)
    for (let rx = -r; rx <= r && out.length < n; rx++)
      for (let rz = -r; rz <= r && out.length < n; rz++) {
        if (Math.max(Math.abs(rx), Math.abs(rz)) !== r) continue;
        const s = gen.ancientCities.stub(rx, rz);
        if (s) out.push({ rx, rz, s });
      }
  return out;
};

// ---------------------------------------------------------------------------------------------------------------
// The rule: an aquifer whose every nearby cell lies in the deep dark region gives neither water nor lava

for (const seed of ['12345', 'test']) {
  const gen = new m.ChunkGenerator(seed);
  const router = gen.router;
  const aquifer = new m.Aquifer(router, gen.seedHash);
  const cols = new Map();
  const col = (x, z) => {
    const k = (x >> 2) * 131071 + (z >> 2);
    let c = cols.get(k);
    if (!c) cols.set(k, (c = router.column((x >> 2) << 2, (z >> 2) << 2, m.newColumn())));
    return c;
  };
  // depth falls as y rises, so a column is in the region all the way down from the highest y it's in the region at
  const inRegion = (x, y, z) => {
    const c = col(x, z);
    return c.erosion < Math.fround(-0.225) && router.depth(y, c) > Math.fround(0.9);
  };
  // the aquifer cells a block draws on have their centres within 21 blocks across and from 23 below to 21 above it
  // (16 x 12 x 16 cells, the nearest 2 x 3 x 2): check every quart column round it, at the top
  const deepInside = (x, y, z) => {
    for (let ox = -24; ox <= 24; ox += 4) for (let oz = -24; oz <= 24; oz += 4) if (!inRegion(x + ox, y + 21, z + oz)) return false;
    return true;
  };
  let inside = 0, wetInside = 0, outside = 0, wetOutside = 0;
  const sample = [];
  for (const { s } of cityStubs(gen, 3))
    for (let dx = -96; dx <= 96; dx += 6)
      for (let dz = -96; dz <= 96; dz += 6)
        for (let y = -52; y <= -8; y += 4) {
          const x = s.x + dx, z = s.z + dz;
          const sub = aquifer.substance(x, y, z, -1);
          const wet = sub === m.FLUID_WATER || sub === m.FLUID_LAVA;
          if (deepInside(x, y, z)) {
            inside++;
            if (wet) {
              wetInside++;
              if (sample.length < 3) sample.push(`${sub === m.FLUID_LAVA ? 'lava' : 'water'} at ${x} ${y} ${z}`);
            }
          } else if (!inRegion(x, y, z)) {
            outside++;
            if (wet) wetOutside++;
          }
        }
  check(`seed ${seed}: deep inside the deep dark the aquifers are dry`, inside > 500 && wetInside === 0, `${wetInside} of ${inside} open spots wet: ${sample.join(', ')}`);
  check(`seed ${seed}: outside it, round the same cities, they still hold water and lava`, wetOutside > 50, `${wetOutside} of ${outside} wet`);
  console.log(`     seed ${seed}: ${wetInside} of ${inside} spots deep inside wet, ${wetOutside} of ${outside} outside`);
}

// ---------------------------------------------------------------------------------------------------------------
// The cities: nothing hangs over a city that lies in the deep dark. Seed "test" has two near the origin: one
// (175, -767) lies wholly in it, the other (-287, -1055) all but a corner. Before the rule each had a thousand or
// so blocks of water and lava hanging over its air, most of them at y -26 to -31, under the city's roof.

{
  const gen = new m.ChunkGenerator('test');
  for (const [x0, z0, most] of [[175, -767, 0], [-287, -1055, 8]]) {
    const found = cityStubs(gen, 4).find(({ s }) => s.x === x0 && s.z === z0);
    if (!found) {
      check(`seed test: the city at ${x0} ${z0} is still there`, false);
      continue;
    }
    const b = gen.ancientCities.layout(found.rx, found.rz).bounds;
    let hanging = 0, fluid = 0;
    for (let cx = b.minX >> 4; cx <= b.maxX >> 4; cx++)
      for (let cz = b.minZ >> 4; cz <= b.maxZ >> 4; cz++) {
        const o = gen.generate(cx, cz);
        for (let y = -54; y <= b.maxY + 12; y++)
          for (let lz = 0; lz < 16; lz++)
            for (let lx = 0; lx < 16; lx++) {
              const st = o.blocks[m.colIndex(lx, y, lz)];
              if (!st) continue;
              const n = name(st);
              if (n !== 'water' && n !== 'lava') continue;
              fluid++;
              if (!o.blocks[m.colIndex(lx, y - 1, lz)]) hanging++;
            }
      }
    check(`seed test: the city at ${x0} ${z0} has no water or lava hanging over its air (at most ${most})`, hanging <= most, `${hanging} hanging, ${fluid} in all`);
    console.log(`     the city at ${x0} ${z0}: ${fluid} blocks of water and lava from y -54 up to 12 over it, ${hanging} of them over air`);
  }
}

await exitWithStatus(close);

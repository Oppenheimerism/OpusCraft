// A new world's spawn (vanilla MinecraftServer.setInitialSpawn): the climate's spawn point (Climate.SpawnFinder), then
// the first chunk in an 11 x 11 spiral round it with a spot to stand that isn't under water. Over many seeds, compared
// with what the game did before (the grass, sand or snow nearest the origin within 48 blocks, else the origin): the
// spawn is on land and not far from the origin, and finding it is cheap.

import { load, check, exitWithStatus, genLevel, stubLevel } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

const { m, close } = await load(['/src/game/respawnLogic.ts', '/src/world/gen/spawnFinder.ts']);
const SEEDS = ['1', '2', '3', '42', '1337', '8675309', 'minecraft', 'ocean', 'Glacier', '-4172144997902289642', 'seed', 'test world'];

/** the old findSpawn: the nearest grass, sand, snow or podzol top within chunks -3..2, else the origin's surface */
function oldSpawn(world) {
  let best = null, bestD = Infinity;
  for (let z = -48; z < 48; z++)
    for (let x = -48; x < 48; x++) {
      const d = x * x + z * z;
      if (d >= bestD) continue;
      const h = world.heightAt(x, z);
      const name = m.BLOCKS[m.STATE_BLOCK[world.getState(x, h - 1, z)]].name;
      if (name !== 'grass_block' && name !== 'sand' && name !== 'snow' && name !== 'podzol' && name !== 'snow_block') continue;
      if (m.FLAGS[world.getState(x, h, z)] & (m.F_WATER | m.F_LAVA)) continue;
      best = [x, h, z];
      bestD = d;
    }
  return best ?? [0, world.heightAt(0, 0), 0];
}

/** standing at `pos`: on a block that isn't a fluid, with no fluid about the feet or head, in a biome that isn't ocean */
function onLand(world, [x, y, z]) {
  const fluid = (yy) => (m.FLAGS[world.getState(x, yy, z)] & (m.F_WATER | m.F_LAVA)) !== 0;
  return !fluid(y - 1) && !fluid(y) && !fluid(y + 1) && world.getState(x, y - 1, z) !== 0 && !m.isOcean(world.getBiome(x, z));
}

const rows = [];
let searchMs = 0, chunksAfter = 0;
for (const seed of SEEDS) {
  const gen = new m.ChunkGenerator(seed);
  // before
  const { world: w0 } = genLevel(m, gen, seed, -3, -3, 2, 2);
  const before = oldSpawn(w0);
  // after: the climate search, then the spiral as the chunks it asks for come in
  const t0 = performance.now();
  const s = new m.InitialSpawn(seed);
  searchMs += performance.now() - t0;
  const world = new m.World();
  const level = stubLevel(new m.Level(world, seed));
  let pos, loads = 0;
  while ((pos = s.next(level)) === m.WAIT && loads < 200) {
    genLevel(m, gen, seed, s.need[0] - 1, s.need[1] - 1, s.need[0] + 1, s.need[1] + 1, world);
    loads++;
  }
  chunksAfter += world.chunks.size;
  const fromClimate = Math.hypot(pos[0] - (s.cx * 16 + 8), pos[2] - (s.cz * 16 + 8));
  rows.push({
    seed,
    before, beforeLand: onLand(w0, before), beforeDist: Math.hypot(before[0], before[2]),
    after: pos, afterLand: onLand(world, pos), afterDist: Math.hypot(pos[0], pos[2]), fromClimate,
    biome: m.BIOMES[world.getBiome(pos[0], pos[2])].name,
  });
}

const pad = (v, n) => String(v).padEnd(n);
console.log('     seed                   before (old findSpawn)             after (vanilla setInitialSpawn)');
for (const r of rows)
  console.log(`     ${pad(r.seed, 22)} ${pad(r.before.join(' '), 14)} ${pad(r.beforeLand ? 'land' : 'WATER', 6)} ${pad(Math.round(r.beforeDist) + ' out', 9)}   ${pad(r.after.join(' '), 16)} ${pad(r.afterLand ? 'land' : 'WATER', 6)} ${pad(Math.round(r.afterDist) + ' out', 9)} ${r.biome}`);
const landBefore = rows.filter((r) => r.beforeLand).length, landAfter = rows.filter((r) => r.afterLand).length;
const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
console.log(`     on land: before ${landBefore}/${rows.length}, after ${landAfter}/${rows.length}; median distance from the origin: before ${Math.round(median(rows.map((r) => r.beforeDist)))}, after ${Math.round(median(rows.map((r) => r.afterDist)))}`);
console.log(`     climate search: ${(searchMs / SEEDS.length).toFixed(1)} ms a world; chunks generated to find the spawn: ${(chunksAfter / SEEDS.length).toFixed(1)} a world (before: 49)`);

check(`every seed's spawn is on land, out of any fluid (${landAfter}/${rows.length})`, landAfter === rows.length, rows.filter((r) => !r.afterLand).map((r) => r.seed).join(', '));
check('every spawn is within 2560 blocks of the origin (the search reaches 2048 + 512)', rows.every((r) => r.afterDist <= 2560));
check(`the median spawn is within 1000 blocks of the origin (${Math.round(median(rows.map((r) => r.afterDist)))})`, median(rows.map((r) => r.afterDist)) <= 1000);
check('every spawn is in the 11 x 11 chunks round the climate\'s point', rows.every((r) => r.fromClimate <= 6 * 16 * Math.SQRT2));
check(`the climate search is quick (${(searchMs / SEEDS.length).toFixed(1)} ms a world, under 50)`, searchMs / SEEDS.length < 50);

// the spiral itself: a chunk with no spot to stand is passed over, to the next one round
{
  const flat = new m.World();
  const level = stubLevel(new m.Level(flat, 'flat'));
  const WATER = m.S('water'), STONE = m.S('stone');
  const s = new m.InitialSpawn('1');
  for (let cx = s.cx - 3; cx <= s.cx + 3; cx++)
    for (let cz = s.cz - 3; cz <= s.cz + 3; cz++) {
      const blocks = new Uint16Array(m.COLUMN_VOLUME);
      // (the middle chunk all sea; east of it, dry stone)
      const dry = cx === s.cx + 1 && cz === s.cz;
      for (let y = m.MIN_Y; y < 64; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) blocks[m.colIndex(lx, y, lz)] = y < 40 || dry ? STONE : WATER;
      flat.addChunk({ cx, cz, blocks, light: m.computeChunkLight(blocks), biomes: new Uint8Array(256).fill(m.B.plains), pending: [] });
    }
  const pos = s.next(level);
  check('spiral: the sea chunk passed over for the dry one east of it, at its first column', pos !== m.WAIT && pos[0] === (s.cx + 1) * 16 && pos[1] === 64 && pos[2] === s.cz * 16, String(pos));
}

await exitWithStatus(close);

// Headless checks for pillager outposts (node tests/illagers/outposts.mjs [seed]): where they go, the layout, the
// generated blocks, the loot, the spawn override and /locate. Prints a top-down map of the one nearest 0, 0.
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const seed = process.argv[2] ?? '12345';
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/world/gen/generator.ts', '/src/world/constants.ts', '/src/game/level.ts', '/src/world/world.ts',
  '/src/game/outposts.ts', '/src/game/spawner.ts', '/src/game/loot.ts', '/src/core/rng.ts', '/src/world/gen/biomes.ts', '/src/entity/illagers.ts',
  '/src/entity/raider.ts', '/src/world/chunk.ts',
]);
const [, B, G, K, levelMod, worldMod, outpostsGame, spawner, loot, rng, biomes, ill, raider, chunkMod] = mods;
const { BLOCKS, STATE_BLOCK, S } = B;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const name = (st) => BLOCKS[STATE_BLOCK[st]].name;

const gen = new G.ChunkGenerator(seed);
const O = gen.outposts;

// --- where they go
{
  let stubs = 0, candidates = 0, bad = [];
  const OK = new Set(['desert', 'plains', 'savanna', 'snowy_plains', 'taiga', 'meadow', 'frozen_peaks', 'jagged_peaks', 'stony_peaks', 'snowy_slopes', 'cherry_grove', 'grove']);
  for (let rx = -20; rx < 20; rx++)
    for (let rz = -20; rz < 20; rz++) {
      candidates++;
      const s = O.stub(rx, rz);
      if (!s) continue;
      stubs++;
      const offX = s.cx - rx * 32, offZ = s.cz - rz * 32;
      if (offX < 0 || offX >= 24 || offZ < 0 || offZ >= 24) bad.push(`offset ${rx},${rz}`);
      // no village placement chunk within 10 chunks
      for (let vx = Math.floor((s.cx - 10) / 34); vx <= Math.floor((s.cx + 10) / 34); vx++)
        for (let vz = Math.floor((s.cz - 10) / 34); vz <= Math.floor((s.cz + 10) / 34); vz++) {
          const [px, pz] = gen.villages.potentialChunk(vx, vz);
          if (Math.abs(px - s.cx) <= 10 && Math.abs(pz - s.cz) <= 10) bad.push(`village near ${rx},${rz}`);
        }
      const b = biomes.BIOMES[gen.quartBiome(s.x, s.z)].name;
      if (!OK.has(b)) bad.push(`biome ${b}`);
    }
  check('outposts: in their region, never near a village start, only in their biomes', bad.length === 0, bad.slice(0, 4).join('; '));
  check('about one region in five passes the frequency, fewer after villages and biomes', stubs > 0 && stubs < candidates / 5, `${stubs}/${candidates}`);
}

// --- the layout of the nearest one
const found = O.nearest(0, 0, 60);
check('there is an outpost to find', !!found, JSON.stringify(found));
const rx = Math.floor((found[0] >> 4) / 32), rz = Math.floor((found[1] >> 4) / 32);
const lay = O.layout(rx, rz);
const count = new Map();
for (const p of lay.pieces) {
  const id = p.element.template?.id ?? 'empty';
  count.set(id, (count.get(id) ?? 0) + 1);
}
console.log('pieces:', [...count.entries()].map(([k, v]) => `${v} ${k.replace('pillager_outpost/', '')}`).join(', '));
check('one base plate and one watchtower', count.get('pillager_outpost/base_plate') === 1 && count.get('pillager_outpost/watchtower') === 1);
check('up to four feature plates round it', (count.get('pillager_outpost/feature_plate') ?? 0) <= 4);
const tower = lay.pieces.find((p) => p.element.template?.id === 'pillager_outpost/watchtower');
const base = lay.pieces.find((p) => p.element.template?.id === 'pillager_outpost/base_plate');
check('the tower stands on the plate, one up', tower.box.minY === base.box.minY + 1, `${tower.box.minY} / ${base.box.minY}`);
check('the structure box reaches 12 past the pieces', lay.box.minY === Math.min(...lay.pieces.map((p) => p.box.minY)) - 12);

// --- generate it
const chunks = new Map();
const ents = [], bes = [];
let t0 = performance.now();
const pb = lay.box;
for (let cx = (pb.minX + 12) >> 4; cx <= (pb.maxX - 12) >> 4; cx++)
  for (let cz = (pb.minZ + 12) >> 4; cz <= (pb.maxZ - 12) >> 4; cz++) {
    const out = gen.generate(cx, cz);
    chunks.set(cx + ',' + cz, out);
    ents.push(...out.entities);
    bes.push(...out.blockEntities);
  }
console.log('generated', chunks.size, 'chunks in', Math.round(performance.now() - t0), 'ms');
const at = (x, y, z) => { const o = chunks.get((x >> 4) + ',' + (z >> 4)); return o ? o.blocks[K.colIndex(x & 15, y, z & 15)] : -1; };
const tb = tower.box, fy = tb.minY;
let cobble = 0;
for (let x = tb.minX; x <= tb.maxX; x++) for (let z = tb.minZ; z <= tb.maxZ; z++) if (name(at(x, fy, z)) === 'cobblestone') cobble++;
check('the tower floor is cobblestone, 9 by 9', cobble === 81, `${cobble}`);
let ladders = 0;
for (let x = tb.minX; x <= tb.maxX; x++) for (let z = tb.minZ; z <= tb.maxZ; z++) for (let y = fy; y <= tb.maxY; y++) if (name(at(x, y, z)) === 'ladder') ladders++;
check('a ladder runs up through both floors', ladders === 10, `${ladders}`);
const chest = bes.find((b) => b.data?.lootTable === 'chests/pillager_outpost');
check('the lookout has its loot chest', !!chest && chest.y === fy + 11, chest && `${chest.x},${chest.y},${chest.z}`);
const banners = bes.filter((b) => b.id === 'banner');
check('four ominous banners hang round it', banners.length === 4 && banners.every((b) => b.data.itemName === 'Ominous Banner' && JSON.parse(b.data.patterns).length === 8 && name(at(b.x, b.y, b.z)) === 'white_wall_banner'), `${banners.length}`);
// the ground under the plate: flattened to the tower's floor
let flat = 0, cols = 0;
for (let x = base.box.minX; x <= base.box.maxX; x++)
  for (let z = base.box.minZ; z <= base.box.maxZ; z++) {
    if (x >= tb.minX + 1 && x <= tb.maxX - 1 && z >= tb.minZ + 1 && z <= tb.maxZ - 1) continue;
    cols++;
    let top = -64;
    for (let y = fy + 6; y > fy - 10; y--) {
      const n = name(at(x, y, z));
      if (n === 'air' || n.includes('grass') && n !== 'grass_block' || n.includes('flower') || n === 'snow') continue;
      top = y;
      break;
    }
    if (Math.abs(top - (fy - 1)) <= 1 || top >= fy) flat++;
  }
check('the ground round the tower is levelled to its floor', flat / cols > 0.85, `${flat}/${cols}`);
const golems = ents.filter((e) => e.id === 'iron_golem');
const cages = (count.get('pillager_outpost/feature_cage1') ?? 0) + (count.get('pillager_outpost/feature_cage2') ?? 0);
check('a caged iron golem for each golem cage', golems.length === cages, `${golems.length} golems, ${cages} cages`);

// a map
const CH = { cobblestone: 'C', dark_oak_log: 'L', birch_planks: 'B', dark_oak_planks: 'P', dark_oak_slab: '_', dark_oak_fence: '+', iron_bars: '#', white_wool: 'W', hay_block: 'h', carved_pumpkin: 'o', white_wall_banner: '!', ladder: 'H', chest: 'c', grass_block: ',', sand: '.', snow: ' ', water: '~', crafting_table: 'T' };
for (let z = pb.minZ + 8; z <= pb.maxZ - 8; z++) {
  let row = '';
  for (let x = pb.minX + 8; x <= pb.maxX - 8; x++) {
    let ch = ' ';
    for (let y = fy + 16; y > fy - 12; y--) {
      const st = at(x, y, z);
      if (st <= 0) continue;
      const n = name(st);
      if (n === 'short_grass' || n === 'tall_grass' || n === 'snow') continue;
      ch = CH[n] ?? n[0];
      break;
    }
    row += ch;
  }
  console.log(row);
}

// --- an outpost with a golem cage: the golem stands inside it
{
  let hit = null;
  for (let ring = 0; ring < 12 && !hit; ring++)
    for (let i = -ring; i <= ring && !hit; i++)
      for (let j = -ring; j <= ring && !hit; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        const l = O.layout(i, j);
        const cage = l?.pieces.find((p) => /feature_cage[12]$/.test(p.element.template?.id ?? ''));
        if (cage) hit = { l, cage };
      }
  check('some outpost has a golem cage', !!hit);
  const cb = hit.cage.box;
  const es = [];
  const cc = new Map();
  for (let cx = cb.minX >> 4; cx <= cb.maxX >> 4; cx++)
    for (let cz = cb.minZ >> 4; cz <= cb.maxZ >> 4; cz++) {
      const out = gen.generate(cx, cz);
      cc.set(cx + ',' + cz, out);
      es.push(...out.entities.filter((e) => e.id === 'iron_golem'));
    }
  const g = es.find((e) => e.x > cb.minX && e.x < cb.maxX + 1 && e.z > cb.minZ && e.z < cb.maxZ + 1);
  check('...with an iron golem in the middle of it', !!g && Math.abs(g.x - (cb.minX + cb.maxX + 1) / 2) < 0.01 && Math.abs(g.z - (cb.minZ + cb.maxZ + 1) / 2) < 0.01 && g.y === cb.minY, g && `${g.x},${g.y},${g.z} in ${cb.minX}..${cb.maxX}`);
  const at2 = (x, y, z) => { const o = cc.get((x >> 4) + ',' + (z >> 4)); return o ? name(o.blocks[K.colIndex(x & 15, y, z & 15)]) : '?'; };
  const wall = at2(cb.minX, cb.minY + 1, cb.minZ + 2), roof = at2(cb.minX + 2, cb.maxY, cb.minZ + 2), inside = at2(cb.minX + 2, cb.minY, cb.minZ + 2);
  check('...walled in and roofed over', /fence|bars/.test(wall) && /slab|planks/.test(roof) && inside === 'air', `${wall} ${roof} ${inside}`);
}

// --- the chest's loot
{
  const r = new rng.Rand(7);
  const seen = new Set();
  for (let i = 0; i < 50; i++) for (const s of loot.rollLoot('chests/pillager_outpost', r)) seen.add(s.item.id);
  check('the chest holds crops, dark oak logs, arrows and the like', ['dark_oak_log', 'wheat', 'carrot', 'potato', 'arrow', 'string', 'iron_ingot', 'experience_bottle'].every((i) => seen.has(i)), [...seen].join(','));
}

// --- the spawn override and /locate
{
  const world = new worldMod.World();
  const level = new levelMod.Level(world, seed);
  const tx = (tb.minX + tb.maxX) >> 1, tz = (tb.minZ + tb.maxZ) >> 1;
  check('nothing yet while the terrain loads', outpostsGame.outpostSpawnsAt(level, 'monster', tx, fy + 1, tz) === null);
  await outpostsGame.outpostsReady(level);
  const sp = outpostsGame.outpostSpawnsAt(level, 'monster', tx, fy + 1, tz);
  check('in the outpost, the monsters that spawn are pillagers', sp?.length === 1 && sp[0].type === 'pillager' && sp[0].max === 1);
  check('...all through its box, 12 blocks out from its pieces', outpostsGame.outpostSpawnsAt(level, 'monster', lay.box.minX, lay.box.minY, lay.box.minZ) !== null && outpostsGame.outpostSpawnsAt(level, 'monster', lay.box.minX - 1, fy, tz) === null);
  check('but not the animals', outpostsGame.outpostSpawnsAt(level, 'creature', tx, fy + 1, tz) === null);
  check('nor anywhere else', outpostsGame.outpostSpawnsAt(level, 'monster', tx + 300, fy + 1, tz) === null);
  const ns = new spawner.NaturalSpawner(level, 1);
  check('the natural spawner takes them', ns['mobsAt']('monster', tx, fy + 1, tz)[0]?.type === 'pillager');
  const loc = outpostsGame.locateOutpost(level, 0, 0);
  check('/locate finds the same outpost', loc && loc[0] === found[0] && loc[1] === found[1], JSON.stringify(loc));
  // a pillager may spawn there by day, one at a time
  const c = new chunkMod.Chunk(tx >> 4, tz >> 4);
  world.chunks.set(c.key, c);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) c.setState(x, fy - 1, z, S('stone'));
  c.recomputeHeightmap();
  level.difficulty = 'normal';
  check('pillagers spawn in daylight (block light counts, not the sun)', raider.checkPatrollingMonsterSpawnRules(level, tx, fy, tz));
  const p = new ill.Pillager(level);
  check('...any spot will do (walk target 0), one at a time', p.walkTargetValue(tx, fy, tz) === 0 && p.maxSpawnClusterSize() === 1);
  level.difficulty = 'peaceful';
  check('not in peaceful', !raider.checkPatrollingMonsterSpawnRules(level, tx, fy, tz));
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

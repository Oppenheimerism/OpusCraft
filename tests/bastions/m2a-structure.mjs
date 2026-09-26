// M2a: the bastion remnants laid out — the start pool (the four kinds, one each), where they go (one fortress or
// bastion per 27 x 27-chunk region, three bastions to two fortresses, never a bastion in basalt deltas, every
// fortress where it was at 16017d7), and each kind assembled from many starts: its key pieces, which chests with
// which loot tables, the spawners, the mobs (persistent, placed as a structure's, the piglins armed), gold, and no two
// pieces overlapping.

import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { load, check, exitWithStatus, MODULES } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

// the fortresses as they were at 16017d7 (before the bastions): that version's fortress.ts, loaded beside this one
// (first, so that this one's NetherFortresses is the one left in `m`)
const OLD = 'src/world/gen/fortressAt16017d7.tmp.ts';
fs.writeFileSync(OLD, execSync('git show 16017d7:src/world/gen/fortress.ts').toString());
let loaded;
try {
  loaded = await load([
    '/' + OLD, '/src/world/gen/jigsaw.ts', '/src/world/gen/bastion.ts', '/src/world/gen/bastionTemplates.ts', '/src/world/gen/bastionPieces.ts',
    '/src/world/gen/nether.ts', '/src/world/gen/fortress.ts', '/src/world/gen/biomes.ts',
  ]);
} finally {
  fs.rmSync(OLD, { force: true });
}
const { m, mods, close } = loaded;
const OldFortresses = mods[MODULES.length].NetherFortresses;

// ---------------------------------------------------------------------------------------------------------------
// The start pool

const starts = m.POOLS.get('bastion/starts');
const kinds = starts.templates.map((e) => m.variantOf(e));
check('starts: bastion/starts holds the four kinds, one start each, weight 1', kinds.length === 4 && new Set(kinds).size === 4 && ['units', 'hoglin_stable', 'treasure', 'bridge'].every((k) => kinds.includes(k)), kinds.join());
check('starts: vanilla\'s start pieces', ['bastion/units/air_base', 'bastion/hoglin_stable/air_base', 'bastion/treasure/big_air_full', 'bastion/bridge/starting_pieces/entrance_base'].every((id) => starts.templates.some((e) => e.template.id === id)));

// ---------------------------------------------------------------------------------------------------------------
// Where they go

const SEEDS = ['12345', '1', '-7', 'bastions'];
for (const seed of SEEDS) {
  const gen = new m.NetherGenerator(seed);
  const b = gen.bastions, f = gen.fortresses;
  const oldF = new OldFortresses(gen.seedHash, (x, z) => m.BIOMES[gen.biomeAt(x, z)].name);
  let nb = 0, nf = 0, deltas = 0, bothOrNeither = 0, moved = 0, samePieces = 0, open = 0;
  const seenKinds = new Set();
  const R = 10;
  for (let rx = -R; rx < R; rx++)
    for (let rz = -R; rz < R; rz++) {
      const s = b.stub(rx, rz), fs0 = f.startInRegion(rx, rz), fo = oldF.startInRegion(rx, rz);
      const pc = f.complexInRegion(rx, rz);
      if (m.BIOMES[gen.biomeAt(pc.cx * 16 + 8, pc.cz * 16 + 8)].name !== 'basalt_deltas') open++;
      if (s) {
        nb++;
        seenKinds.add(s.variant);
        if (m.BIOMES[gen.biomeAt(s.cx * 16 + 8, s.cz * 16 + 8)].name === 'basalt_deltas') deltas++;
      }
      if (fs0) nf++;
      if (!!s === !!fs0) bothOrNeither++;
      if (!!fs0 !== !!fo || (fs0 && (fs0.cx !== fo.cx || fs0.cz !== fo.cz))) moved++;
      else if (fs0 && JSON.stringify(fs0.pieces.map((p) => p.box ?? p)) === JSON.stringify(fo.pieces.map((p) => p.box ?? p))) samePieces++;
    }
  const n = (2 * R) ** 2;
  check(`placement (seed ${seed}): every region a fortress or a bastion, never both (${nb} bastions, ${nf} fortresses of ${n})`, bothOrNeither === 0 && nb + nf === n);
  // (the set's weights, 3 to 2, outside the basalt deltas; in them every region is a fortress's)
  check(`placement (seed ${seed}): three bastions to two fortresses outside the basalt deltas (${nb} in ${open})`, Math.abs(nb / open - 0.6) < 0.06, `${(nb / open).toFixed(3)}`);
  check(`placement (seed ${seed}): no bastion starts in basalt deltas`, deltas === 0, String(deltas));
  check(`placement (seed ${seed}): every fortress where it was at 16017d7, piece for piece`, moved === 0 && samePieces === nf, `${moved} moved, ${samePieces}/${nf} the same`);
  check(`placement (seed ${seed}): all four kinds turn up`, seenKinds.size === 4, [...seenKinds].join());
}

// ---------------------------------------------------------------------------------------------------------------
// The templates: every mob stands on a block with room over it, every block of gold (or air) goes where there's air

const OPEN = (st) => st === null || /^(air|chain|cave_air)$/.test(st.split('[')[0]);
let mobJigs = 0, goldJigs = 0;
const badJigs = [];
for (const [pid, pool] of m.POOLS) {
  if (!pid.startsWith('bastion/')) continue;
  for (const el of new Set(pool.templates)) {
    const g = el.t?.grid;
    if (!g) continue;
    for (const j of g.jigsaws) {
      const [x, y, z] = j.at;
      if (j.target === m.J.mob) {
        mobJigs++;
        const floorSt = g.get(x, y, z);
        if (floorSt === null || OPEN(floorSt) || /lava/.test(floorSt)) badJigs.push(`${el.template.id}: a mob at ${x},${y},${z} on ${floorSt}`);
        // room for a piglin (two blocks), for a hoglin (1.4 high, two blocks) alike
        for (const dy of [1, 2]) if (!OPEN(g.get(x, y + dy, z)) && g.inside(x, y + dy, z)) badJigs.push(`${el.template.id}: a mob at ${x},${y},${z} under ${g.get(x, y + dy, z)}`);
      } else if (j.target === m.J.block) {
        goldJigs++;
        const floorSt = g.get(x, y, z);
        if (floorSt === null || OPEN(floorSt)) badJigs.push(`${el.template.id}: gold at ${x},${y},${z} on ${floorSt}`);
        if (!OPEN(g.get(x, y + 1, z)) && g.inside(x, y + 1, z)) badJigs.push(`${el.template.id}: gold at ${x},${y},${z} into ${g.get(x, y + 1, z)}`);
      }
    }
  }
}
check(`templates: ${mobJigs} mobs each on a floor with two blocks of room, ${goldJigs} blocks of gold each on a floor in the open`, badJigs.length === 0, `${badJigs.length}: ${badJigs.slice(0, 6).join('; ')}`);

// ---------------------------------------------------------------------------------------------------------------
// Each kind, from many starts

const name = (st) => m.blockOf(st).name;
function assemble(start, seed, cx, cz) {
  const pool = new m.Pool('test', 'empty', [[start, 1]]);
  const r = m.largeFeatureRandom(m.worldSeed64(seed), cx, cz);
  const s = m.jigsawStart(pool, r, cx, cz, null);
  s.piece.move(33 - (s.piece.box.minY + s.piece.groundLevelDelta));
  s.y = 33;
  return m.jigsawAssemble(s, r, 6, 80, false, () => 33);
}
function placeAll(pieces) {
  const blocks = new Map(), entities = [], bes = [];
  const key = (x, y, z) => `${x},${y},${z}`;
  const ctx = {
    x0: 0, z0: 0, cx: 0, cz: 0, blockEntities: bes, entities,
    set: (x, y, z, st) => { if (st) blocks.set(key(x, y, z), st); else blocks.delete(key(x, y, z)); },
    getOrAir: (x, y, z) => blocks.get(key(x, y, z)) ?? 0, get: (x, y, z) => blocks.get(key(x, y, z)) ?? 0,
    scheduleFluid() {}, markForPostprocessing() {},
  };
  const pc = { ctx, chunk: new m.Box(-100000, -64, -100000, 100000, 319, 100000), salt: 99, baseY: pieces[0].box.minY };
  for (const p of pieces) p.element.place(pc, p);
  return { blocks, entities, bes };
}

const EXPECT = {
  units: {
    pieces: ['bastion/units/air_base', /units\/walls\/(wall_base|connected_wall)/, /units\/center_pieces\/center_\d/, /units\/pathways\//, /units\/stages\/stage_0_\d/, /units\/stages\/(stage_1_\d|rot\/stage_1_0)/, /units\/ramparts\/ramparts_\d/],
    counts: [[/units\/walls\//, 4], [/units\/pathways\//, 4], [/units\/stages\/stage_0_/, 4], [/units\/center_pieces\//, 1]],
    tables: ['bastion_other'],
  },
  hoglin_stable: {
    pieces: ['bastion/hoglin_stable/air_base', /hoglin_stable\/walls\/wall_base/, /hoglin_stable\/walls\/side_wall_\d/, /starting_pieces\/starting_stairs_\d/, /starting_pieces\/stairs_\d_mirrored/, /hoglin_stable\/stairs\/stairs_1_\d/, /hoglin_stable\/posts\//, /small_stables\/outer/, /large_stables\/inner/, /hoglin_stable\/ramparts/],
    counts: [[/hoglin_stable\/walls\/wall_base$/, 4], [/hoglin_stable\/posts\//, 4], [/small_stables\/outer/, 2], [/large_stables\/inner/, 1], [/hoglin_stable\/stairs\/stairs_1_/, 2]],
    tables: ['bastion_hoglin_stable', 'bastion_other'],
  },
  treasure: {
    pieces: ['bastion/treasure/big_air_full', 'bastion/treasure/bases/lava_basin', /treasure\/bases\/centers\/center_\d/, 'bastion/treasure/brains/center_brain', /treasure\/walls\//, /treasure\/corners\//],
    counts: [[/treasure\/bases\/lava_basin$/, 1], [/treasure\/brains\/center_brain$/, 1], [/treasure\/walls\//, 4], [/treasure\/corners\//, 4]],
    tables: ['bastion_treasure', 'bastion_other'],
  },
  bridge: {
    pieces: ['bastion/bridge/starting_pieces/entrance_base', /bridge\/starting_pieces\/entrance(_face)?$/, 'bastion/bridge/bridge_pieces/bridge', /bridge\/legs\/leg_\d/, /bridge\/connectors\/back_bridge_(top|bottom)/, /bridge\/walls\/wall_base_\d/, /bridge\/ramparts\/rampart_\d/],
    counts: [[/bridge\/bridge_pieces\/bridge$/, 1], [/bridge\/starting_pieces\/entrance(_face)?$/, 1], [/bridge\/starting_pieces\/entrance_base$/, 1]],
    tables: ['bastion_bridge', 'bastion_other'],
  },
};

const t0 = performance.now();
let assembled = 0;
for (const start of starts.templates) {
  const kind = m.variantOf(start);
  const exp = EXPECT[kind];
  const missing = new Set(), badCounts = [], tables = {}, overlaps = [], badMobs = [], mobCount = [], goldCount = [], spawners = [];
  let brutes = 0, piglins = 0, hoglins = 0, treasureAlways = true, bridgeAlways = true, stableAlways = true, floating = [];
  const N = 24;
  for (let i = 0; i < N; i++) {
    const pieces = assemble(start, SEEDS[i % SEEDS.length], 3 * i - 30, 17 - 2 * i);
    assembled++;
    const ids = pieces.map((p) => p.element.template?.id ?? '');
    for (const want of exp.pieces) if (!ids.some((id) => (typeof want === 'string' ? id === want : want.test(id)))) missing.add(String(want));
    for (const [k, n] of exp.counts) {
      const c = ids.filter((id) => k.test(id)).length;
      if (c !== n) badCounts.push(`${k.source} ${c}`);
    }
    // boxes: two pieces may only overlap when one holds the other (a child placed in its parent's space; mobs and
    // blocks of gold are left out)
    const big = pieces.filter((p) => !/bastion\/(mobs|blocks)\//.test(p.element.template?.id ?? ''));
    const holds = (a, b) => a.minX <= b.minX && a.minY <= b.minY && a.minZ <= b.minZ && a.maxX >= b.maxX && a.maxY >= b.maxY && a.maxZ >= b.maxZ;
    for (let a = 1; a < big.length; a++)
      for (let b = a + 1; b < big.length; b++)
        if (big[a].box.intersects(big[b].box) && !holds(big[a].box, big[b].box) && !holds(big[b].box, big[a].box)) overlaps.push(`${ids[pieces.indexOf(big[a])]} / ${ids[pieces.indexOf(big[b])]}`);
    const { blocks, entities, bes } = placeAll(pieces);
    let tre = 0, bri = 0, sta = 0;
    for (const be of bes) {
      if (be.id === 'chest') {
        const t = be.data.lootTable?.split('/').pop();
        tables[t] = (tables[t] ?? 0) + 1;
        if (t === 'bastion_treasure') tre++;
        if (t === 'bastion_bridge') bri++;
        if (t === 'bastion_hoglin_stable') sta++;
        if (!be.data.lootTable || typeof be.data.lootSeed !== 'number') badMobs.push('chest without table or seed');
      }
      if (be.id === 'spawner') spawners.push(be.data.entity);
    }
    if (kind === 'treasure' && tre < 1) treasureAlways = false;
    if (kind === 'bridge' && bri !== 1) bridgeAlways = false;
    if (kind === 'hoglin_stable' && sta < 1) stableAlways = false;
    for (const e of entities) {
      if (!e.persistent || e.data?.finalize !== 'structure') badMobs.push(`${e.id} not persistent`);
      if (e.id === 'piglin') {
        piglins++;
        if (!['golden_sword', 'crossbow'].includes(e.hand?.[0])) badMobs.push('piglin unarmed');
      } else if (e.id === 'piglin_brute') brutes++;
      else if (e.id === 'hoglin') hoglins++;
      else badMobs.push(e.id);
      // standing on something solid, in the air (but where the pieces' processors knocked out the block beneath, as
      // they do now and then in vanilla, the higher up the more)
      const x = Math.floor(e.x), y = Math.floor(e.y), z = Math.floor(e.z);
      const under = blocks.get(`${x},${y - 1},${z}`), at = blocks.get(`${x},${y},${z}`);
      if (!under || (at && name(at) !== 'chain' && !/_(slab|pressure_plate|button)/.test(name(at)))) floating.push(`${e.id} at ${x},${y},${z} on ${under ? name(under) : 'nothing'} in ${at ? name(at) : 'air'}`);
    }
    mobCount.push(entities.length);
    goldCount.push([...blocks.values()].filter((st) => name(st) === 'gold_block').length);
  }
  for (const p of missing) check(`${kind}: has ${p}`, false);
  check(`${kind}: its key pieces in all ${N} layouts`, missing.size === 0, [...missing].join(', '));
  check(`${kind}: the right number of walls, stages, stalls and so on`, badCounts.length === 0, [...new Set(badCounts)].slice(0, 6).join(', '));
  check(`${kind}: no two pieces overlapping`, overlaps.length === 0, overlaps.slice(0, 4).join(', '));
  check(`${kind}: chests only of its tables (${Object.entries(tables).map(([k, v]) => `${k} ${v}`).join(', ')})`, Object.keys(tables).every((t) => exp.tables.includes(t)) && exp.tables.every((t) => tables[t] > 0));
  if (kind === 'treasure') check('treasure: a treasure chest in every one; two magma cube spawners in the brain', treasureAlways && spawners.length === 2 * N && spawners.every((s) => s === 'magma_cube'), `${spawners.length}`);
  else check(`${kind}: no spawners`, spawners.length === 0);
  if (kind === 'bridge') check('bridge: the bridge\'s chest in every one, just the one', bridgeAlways);
  if (kind === 'hoglin_stable') check('hoglin stables: a stables chest in every one; hoglins', stableAlways && hoglins >= 3 * N, `${hoglins}`);
  else check(`${kind}: no hoglins`, hoglins === 0);
  check(`${kind}: mobs persistent, placed as a structure's, piglins armed`, badMobs.length === 0, [...new Set(badMobs)].slice(0, 5).join('; '));
  const mobs = mobCount.reduce((a, b) => a + b, 0);
  check(`${kind}: mobs standing on floors, in the open (${floating.length} of ${mobs} over a block worn away)`, floating.length <= Math.max(2, mobs * 0.01), floating.slice(0, 4).join('; '));
  const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  check(`${kind}: piglins and brutes about (${avg(mobCount)} mobs a bastion: ${piglins} piglins, ${brutes} brutes, ${hoglins} hoglins in ${N})`, piglins > 5 * N && brutes >= N);
  check(`${kind}: gold here and there (${avg(goldCount)} blocks a bastion)`, goldCount.every((g) => g >= 5 && g < 200));
}
console.log(`     (${assembled} bastions assembled and placed in ${(performance.now() - t0).toFixed(0)} ms)`);

await exitWithStatus(close);

// Strongholds: ring placement, layouts, the pieces in generated chunks, loot, locate. node tests/end/stronghold.mjs
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods: [, blockMod, shMod, genMod, lootMod, rngMod, constMod, ctxMod, structMod, beMod], close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/world/gen/stronghold.ts', '/src/world/gen/generator.ts', '/src/game/loot.ts', '/src/core/rng.ts', '/src/world/constants.ts',
  '/src/world/gen/context.ts', '/src/world/gen/structure.ts', '/src/world/blockEntity.ts',
]);
let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); if (!ok) fails++; };
const S = blockMod.S, blockOf = blockMod.blockOf;
const t0 = Date.now();

// --- ring placement
const SEED = '12345';
const sh = shMod.strongholdLocator(SEED);
{
  const ring = sh.ring;
  check('128 ring positions', ring.length === 128);
  const d = ring.map((b) => Math.hypot(b.cx, b.cz));
  const sizes = [3, 6, 10, 15, 21, 28, 36, 9];
  let k = 0, okRings = true;
  const info = [];
  sizes.forEach((n, m) => {
    const ds = d.slice(k, k + n);
    const lo = 128 + 192 * m - 40.5, hi = 128 + 192 * m + 40.5;
    if (!ds.every((x) => x >= lo - 1 && x <= hi + 1)) okRings = false;
    info.push(`${n}@${Math.round(Math.min(...ds) * 16)}-${Math.round(Math.max(...ds) * 16)}`);
    k += n;
  });
  check('eight rings of 3, 6, 10, 15, 21, 28, 36 and 9, each 192 chunks further out', okRings, info.join(' '));
  // evenly spread round the first ring
  const a = ring.slice(0, 3).map((b) => Math.atan2(b.cz, b.cx));
  const gaps = [a[1] - a[0], a[2] - a[1]].map((g) => ((g % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
  check('the first three a third of the way round from each other', gaps.every((g) => Math.abs(g - (2 * Math.PI) / 3) < 0.1), gaps.map((g) => g.toFixed(3)).join(' '));
  // determinism
  const again = shMod.strongholdLocator(SEED);
  check('same seed, same rings', again.ring.every((b, i) => b.cx === ring[i].cx && b.cz === ring[i].cz && b.fork === ring[i].fork));
  const other = shMod.strongholdLocator('other');
  check('another seed, other rings', other.ring[0].cx !== ring[0].cx || other.ring[0].cz !== ring[0].cz);
  // the nudge toward preferred biomes
  const tb = Date.now();
  const c0 = sh.chunkOf(0);
  const ms = Date.now() - tb;
  check('biome nudge stays within 7 chunks', Math.abs(c0[0] - ring[0].cx) <= 7 && Math.abs(c0[1] - ring[0].cz) <= 7, `ring ${ring[0].cx},${ring[0].cz} -> ${c0} in ${ms} ms`);
}

// --- layouts
const names = new Map();
let fillerOverlaps = 0, layouts = 0, bad = 0, tries = 0, maxPieces = 0, minPieces = 1e9, overlaps = 0, farOut = 0, tall = 0, short = 0;
const topYs = [];
const seed64 = BigInt(12345);
for (let n = 0; n < 60; n++) {
  const cx = (n * 37) % 200 - 100, cz = (n * 71) % 200 - 100;
  const s = shMod.generateStronghold(seed64 + BigInt(n * 1000), n, cx, cz);
  layouts++;
  if (!s.portalRoom || s.portalRoom.constructor.name !== 'PortalRoom') bad++;
  maxPieces = Math.max(maxPieces, s.pieces.length);
  minPieces = Math.min(minPieces, s.pieces.length);
  topYs.push(s.bounds.maxY);
  for (const p of s.pieces) {
    const nm = p.constructor.name + (p.constructor.name === 'RoomCrossing' ? p.type : '');
    names.set(nm, (names.get(nm) ?? 0) + 1);
    if (p.constructor.name === 'Library') p.isTall ? tall++ : short++;
    if (Math.abs(p.box.minX - (cx * 16 + 2)) > 112 + 16 || Math.abs(p.box.minZ - (cz * 16 + 2)) > 112 + 16) farOut++;
  }
  // (a filler corridor runs up into the piece in its way, as vanilla's findPieceBox has it: one block deep)
  for (let i = 0; i < s.pieces.length; i++)
    for (let j = i + 1; j < s.pieces.length; j++) {
      const a = s.pieces[i], b = s.pieces[j];
      if (!a.box.intersects(b.box)) continue;
      const filler = a.constructor.name === 'FillerCorridor' || b.constructor.name === 'FillerCorridor';
      if (!filler) { overlaps++; if (overlaps < 4) console.log('   overlap', a.constructor.name, JSON.stringify(a.box), b.constructor.name, JSON.stringify(b.box)); }
      else fillerOverlaps++;
    }
}
void tries;
check('every layout has its portal room', bad === 0, `${layouts} layouts, ${minPieces}-${maxPieces} pieces`);
const want = ['StartPiece', 'FiveCrossing', 'Straight', 'PrisonHall', 'LeftTurn', 'RightTurn', 'RoomCrossing0', 'RoomCrossing1', 'RoomCrossing2', 'RoomCrossing3', 'RoomCrossing4', 'StraightStairsDown', 'StairsDown', 'ChestCorridor', 'Library', 'PortalRoom', 'FillerCorridor'];
check('every kind of piece turns up', want.every((w) => names.get(w) > 0), [...names].map(([k, v]) => `${k}:${v}`).join(' '));
check('both library heights', tall > 0 && short > 0, `${tall} tall, ${short} short`);
check('no two pieces overlap (but fillers into their walls)', overlaps === 0, `${overlaps}; ${fillerOverlaps} filler ends`);
check('pieces stay within reach', farOut === 0, String(farOut));
check('sunk below sea level', topYs.every((y) => y <= 53), `tops ${Math.min(...topYs)}..${Math.max(...topYs)}`);

// --- a stronghold in the world
const gen = new genMod.ChunkGenerator(SEED);
const s0 = gen.strongholds.start(0);
const loc = sh.start(0);
check('the chunk workers and the main thread agree', s0.cx === loc.cx && s0.cz === loc.cz && s0.pieces.length === loc.pieces.length);
const room = s0.portalRoom;
console.log(`  stronghold 0 at chunk ${s0.cx},${s0.cz}: ${s0.pieces.length} pieces, y ${s0.bounds.minY}..${s0.bounds.maxY}; portal room ${JSON.stringify(room.box)} facing ${room.orientation}`);
const chunks = new Map();
const tg = Date.now();
const genChunk = (cx, cz) => {
  const k = cx + ',' + cz;
  if (!chunks.has(k)) chunks.set(k, gen.generate(cx, cz));
  return chunks.get(k);
};
const blockAt = (x, y, z) => {
  const o = genChunk(x >> 4, z >> 4);
  return o.blocks[constMod.colIndex(x & 15, y, z & 15)];
};
for (let cx = room.box.minX >> 4; cx <= room.box.maxX >> 4; cx++) for (let cz = room.box.minZ >> 4; cz <= room.box.maxZ >> 4; cz++) genChunk(cx, cz);
console.log(`  generated ${chunks.size} chunks in ${Date.now() - tg} ms`);
{
  let frames = 0, eyes = 0, portal = 0, lava = 0, bars = 0, spawners = [];
  for (let x = room.box.minX; x <= room.box.maxX; x++)
    for (let y = room.box.minY; y <= room.box.maxY; y++)
      for (let z = room.box.minZ; z <= room.box.maxZ; z++) {
        const st = blockAt(x, y, z), b = blockOf(st);
        if (b.name === 'end_portal_frame') { frames++; if (b.get(st, 'eye') === true || b.get(st, 'eye') === 'true') eyes++; }
        else if (b.name === 'end_portal') portal++;
        else if (b.name === 'lava') lava++;
        else if (b.name === 'iron_bars') bars++;
        else if (b.name === 'spawner') spawners.push([x, y, z]);
      }
  check('12 end portal frames round the pit', frames === 12, `${frames} frames, ${eyes} with eyes, ${portal} portal`);
  check('lava in the pit and by the door', lava === 15, String(lava));
  check('barred windows and a barred door', bars === 12 * 2 + 4 * 2 + 7, String(bars));
  check('one spawner', spawners.length === 1, JSON.stringify(spawners));
  const bes = [...chunks.values()].flatMap((o) => o.blockEntities);
  const sp = bes.find((b) => b.id === 'spawner');
  check('it spawns silverfish', sp?.data?.entity === 'silverfish', JSON.stringify(sp));
  if (portal) check('a lit portal has its block entities', bes.filter((b) => b.id === 'end_portal').length === 9);
  // frames face the pit
  const f = [];
  for (let x = room.box.minX; x <= room.box.maxX; x++)
    for (let z = room.box.minZ; z <= room.box.maxZ; z++) {
      const st = blockAt(x, room.box.minY + 3, z);
      if (blockOf(st).name === 'end_portal_frame') f.push([x, z, blockOf(st).get(st, 'facing')]);
    }
  const cxm = f.reduce((a, v) => a + v[0], 0) / f.length, czm = f.reduce((a, v) => a + v[1], 0) / f.length;
  const D = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
  check('the frames face the middle', f.every(([x, z, d]) => (cxm - x) * D[d][0] + (czm - z) * D[d][1] > 0), f.map((v) => v[2][0]).join(''));
}
// all twelve eyes in (one in a trillion): the portal is lit, with its block entities
{
  const cx = (room.box.minX + 5) >> 4, cz = (room.box.minZ + 8) >> 4;
  const ctx = new ctxMod.GenContext(cx, cz, new Uint16Array(16 * 16 * 384).fill(S('stone')), new Uint8Array(256));
  const chunk = new structMod.BoundingBox(cx * 16, -63, cz * 16, cx * 16 + 15, 319, cz * 16 + 15);
  const lucky = { nextFloat: () => 0.95, nextInt: () => 0, nextBool: () => false, j: { nextLong: () => 0n } };
  room.postProcess(ctx, chunk, lucky);
  let eyes = 0, portal = 0;
  for (let i = 0; i < ctx.blocks.length; i++) {
    const b = blockOf(ctx.blocks[i]);
    if (b.name === 'end_portal_frame' && String(b.get(ctx.blocks[i], 'eye')) === 'true') eyes++;
    if (b.name === 'end_portal') portal++;
  }
  const bes = ctx.blockEntities.filter((b) => b.id === 'end_portal');
  check('twelve eyes light the portal', portal > 0 && bes.length === portal, `${eyes} eyes, ${portal} portal blocks, ${bes.length} block entities in this chunk`);
  check('which load as end portals', bes.every((d) => beMod.loadBlockEntity(d)?.id === 'end_portal'));
}
// the walls: stone bricks, a fifth cracked, 30% mossy, 5% infested
{
  const count = {};
  for (const o of chunks.values()) for (let i = 0; i < o.blocks.length; i++) {
    const nm = blockOf(o.blocks[i]).name;
    if (/stone_bricks$/.test(nm)) count[nm] = (count[nm] ?? 0) + 1;
  }
  const tot = Object.values(count).reduce((a, v) => a + v, 0);
  console.log('  ', Object.entries(count).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(1)}%`).join(', '));
  check('some walls infested', (count.infested_stone_bricks ?? 0) > 0);
  check('some mossy and cracked', (count.mossy_stone_bricks ?? 0) > 0 && (count.cracked_stone_bricks ?? 0) > 0);
}
// a chest
{
  const withChest = s0.pieces.find((p) => p.constructor.name === 'ChestCorridor' || p.constructor.name === 'Library' || (p.constructor.name === 'RoomCrossing' && p.type === 2));
  if (withChest) {
    const cs = new Set();
    for (let cx = withChest.box.minX >> 4; cx <= withChest.box.maxX >> 4; cx++) for (let cz = withChest.box.minZ >> 4; cz <= withChest.box.maxZ >> 4; cz++) cs.add(genChunk(cx, cz));
    const chests = [...cs].flatMap((o) => o.blockEntities.filter((b) => b.id === 'chest' && withChest.box.isInside(b.x, b.y, b.z)));
    check(`a ${withChest.constructor.name} has its chest`, chests.length >= 1 && /stronghold_/.test(chests[0].data.lootTable), JSON.stringify(chests.map((c) => c.data)));
    for (const c of chests) {
      const st = blockAt(c.x, c.y, c.z);
      check('  the chest block is there', blockOf(st).name === 'chest', `${blockOf(st).name} facing ${blockOf(st).get(st, 'facing')}`);
    }
  } else console.log('  (no chest piece in stronghold 0)');
}
// determinism of a chunk
{
  const k = [...chunks.keys()][0].split(',').map(Number);
  const a = chunks.get(k.join(',')).blocks;
  const b = new genMod.ChunkGenerator(SEED).generate(k[0], k[1]).blocks;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  check('the same chunk twice is the same', diff === 0, String(diff));
}
// the terrain is buried round it
check('terrain adjustment near it', !!gen.strongholds.buryFor(room.box.minX >> 4, room.box.minZ >> 4));
check('none far away', !gen.strongholds.buryFor(0, 0) && !gen.strongholds.buryFor(5000, 5000));

// --- loot
{
  let books = 0, ench = 0, templ = 0, pearls = 0;
  for (let k = 0; k < 300; k++) {
    for (const s of lootMod.rollLoot('chests/stronghold_library', new rngMod.Rand(k))) {
      if (s.item.id === 'enchanted_book') { ench++; if (!s.tag?.stored || !Object.keys(s.tag.stored).length) books = -1e9; }
      if (s.item.id === 'book') books++;
    }
    for (const s of lootMod.rollLoot('chests/stronghold_corridor', new rngMod.Rand(k))) if (s.item.id === 'ender_pearl') pearls++;
    void templ;
  }
  check('libraries hold books and enchanted books', books > 0 && ench > 0, `${books} books, ${ench} enchanted in 300 chests`);
  check('corridor altars hold ender pearls', pearls > 0, String(pearls));
  const sample = lootMod.rollLoot('chests/stronghold_library', new rngMod.Rand(7)).filter((s) => s.item.id === 'enchanted_book').map((s) => JSON.stringify(s.tag.stored));
  console.log('   enchanted books:', sample.join(' '));
  check('crossing table rolls', lootMod.rollLoot('chests/stronghold_crossing', new rngMod.Rand(3)).length >= 1);
}

// --- locate and being inside
{
  const tn = Date.now();
  const [x, z] = sh.nearest(0, 64, 0);
  const ms = Date.now() - tn;
  const d = Math.hypot(x, z);
  check('the nearest from spawn is in the first ring', d >= 1280 && d <= 2816, `[${x}, ${z}] ${Math.round(d)} blocks, ${ms} ms`);
  const c = sh.chunkOf(0), c1 = sh.chunkOf(1), c2 = sh.chunkOf(2);
  check('it is one of them', [c, c1, c2].some((q) => q[0] * 16 === x && q[1] * 16 === z));
  const [x2, z2] = sh.nearest(x + 3, 30, z - 3);
  check('standing on it, it is that one', x2 === x && z2 === z);
  const s = sh.start(sh.ring.findIndex((_, i) => sh.chunkOf(i)[0] * 16 === x && sh.chunkOf(i)[1] * 16 === z));
  const p = s.portalRoom.box;
  check('inside the portal room counts as in the stronghold', sh.pieceAt((p.minX + p.maxX) >> 1, p.minY + 2, (p.minZ + p.maxZ) >> 1));
  check('above it does not', !sh.pieceAt((p.minX + p.maxX) >> 1, 120, (p.minZ + p.maxZ) >> 1));
  check('spawn is not', !sh.pieceAt(0, 40, 0));
}

console.log(`${fails ? fails + ' FAILED' : 'all ok'} (${Date.now() - t0} ms)`);
await close();
process.exit(fails ? 1 : 0);

// M1: desert pyramids and swamp huts — where they go (biomes, one per region, the lowest-Y rule), their pieces in
// every orientation, the chests' loot, the pressure plate over the TNT, the witch and the hut's spawn override,
// /locate, and what they cost chunk generation.

import { load, check, buildLevel, blockName, localGet, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load();
const SEED = '12345';
const gen = new m.ChunkGenerator(SEED);
const T = gen.temples;
const HORIZONTAL = ['north', 'east', 'south', 'west'];

// ---------------------------------------------------------------------------------------------------------------
// Placement

{
  // a made-up terrain: the biome and heights are whatever the test says
  const fake = (biome, height) => new m.Temples(987654321n, { firstFreeHeight: height, oceanFloorHeight: height, quartBiome: () => biome });
  const t = fake(m.B.desert, () => 70);
  let inWindow = true, all = true;
  for (let rx = -4; rx < 4; rx++)
    for (let rz = -4; rz < 4; rz++) {
      const s = t.stub('desert_pyramid', rx, rz);
      if (!s) all = false;
      else if (s.cx < rx * 32 || s.cx > rx * 32 + 23 || s.cz < rz * 32 || s.cz > rz * 32 + 23) inWindow = false;
    }
  check('placement: a pyramid in every region of an all-desert world, each in its region\'s 24 x 24 window', all && inWindow);
  check('placement: no pyramid or hut where the biome is plains', !fake(m.B.plains, () => 70).stub('desert_pyramid', 0, 0) && !fake(m.B.plains, () => 70).stub('swamp_hut', 0, 0));
  check('placement: no hut in a desert, no pyramid in a swamp', !fake(m.B.desert, () => 70).stub('swamp_hut', 0, 0) && !fake(m.B.swamp, () => 70).stub('desert_pyramid', 0, 0));
  // getLowestY: first occupied height (first free - 1) at the corners (x, z), (x, z + 21), (x + 21, z), (x + 21, z + 21)
  const [cx, cz] = t.potentialChunk('desert_pyramid', 0, 0);
  const x0 = cx * 16, z0 = cz * 16;
  check('lowest-Y: ground at sea level (63) everywhere is enough', !!fake(m.B.desert, () => 64).stub('desert_pyramid', 0, 0));
  check('lowest-Y: ground one below sea level everywhere is not', !fake(m.B.desert, () => 63).stub('desert_pyramid', 0, 0));
  const oneCorner = (cx2, cz2) => (x, z) => (x === cx2 && z === cz2 ? 60 : 80);
  check('lowest-Y: one low far corner (x + 21, z + 21) rules it out', !fake(m.B.desert, oneCorner(x0 + 21, z0 + 21)).stub('desert_pyramid', 0, 0));
  check('lowest-Y: one low near corner (x, z) rules it out', !fake(m.B.desert, oneCorner(x0, z0)).stub('desert_pyramid', 0, 0));
  check('lowest-Y: a low spot that isn\'t a corner doesn\'t', !!fake(m.B.desert, oneCorner(x0 + 10, z0 + 10)).stub('desert_pyramid', 0, 0));
  check('lowest-Y: huts have no such rule (they stand in water)', !!fake(m.B.swamp, () => 40).stub('swamp_hut', 0, 0));
}

{
  // the real world: every start found is in one of its biomes (and a pyramid's corners are high enough)
  let n = { desert_pyramid: 0, swamp_hut: 0 }, ok = true, heightOk = true;
  const BIOMES = { desert_pyramid: [m.B.desert], swamp_hut: [m.B.swamp] };
  for (let rx = -14; rx < 14; rx++)
    for (let rz = -14; rz < 14; rz++)
      for (const kind of ['desert_pyramid', 'swamp_hut']) {
        const s = T.stub(kind, rx, rz);
        if (!s) continue;
        n[kind]++;
        if (!BIOMES[kind].includes(gen.quartBiome(s.cx * 16 + 8, s.cz * 16 + 8))) ok = false;
        if (kind === 'desert_pyramid') {
          const x = s.cx * 16, z = s.cz * 16, h = (a, b) => gen.firstFreeHeight(a, b) - 1;
          if (Math.min(h(x, z), h(x, z + 21), h(x + 21, z), h(x + 21, z + 21)) < 63) heightOk = false;
        }
      }
  console.log(`     (seed ${SEED}, 28 x 28 regions: ${n.desert_pyramid} desert pyramids, ${n.swamp_hut} swamp huts)`);
  check('seed 12345: every pyramid and hut stands in its biome', ok && n.desert_pyramid > 0 && n.swamp_hut > 0);
  check('seed 12345: every pyramid\'s corners are at sea level or above', heightOk);
  // one per region, and only the chunks next to its start chunk reach it
  let once = true;
  for (let cx = 360; cx < 372; cx++)
    for (let cz = 365; cz < 377; cz++) {
      const near = T.startsNear('desert_pyramid', cx, cz);
      for (const s of near) if (Math.abs(s.cx - cx) > 1 || Math.abs(s.cz - cz) > 1) once = false;
      if (near.length > 1) once = false;
    }
  check('one start per region, reaching only the chunks round its start chunk', once);
}

// ---------------------------------------------------------------------------------------------------------------
// The pieces in all four orientations, placed on a flat desert (y 70 up is air)

function flatContexts(piece) {
  const b = piece.box;
  const out = [];
  for (let cx = b.minX >> 4; cx <= b.maxX >> 4; cx++)
    for (let cz = b.minZ >> 4; cz <= b.maxZ >> 4; cz++) {
      const blocks = new Uint16Array(m.COLUMN_VOLUME);
      const SS = m.S('sandstone'), ST = m.S('stone');
      for (let y = m.MIN_Y; y < 70; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) blocks[m.colIndex(lx, y, lz)] = y < 60 ? ST : SS;
      const ctx = new m.GenContext(cx, cz, blocks, new Uint8Array(256));
      ctx.computeHeightmaps();
      out.push(ctx);
    }
  return out;
}
function placeFlat(piece, afterPlace) {
  const ctxs = flatContexts(piece);
  for (const ctx of ctxs) {
    const chunk = new m.BoundingBox(ctx.x0, m.MIN_Y + 1, ctx.z0, ctx.x0 + 15, m.MAX_Y - 1, ctx.z0 + 15);
    piece.postProcess(ctx, chunk, new m.Rand(ctx.cx * 31 + ctx.cz, 7));
    afterPlace?.(ctx, chunk);
  }
  const at = (x, y, z) => {
    const [wx, wy, wz] = [piece.worldX(x, z), piece.worldY(y), piece.worldZ(x, z)];
    const ctx = ctxs.find((c) => c.inChunk(wx, wz));
    return ctx ? ctx.getOrAir(wx, wy, wz) : -1;
  };
  return { ctxs, at };
}
const fixed = (i) => ({ nextInt: () => i });
const stepOf = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };

{
  const layouts = [];
  for (let i = 0; i < 4; i++) {
    const p = new m.DesertPyramidPiece(5n, fixed(i), 1600, 3200);
    p.moveToY(70);
    const { ctxs, at } = placeFlat(p, (ctx, chunk) => p.afterPlace(ctx, chunk));
    const name = (x, y, z) => blockName(m, at(x, y, z));
    const d = HORIZONTAL[i];
    check(`pyramid (${d}): the stone pressure plate over cut sandstone over TNT`, name(10, -11, 10) === 'stone_pressure_plate' && name(10, -12, 10) === 'cut_sandstone');
    let tnt = 0;
    for (let x = 9; x <= 11; x++) for (let z = 9; z <= 11; z++) if (name(x, -13, z) === 'tnt') tnt++;
    check(`pyramid (${d}): nine TNT under the plate`, tnt === 9, `${tnt}`);
    check(`pyramid (${d}): blue terracotta in the middle of the hall's star`, name(10, 0, 10) === 'blue_terracotta' && name(10, 0, 7) === 'orange_terracotta');
    // four chests, each in its alcove facing the middle of the room, with the pyramid's loot table
    const chests = ctxs.flatMap((c) => c.blockEntities.filter((b) => b.id === 'chest'));
    let facingOk = true;
    for (const [lx, lz] of [[12, 10], [8, 10], [10, 8], [10, 12]]) {
      const st = at(lx, -11, lz);
      if (blockName(m, st) !== 'chest') { facingOk = false; continue; }
      const f = m.blockOf(st).get(st, 'facing');
      const [wx, , wz] = p.worldPos(lx, -11, lz);
      const [mx, , mz] = p.worldPos(10, -11, 10);
      const [sx, sz] = stepOf[f];
      if (Math.sign(mx - wx) !== sx || Math.sign(mz - wz) !== sz) facingOk = false;
    }
    check(`pyramid (${d}): four chests facing into the room, with chests/desert_pyramid`, chests.length === 4 && chests.every((c) => c.data.lootTable === 'chests/desert_pyramid') && facingOk);
    // the cellar: its sand (and the collapsed roof's patch of sand and sandstone); the roof's place and 5-7 of the
    // cellar's are suspicious sand (M4: tests/temples/m4a-archaeology.mjs)
    const sand = p.suspiciousSand();
    let sandOk = sand.length === 84, sus = 0;
    for (const [x, y, z] of sand) {
      const ctx = ctxs.find((c) => c.inChunk(x, z));
      const n = blockName(m, ctx.getOrAir(x, y, z));
      if (n === 'suspicious_sand') sus++;
      else if (n !== 'sand') sandOk = false;
    }
    check(`pyramid (${d}): the cellar's 83 places and the roof's one are sand, 6-8 of them suspicious`, sandOk && sus >= 6 && sus <= 8, `${sus}`);
    let roof = 0;
    for (let x = 14; x <= 18; x++) for (let z = 11; z <= 15; z++) if (['sand', 'sandstone', 'suspicious_sand'].includes(name(x, 0, z))) roof++;
    check(`pyramid (${d}): the collapsed roof over the cellar`, roof === 25);
    check(`pyramid (${d}): the cellar's stairs under the sand`, name(13, -1, 17) === 'sandstone_stairs' && name(14, -2, 17) === 'sandstone_stairs' && name(15, -3, 17) === 'sandstone_stairs');
    // the same blocks in every orientation (bar the random ones)
    const random = (x, y, z) => (y === 0 && x >= 14 && x <= 18 && z >= 11 && z <= 15) || (z === 17 && y >= -3 && y <= -1);
    const lay = [];
    // (which of the cellar's sand is suspicious depends on where each block is in the world)
    for (let y = -14; y <= 14; y++) for (let x = 0; x < 21; x++) for (let z = 0; z < 21; z++) lay.push(random(x, y, z) ? '' : name(x, y, z).replace('suspicious_sand', 'sand'));
    layouts.push(lay);
  }
  check('pyramid: the same blocks in all four orientations', layouts.every((l) => l.every((n, i) => n === layouts[0][i])));
  // stairs keep their place in the design: the tower tops' stairs have their tall side toward the middle (a little
  // roof), in every orientation (vanilla: the stair at local (2, 10, 0) faces north, which unturned is local +z)
  let stairsOk = true;
  for (let i = 0; i < 4; i++) {
    const p = new m.DesertPyramidPiece(5n, fixed(i), 1600, 3200);
    p.moveToY(70);
    const { at } = placeFlat(p);
    for (const [x, z, out] of [[2, 0, [0, -1]], [2, 4, [0, 1]], [0, 2, [-1, 0]], [4, 2, [1, 0]]]) {
      const st = at(x, 10, z);
      const [sx, sz] = stepOf[m.blockOf(st).get(st, 'facing')];
      const [ax, , az] = p.worldPos(x, 10, z), [bx, , bz] = p.worldPos(x - out[0], 10, z - out[1]);
      if (Math.sign(bx - ax) !== sx || Math.sign(bz - az) !== sz) stairsOk = false;
    }
  }
  check('pyramid: the tower tops\' stairs rise toward the middle in every orientation', stairsOk);
}

{
  const layouts = [];
  let cornersOk = true, witches = 0;
  for (let i = 0; i < 4; i++) {
    const p = new m.SwampHutPiece(5n, fixed(i), 1600, 3200);
    p.moveToY(70);
    const { ctxs, at } = placeFlat(p);
    const name = (x, y, z) => blockName(m, at(x, y, z));
    const d = HORIZONTAL[i];
    check(`hut (${d}): crafting table, cauldron and potted red mushroom`, name(3, 2, 6) === 'crafting_table' && name(4, 2, 6) === 'cauldron' && name(1, 3, 5) === 'potted_red_mushroom');
    check(`hut (${d}): spruce floor and roof, oak log corners, door gap and windows`, name(3, 1, 4) === 'spruce_planks' && name(3, 4, 4) === 'spruce_planks' && name(1, 3, 7) === 'oak_log' && name(4, 2, 2) === 'air' && name(4, 3, 2) === 'air' && name(1, 3, 4) === 'air');
    const ents = ctxs.flatMap((c) => c.entities);
    const w = ents.find((e) => e.id === 'witch');
    const [wx, wy, wz] = p.worldPos(2, 2, 5);
    if (w) witches++;
    check(`hut (${d}): the witch inside, persistent`, ents.length === 1 && w && w.persistent === true && w.x === wx + 0.5 && w.y === wy && w.z === wz + 0.5);
    // the roof's corner stairs: each one's outer corner points away from the hut
    for (const [x, z] of [[0, 1], [6, 1], [0, 8], [6, 8]]) {
      const st = at(x, 4, z);
      if (blockName(m, st) !== 'spruce_stairs' || !String(m.blockOf(st).get(st, 'shape')).startsWith('outer')) cornersOk = false;
    }
    const lay = [];
    for (let y = -1; y <= 6; y++) for (let x = 0; x < 7; x++) for (let z = 0; z < 9; z++) lay.push(name(x, y, z));
    layouts.push(lay);
  }
  check('hut: the same blocks in all four orientations', layouts.every((l) => l.every((n, i) => n === layouts[0][i])));
  check('hut: outer corner stairs at the roof\'s corners', cornersOk);
}

// ---------------------------------------------------------------------------------------------------------------
// Loot: chests/desert_pyramid

{
  const allowed = new Set(['diamond', 'iron_ingot', 'gold_ingot', 'emerald', 'bone', 'spider_eye', 'rotten_flesh', 'saddle', 'iron_horse_armor', 'golden_horse_armor',
    'diamond_horse_armor', 'enchanted_book', 'golden_apple', 'enchanted_golden_apple', 'gunpowder', 'string', 'sand', 'dune_armor_trim_smithing_template']);
  const ranges = { diamond: [1, 3], iron_ingot: [1, 5], gold_ingot: [2, 7], emerald: [1, 3], spider_eye: [1, 3], gunpowder: [1, 8], string: [1, 8], sand: [1, 8], bone: [1, 8], rotten_flesh: [1, 8] };
  let ok = true, seen = new Set(), books = 0, stacks = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const items = m.rollLoot('chests/desert_pyramid', new m.Rand(i * 7919 + 1, 0x100f));
    stacks += items.length;
    if (items.length < 4 || items.length > 8) ok = false;
    for (const s of items) {
      const id = s.item.id;
      seen.add(id);
      if (!allowed.has(id)) ok = false;
      const r = ranges[id];
      if (r && (s.count < r[0] || s.count > r[1])) ok = false;
      if (!r && s.count !== 1) ok = false;
      if (id === 'enchanted_book') books++;
    }
  }
  check('loot: only the table\'s items, in its counts, 4-8 stacks a chest', ok);
  check('loot: every item of the table the game has turns up', [...allowed].filter((i) => i !== 'dune_armor_trim_smithing_template').every((i) => seen.has(i)), [...allowed].filter((i) => !seen.has(i)).join(' '));
  // an enchanted book: weight 20 of 232 in each of the first pool's 2-4 rolls, so 0.26 books a chest
  const pBook = books / N;
  check(`loot: about a quarter of an enchanted book a chest (${pBook.toFixed(3)})`, pBook > 0.22 && pBook < 0.3);
  // a chest block entity rolls it when opened
  const be = new m.ChestBlockEntity(0, 64, 0);
  be.load({ id: 'chest', x: 0, y: 64, z: 0, items: [], data: { lootTable: 'chests/desert_pyramid', lootSeed: 12345 } });
  be.unpackLoot();
  check('loot: a pyramid chest fills when it\'s opened', be.container.items.filter(Boolean).length >= 4 && be.lootTable === null);
}

// ---------------------------------------------------------------------------------------------------------------
// The real pyramid and hut for seed 12345, in a World with a Level: the trap, the witch, the spawn override

const pyr = T.nearest('desert_pyramid', 0, 0);
const hut = T.nearest('swamp_hut', 0, 0);
console.log(`     (seed ${SEED}: nearest desert pyramid ${pyr}, swamp hut ${hut})`);

{
  const cx = pyr[0] >> 4, cz = pyr[1] >> 4;
  const start = T.start('desert_pyramid', Math.floor(cx / 32), Math.floor(cz / 32));
  const p = start.pieces[0];
  const { world, level, sounds } = buildLevel(m, gen, SEED, cx - 1, cz - 1, cx + 2, cz + 2);
  const name = (x, y, z) => blockName(m, localGet(m, world, p, x, y, z));
  check('real pyramid: plate, TNT and blue terracotta where they belong', name(10, -11, 10) === 'stone_pressure_plate' && name(10, -13, 10) === 'tnt' && name(10, 0, 10) === 'blue_terracotta');
  const chests = [...world.blockEntities.values()].filter((b) => b.lootTable === 'chests/desert_pyramid');
  check('real pyramid: its four chests are block entities waiting to roll chests/desert_pyramid', chests.length === 4);
  // a zombie steps on the plate: the plate powers the cut sandstone under it, which sets off the TNT
  const [px, py, pz] = p.worldPos(10, -11, 10);
  const z = new m.Zombie(level);
  z.moveTo(px + 0.5, py, pz + 0.5, 0, 0);
  level.addEntity(z);
  for (let i = 0; i < 4; i++) level.tick();
  const plate = world.getState(px, py, pz);
  check('trap: the stone pressure plate goes down under a mob', m.blockOf(plate).get(plate, 'powered') === true);
  const primed = () => level.entities.filter((e) => e.type === 'tnt').length;
  check('trap: the TNT under it is primed', primed() >= 1 && name(10, -13, 10) === 'air', `${primed()} primed`);
  for (let i = 0; i < 120; i++) level.tick();
  let left = 0;
  for (let x = 9; x <= 11; x++) for (let z2 = 9; z2 <= 11; z2++) if (name(x, -13, z2) === 'tnt') left++;
  check('trap: it blows, and takes the other eight TNT with it', left === 0 && sounds.some((s) => s.name === 'entity.generic.explode'), `${left} left`);
  // (a dropped item on the plate is not enough: stone plates only feel mobs)
  const { level: level2, world: world2 } = buildLevel(m, gen, SEED, cx, cz, cx + 1, cz + 1);
  const it = new m.ItemEntity(level2, new m.ItemStack(m.ITEMS.get('stone'), 1));
  it.moveTo(px + 0.5, py + 0.1, pz + 0.5);
  level2.addEntity(it);
  for (let i = 0; i < 20; i++) level2.tick();
  const plate2 = world2.getState(px, py, pz);
  check('trap: an item on the stone plate doesn\'t set it off', m.blockOf(plate2).get(plate2, 'powered') === false && blockName(m, world2.getState(px, py - 2, pz)) === 'tnt');
}

{
  const cx = hut[0] >> 4, cz = hut[1] >> 4;
  const start = T.start('swamp_hut', Math.floor(cx / 32), Math.floor(cz / 32));
  const p = start.pieces[0];
  const { world, level, outs } = buildLevel(m, gen, SEED, cx - 1, cz - 1, cx + 1, cz + 1);
  const name = (x, y, z) => blockName(m, localGet(m, world, p, x, y, z));
  check('real hut: its floor, cauldron and crafting table', name(3, 1, 4) === 'spruce_planks' && name(4, 2, 6) === 'cauldron' && name(3, 2, 6) === 'crafting_table');
  // the legs reach down to the ground or the swamp's bed
  let legsOk = true;
  for (const [x, z] of [[1, 2], [5, 2], [1, 7], [5, 7]]) {
    let y = -1;
    while (name(x, y, z) === 'oak_log') y--;
    if (['air', 'water'].includes(name(x, y, z))) legsOk = false;
  }
  check('real hut: its four oak legs stand on the ground', legsOk);
  const witches = outs.flatMap((o) => o.entities).filter((e) => e.id === 'witch');
  check('real hut: one witch placed with it', witches.length === 1);
  const w = m.loadEntity(witches[0], level);
  check('real hut: the witch loads as a persistent witch', w instanceof m.Witch && w.persistenceRequired === true);
  // spawn_overrides: monster → witch inside the hut's box (piece), the biome's list outside
  const sp = new m.NaturalSpawner(level, 1);
  const [ix, iy, iz] = p.worldPos(3, 2, 4);
  const inside = sp.mobsAt('monster', ix, iy, iz);
  check('spawns: inside the hut only witches (weight 1, 1-1)', inside.length === 1 && inside[0].type === 'witch' && inside[0].min === 1 && inside[0].max === 1);
  const [ux, uy, uz] = p.worldPos(3, 0, 4);
  check('spawns: under the hut, still in its box, witches too', sp.mobsAt('monster', ux, uy, uz)[0]?.type === 'witch');
  const [ox, oy, oz] = p.worldPos(3, 2, -3);
  const outside = sp.mobsAt('monster', ox, oy, oz);
  check('spawns: a few blocks outside, the swamp\'s own monsters', outside.length > 1 && outside.some((e) => e.type === 'zombie'));
  const [ax, ay, az] = p.worldPos(3, 7, 4);
  check('spawns: above the hut\'s box, the swamp\'s own monsters', sp.mobsAt('monster', ax, ay, az).length > 1);
  check('spawns: the creatures aren\'t overridden yet (cats)', m.structureMobsAt(level, 'creature', ix, iy, iz) === null);
}

// ---------------------------------------------------------------------------------------------------------------
// /locate

{
  const chat = [];
  const game = (x, z, dim = m.OVERWORLD) => ({ meta: { allowCommands: true }, chat: (s) => chat.push(s), world: { dim }, player: { x, z }, level: { seed: SEED } });
  m.executeCommand(game(0, 0), 'locate structure minecraft:desert_pyramid');
  m.executeCommand(game(0, 0), 'locate structure swamp_hut');
  m.executeCommand(game(0, 0, m.DIMENSIONS.the_nether), 'locate structure minecraft:swamp_hut');
  check('/locate desert_pyramid', chat[0]?.includes(`[${pyr[0]}, ~, ${pyr[1]}]`), chat[0]);
  check('/locate swamp_hut', chat[1]?.includes(`[${hut[0]}, ~, ${hut[1]}]`), chat[1]);
  check('/locate swamp_hut in the Nether finds none', /Could not find/.test(chat[2] ?? ''), chat[2]);
  // nothing in any nearer ring of regions
  const ringOf = (x, z) => Math.max(Math.abs(Math.floor((x >> 4) / 32)), Math.abs(Math.floor((z >> 4) / 32)));
  let nearer = false;
  const R = ringOf(pyr[0], pyr[1]);
  for (let rx = -R + 1; rx < R; rx++) for (let rz = -R + 1; rz < R; rz++) if (T.stub('desert_pyramid', rx, rz)) nearer = true;
  check('/locate: no pyramid in a nearer ring', !nearer);
}

// ---------------------------------------------------------------------------------------------------------------
// What it costs chunk generation

{
  const bare = new m.ChunkGenerator(SEED);
  bare['decorator'].temples = null;
  const time = (g, cx0, cz0) => {
    const t0 = performance.now();
    for (let cx = cx0; cx < cx0 + 4; cx++) for (let cz = cz0; cz < cz0 + 4; cz++) g.generate(cx, cz);
    return (performance.now() - t0) / 16;
  };
  const fresh = new m.ChunkGenerator(SEED);
  const pcx = (pyr[0] >> 4) - 1, pcz = (pyr[1] >> 4) - 1;
  // (warm both up on the same chunks first, then time them on others)
  time(fresh, pcx + 8, pcz + 8);
  time(bare, pcx + 8, pcz + 8);
  const withT = time(fresh, pcx, pcz), without = time(bare, pcx, pcz);
  console.log(`     (round the pyramid: ${withT.toFixed(1)} ms a chunk with temples, ${without.toFixed(1)} without)`);
  check('cost: chunks with a pyramid in them take no more than 25% longer', withT < without * 1.25 + 2);
  const t0 = performance.now();
  let n = 0;
  for (let cx = -200; cx < 200; cx += 3) for (let cz = -200; cz < 200; cz += 3) { fresh.temples.startsNear('desert_pyramid', cx, cz); fresh.temples.startsNear('swamp_hut', cx, cz); n++; }
  const per = (performance.now() - t0) / n;
  console.log(`     (looking for temples round a chunk: ${(per * 1000).toFixed(0)} µs)`);
  check('cost: looking for temples round a chunk takes well under a millisecond', per < 1);
}

await exitWithStatus(close);

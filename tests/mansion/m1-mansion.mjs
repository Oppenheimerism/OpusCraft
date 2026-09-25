// M1: woodland mansions — where they go (dark forests, one chance in each 80 × 80-chunk region spread triangularly,
// the lowest-corner rule), the grid and the pieces laid out on it (every storey's cells covered once, the outer
// walls, the roofs, rooms meeting their doorways in every orientation), the room templates (sizes, doorways,
// markers), a real mansion on seed 12345 (chests and their loot, persistent evokers and vindicators, the
// foundation), /locate, and what it costs chunk generation.

import { load, check, buildLevel, blockName, exitWithStatus } from '../temples/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/world/gen/mansion.ts', '/src/world/gen/mansionTemplates.ts', '/src/game/mansions.ts', '/src/entity/illagers.ts', '/src/entity/evoker.ts', '/src/world/gen/jigsaw.ts']);
const SEED = '12345';
const gen = new m.ChunkGenerator(SEED);
const M = gen.mansions;
/** vanilla getLowestYIn5by5BoxOffset7Blocks: which way the corners reach for each turn */
const reach = (rot) => [rot === 1 || rot === 2 ? -5 : 5, rot === 2 || rot === 3 ? -5 : 5];

// ---------------------------------------------------------------------------------------------------------------
// Placement

{
  // a made-up terrain: the biome and the heights are whatever the test says
  const fake = (biome, height) => new m.WoodlandMansions(987654321n, { firstFreeHeight: height, quartBiome: () => biome });
  const t = fake(m.B.dark_forest, () => 70);
  let all = true, inWindow = true;
  const offs = [];
  for (let rx = -10; rx < 10; rx++)
    for (let rz = -10; rz < 10; rz++) {
      const s = t.stub(rx, rz);
      if (!s) {
        all = false;
        continue;
      }
      const ox = s.cx - rx * 80, oz = s.cz - rz * 80;
      if (ox < 0 || ox > 59 || oz < 0 || oz > 59) inWindow = false;
      offs.push(ox, oz);
    }
  check('placement: a mansion in every region of an all-dark-forest world, each in its region\'s 60 x 60 window', all && inWindow);
  const mid = offs.filter((o) => o >= 20 && o <= 39).length / offs.length;
  check(`placement: spread triangularly (${(mid * 100).toFixed(0)}% of the offsets in the middle third; evenly it would be 33%)`, mid > 0.45);
  // vanilla setLargeFeatureWithSalt(seed, rx, rz, 10387319), then (nextInt(60) + nextInt(60)) / 2 for x and for z
  let salt = true;
  for (const [rx, rz] of [[0, 0], [3, -2], [-5, 7]]) {
    const seed = BigInt(rx) * 341873128712n + BigInt(rz) * 132897987541n + 987654321n + 10387319n;
    const r = new m.JavaRandom(Number(BigInt.asUintN(48, seed)));
    const i = Math.floor((r.nextInt(60) + r.nextInt(60)) / 2), j = Math.floor((r.nextInt(60) + r.nextInt(60)) / 2);
    const [cx, cz] = t.potentialChunk(rx, rz);
    if (cx !== rx * 80 + i || cz !== rz * 80 + j) salt = false;
  }
  check('placement: the start chunk drawn from the salt 10387319 as vanilla draws it', salt);
  check('placement: none in plains or a plain forest', !fake(m.B.plains, () => 70).stub(0, 0) && !fake(m.B.forest, () => 70).stub(0, 0));
  // the corners' first occupied height (first free - 1): y 60 is enough, 59 isn't
  const dark = m.B.dark_forest;
  check('lowest-Y: ground at y 60 everywhere is enough', !!fake(dark, () => 61).stub(0, 0));
  check('lowest-Y: ground at y 59 everywhere is not', !fake(dark, () => 60).stub(0, 0));
  // five blocks out from the start chunk's (7, 7), the way the mansion's turned
  const seen = new Set();
  let farLow = true, backLow = true, floorAt = true;
  for (let rx = 0; rx < 20 && seen.size < 4; rx++) {
    const s = t.stub(rx, 0);
    if (seen.has(s.rotation)) continue;
    seen.add(s.rotation);
    const [i, j] = reach(s.rotation);
    const low = (lx, lz) => (x, z) => (x === lx && z === lz ? 55 : 80);
    const f = new m.WoodlandMansions(987654321n, { firstFreeHeight: low(s.x + i, s.z + j), quartBiome: () => dark }).stub(rx, 0);
    if (f) farLow = false;
    const g = new m.WoodlandMansions(987654321n, { firstFreeHeight: low(s.x - i, s.z - j), quartBiome: () => dark }).stub(rx, 0);
    if (!g) backLow = false;
    const h = new m.WoodlandMansions(987654321n, { firstFreeHeight: (x, z) => (x === s.x + i && z === s.z ? 66 : 80), quartBiome: () => dark }).stub(rx, 0);
    if (!h || h.y !== 65 || h.x !== s.cx * 16 + 7 || h.z !== s.cz * 16 + 7) floorAt = false;
  }
  check('lowest-Y: in all four turns, a low corner five blocks out the way it\'s turned rules it out', seen.size === 4 && farLow);
  check('lowest-Y: a low spot five blocks out the other way doesn\'t', backLow);
  check('lowest-Y: the entrance is at the start chunk\'s (7, 7), on the lowest corner\'s ground', floorAt);
}

{
  // the real world: every mansion found stands in a dark forest, on ground at y 60 or above
  let n = 0, biome = true, height = true;
  for (let rx = -8; rx < 8; rx++)
    for (let rz = -8; rz < 8; rz++) {
      const s = M.stub(rx, rz);
      if (!s) continue;
      n++;
      if (gen.quartBiome(s.x, s.z) !== m.B.dark_forest) biome = false;
      const [i, j] = reach(s.rotation);
      const h = (a, b) => gen.firstFreeHeight(a, b) - 1;
      const low = Math.min(h(s.x, s.z), h(s.x, s.z + j), h(s.x + i, s.z), h(s.x + i, s.z + j));
      if (low < 60 || low !== s.y) height = false;
    }
  console.log(`     (seed ${SEED}, 16 x 16 regions: ${n} woodland mansions)`);
  check('seed 12345: every mansion stands in a dark forest', biome && n > 0);
  check('seed 12345: every mansion\'s floor is its lowest corner\'s ground, y 60 or above', height);
}

// ---------------------------------------------------------------------------------------------------------------
// The layout: many mansions laid out (no terrain needed)

const FRONT = /^1x2_[bd]\d|^1x2_d_stairs/, SIDE = /^1x2_[ac]\d|^1x2_c_stairs/;
/** where a room's door is (just outside it), in its own coordinates; null for a secret room */
function roomDoor(name) {
  if (/^1x1_[ab]\d/.test(name) || SIDE.test(name)) return [7, 3];
  if (FRONT.test(name)) return [3, 15];
  if (/^2x2_[ab]\d/.test(name)) return [15, 3];
  return null;
}
const cellsOf = (name) => (name.startsWith('1x1') ? 1 : name.startsWith('1x2') ? 2 : 4);
const isRoom = (name) => /^[12]x[12]_/.test(name);

{
  const used = new Set();
  let entrance = true, cover = true, walls = true, roofs = true, doors = true, overlap = true, stairs = true, third = 0;
  const N = 150;
  for (let k = 0; k < N; k++) {
    const r = m.largeFeatureRandom(4242n, k * 80, 17);
    const rot = r.nextInt(4);
    const O = [100, 70, -40];
    const { grid, placements } = m.generateMansion(O, rot, r);
    const pieces = placements.map((p) => new m.MansionPiece(p));
    for (const p of placements) used.add(p.name);
    if (placements[0].name !== 'entrance' || placements[0].rot !== rot) entrance = false;
    const house = (g, x, y) => m.isHouse(g, x, y);
    const count = (g, v) => {
      let c = 0;
      for (let x = 0; x < 11; x++) for (let y = 0; y < 11; y++) if (g.get(x, y) === v) c++;
      return c;
    };
    const edges = (g) => {
      let c = 0;
      for (let x = 0; x < 11; x++)
        for (let y = 0; y < 11; y++) if (house(g, x, y)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!house(g, x + dx, y + dy)) c++;
      return c;
    };
    const houses = (g) => {
      let c = 0;
      for (let x = 0; x < 11; x++) for (let y = 0; y < 11; y++) if (house(g, x, y)) c++;
      return c;
    };
    const at = (dy) => placements.filter((p) => p.y === O[1] + dy);
    const g1 = grid.baseGrid, g3 = grid.thirdFloorGrid;
    const hasThird = houses(g3) > 0;
    if (hasThird) third++;
    // every storey's room cells covered by exactly as many rooms' cells, its corridors by corridor floors
    for (const [dy, g] of [[0, g1], [8, g1], [19, g3]]) {
      const here = at(dy);
      const roomCells = here.filter((p) => isRoom(p.name)).reduce((a, p) => a + cellsOf(p.name), 0);
      if (roomCells !== count(g, 2) || here.filter((p) => p.name === 'corridor_floor').length !== count(g, 1)) cover = false;
    }
    // a wall piece on every outside edge of the house (the entrance holds its own front), both storeys, and the third's
    const n = (name, dy) => placements.filter((p) => p.name === name && p.y === O[1] + dy).length;
    if (n('wall_flat', 0) !== edges(g1) - 2 || n('wall_window', 8) !== edges(g1) - 2 || n('wall_window', 19) !== edges(g3)) walls = false;
    // a roof over every cell of the house not under the third storey, and over every cell of the third
    let under = 0;
    for (let x = 0; x < 11; x++) for (let y = 0; y < 11; y++) if (house(g1, x, y) && house(g3, x, y)) under++;
    if (n('roof', 19) !== houses(g1) - under || n('roof', 30) !== houses(g3)) roofs = false;
    // the staircase up when there's a third storey
    const st = placements.filter((p) => p.name.endsWith('_stairs'));
    if (st.length !== (hasThird ? 1 : 0) || st.some((p) => p.y !== O[1] + 8)) stairs = false;
    // every room's doorway meets the opening of an inner door piece
    const openings = new Set();
    for (const p of pieces) if (p.name.startsWith('indoors_door')) openings.add(p.worldPos(0, 1, 3).join());
    for (const p of pieces) {
      const d = isRoom(p.name) && roomDoor(p.name);
      if (d && !openings.has(p.worldPos(d[0], 1, d[1]).join())) doors = false;
    }
    // no two rooms, or a room and a corridor, share a block (the staircase's margin aside)
    const boxes = [];
    for (const p of pieces) {
      if (!isRoom(p.name) && p.name !== 'corridor_floor') continue;
      const [w, l] = p.name.startsWith('2x2') ? [15, 15] : p.name.startsWith('1x2') ? [7, 15] : [7, 7];
      const a = p.worldPos(0, 0, 0), b = p.worldPos(w - 1, 0, l - 1);
      boxes.push([Math.min(a[0], b[0]), p.placement.y, Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[2], b[2])]);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        if (a[1] === b[1] && a[0] <= b[3] && b[0] <= a[3] && a[2] <= b[4] && b[2] <= a[4]) overlap = false;
      }
  }
  console.log(`     (${N} mansions laid out, ${third} with a third storey)`);
  check('layout: the entrance first, turned with the mansion', entrance);
  check('layout: every storey\'s room cells covered by its rooms, its corridors by corridor floors', cover);
  check('layout: a wall on every outside edge, on both storeys and round the third', walls);
  check('layout: a roof over every cell not under the third storey, and over the third', roofs);
  check('layout: one staircase room on the second storey when there\'s a third, none when not', stairs);
  check('layout: every room\'s doorway meets an inner door piece\'s opening (all turns and mirrors)', doors);
  check('layout: no two rooms (or a room and a corridor) overlap', overlap);
  const rooms = m.mansionTemplateNames().filter(isRoom);
  const unused = rooms.filter((n) => !used.has(n));
  check(`layout: all ${rooms.length} room templates turn up`, unused.length === 0, unused.join(' '));
}

// ---------------------------------------------------------------------------------------------------------------
// The room templates

{
  const rooms = m.mansionTemplateNames().filter(isRoom);
  check('templates: 51 rooms, as vanilla has', rooms.length === 51, String(rooms.length));
  const MARKERS = new Set(['ChestNorth', 'ChestEast', 'ChestSouth', 'ChestWest', 'Mage', 'Warrior', 'Group of Allays']);
  const LIGHT = /lantern|glowstone|jack_o_lantern|campfire|lava/;
  let sizes = true, doorways = true, markers = true, mobs = true, chests = true, light = true;
  const bad = [];
  for (const name of rooms) {
    const t = m.mansionTemplate(name);
    const at = new Map();
    for (let i = 0; i < t.blocks.length; i += 4) at.set(`${t.blocks[i]},${t.blocks[i + 1]},${t.blocks[i + 2]}`, t.blocks[i + 3]);
    const get = (x, y, z) => at.get(`${x},${y},${z}`);
    const nm = (x, y, z) => (get(x, y, z) === undefined ? 'void' : get(x, y, z) === 0 ? 'air' : blockName(m, get(x, y, z)));
    const [w, l] = name.startsWith('2x2') ? [15, 15] : name.startsWith('1x2') ? [7, 15] : [7, 7];
    const stairsRoom = name.endsWith('_stairs');
    if (stairsRoom ? t.sx !== 9 || t.sy !== 19 || t.sz !== 17 || t.ox !== -1 || t.oz !== -1 : t.sx !== w || t.sy !== 8 || t.sz !== l || t.ox || t.oz) {
      sizes = false;
      bad.push(`size ${name}`);
    }
    // just inside the doorway, and a step further in, room to walk through
    const d = roomDoor(name);
    if (d) {
      const [ix, iz] = d[0] === w ? [w - 1, d[1]] : [d[0], l - 1];
      const [jx, jz] = d[0] === w ? [w - 2, d[1]] : [d[0], l - 2];
      const clear = (x, y, z) => get(x, y, z) === 0 || !(m.FLAGS[get(x, y, z)] & m.F_COLLIDE) || nm(x, y, z).endsWith('_carpet');
      const free = (x, z) => clear(x, 1, z) && clear(x, 2, z);
      if (!free(ix, iz) || !free(jx, jz)) {
        doorways = false;
        bad.push(`doorway ${name}`);
      }
    }
    for (const mk of t.markers) {
      if (!MARKERS.has(mk.name) || mk.x < 0 || mk.z < 0 || mk.x >= w || mk.z >= l) {
        markers = false;
        bad.push(`marker ${name} ${mk.name}`);
      }
      // a mob needs the block over it clear; a chest a lid that opens (nothing solid on it)
      const above = get(mk.x, mk.y + 1, mk.z);
      if (!mk.name.startsWith('Chest') && above !== 0) {
        mobs = false;
        bad.push(`mob ${name} ${mk.name} ${nm(mk.x, mk.y + 1, mk.z)}`);
      }
      if (mk.name.startsWith('Chest') && above !== undefined && above !== 0 && m.FLAGS[above] & m.F_OPAQUE) {
        chests = false;
        bad.push(`chest ${name} under ${nm(mk.x, mk.y + 1, mk.z)}`);
      }
    }
    // every room but the secret ones has a light
    if (d && ![...at.values()].some((st) => st > 0 && LIGHT.test(blockName(m, st)))) {
      light = false;
      bad.push(`dark ${name}`);
    }
  }
  check('templates: 7 x 7 (1x1), 7 x 15 (1x2), 15 x 15 (2x2); the staircases 19 high with a block round them', sizes);
  check('templates: every doorway leads into room to walk through', doorways);
  check('templates: markers vanilla\'s names, inside the room', markers);
  check('templates: every evoker, vindicator and allay marker has headroom', mobs);
  check('templates: nothing solid on a chest (it wouldn\'t open)', chests);
  check('templates: every room but the secret ones has a light', light);
  if (bad.length) console.log('     ' + bad.join('; '));
  check('templates: the structural pieces all build', ['entrance', 'wall_flat', 'wall_window', 'wall_corner', 'roof', 'roof_front', 'roof_corner', 'roof_inner_corner', 'small_wall', 'small_wall_corner', 'corridor_floor', 'carpet_north', 'carpet_east', 'carpet_south_1', 'carpet_south_2', 'carpet_west_1', 'carpet_west_2', 'indoors_wall_1', 'indoors_wall_2', 'indoors_door_1', 'indoors_door_2'].every((n) => m.mansionTemplate(n).blocks.length > 0));
}

// ---------------------------------------------------------------------------------------------------------------
// A real mansion: seed 12345, region 0, 0

const s = M.start(0, 0);
{
  check('seed 12345: region 0, 0 has a mansion, at chunk 40, 30', s && s.cx === 40 && s.cz === 30, s && `${s.cx}, ${s.cz}`);
  const b = s.bounds;
  const cx0 = b.minX >> 4, cz0 = b.minZ >> 4, cx1 = b.maxX >> 4, cz1 = b.maxZ >> 4;
  const { world, level, outs } = buildLevel(m, gen, SEED, cx0, cz0, cx1, cz1);
  const bes = outs.flatMap((o) => o.blockEntities ?? []), ents = outs.flatMap((o) => o.entities ?? []);
  const chests = bes.filter((e) => e.data?.lootTable === 'chests/woodland_mansion');
  console.log(`     (the mansion: ${s.pieces.length} pieces over ${(cx1 - cx0 + 1) * (cz1 - cz0 + 1)} chunks, ${chests.length} chests, ${ents.filter((e) => e.id === 'vindicator').length} vindicators, ${ents.filter((e) => e.id === 'evoker').length} evokers)`);
  check('real mansion: loot chests (chests/woodland_mansion), each a chest block with nothing solid on it', chests.length >= 8 && chests.every((c) => blockName(m, world.getState(c.x, c.y, c.z)) === 'chest' && !(m.FLAGS[world.getState(c.x, c.y + 1, c.z)] & m.F_OPAQUE)));
  const TABLE = new Set(m.LOOT_TABLES['chests/woodland_mansion'].flatMap((p) => p.entries.map((e) => e.item)));
  const loot = m.rollLoot('chests/woodland_mansion', new m.Rand(chests[0].data.lootSeed, 0));
  check('real mansion: a chest\'s loot comes from the table', loot.length > 0 && loot.every((st) => TABLE.has(st.item.id) || st.item.id === 'enchanted_book'), loot.map((st) => st.item.id).join(' '));
  const vind = ents.filter((e) => e.id === 'vindicator'), evo = ents.filter((e) => e.id === 'evoker');
  check('real mansion: vindicators and an evoker, persistent', vind.length >= 3 && evo.length >= 1 && [...vind, ...evo].every((e) => e.persistent === true));
  const v = m.loadEntity(vind[0], level), e = m.loadEntity(evo[0], level);
  check('real mansion: a vindicator loads persistent with its iron axe (finalized as a structure\'s)', v instanceof m.Vindicator && v.persistenceRequired && v.getItemBySlot('mainhand')?.item.id === 'iron_axe');
  check('real mansion: an evoker loads persistent', e instanceof m.Evoker && e.persistenceRequired);
  check('real mansion: every mob stands in the clear', ents.every((en) => {
    const x = Math.floor(en.x), z = Math.floor(en.z);
    return !(m.FLAGS[world.getState(x, en.y, z)] & m.F_COLLIDE) && !(m.FLAGS[world.getState(x, en.y + 1, z)] & m.F_COLLIDE);
  }));
  // the foundation: under the ground floor, nothing hollow (cobblestone down to the ground)
  let hollow = 0, cobble = 0;
  for (let x = b.minX; x <= b.maxX; x++)
    for (let z = b.minZ; z <= b.maxZ; z++) {
      const st = world.getState(x, s.y, z);
      if (!st || m.FLAGS[st] & m.F_AIR) continue;
      const below = blockName(m, world.getState(x, s.y - 1, z));
      if (below === 'air' || below === 'water') hollow++;
      if (below === 'cobblestone') cobble++;
    }
  check(`real mansion: a cobblestone foundation under the ground floor, nothing hollow (${cobble} blocks of it under the floor)`, hollow === 0 && cobble > 0);
  // the doorway: open, with the porch step before it
  const ent = s.pieces[0];
  const opening = [6, 7, 8].every((z) => [1, 2, 3].every((y) => { const [x, yy, zz] = ent.worldPos(16, y, z); return blockName(m, world.getState(x, yy, zz)) === 'air' || (y === 1 && blockName(m, world.getState(x, yy, zz)).endsWith('carpet')); }));
  check('real mansion: the front door is open, three wide', opening);
  const [rx, ry, rz] = ent.worldPos(4, 0, 7);
  check('real mansion: the entrance hall\'s floor is at the start\'s y', ry === s.y && blockName(m, world.getState(rx, ry, rz)) === 'dark_oak_planks');
  const shaped = outs.reduce((a, o) => a + (o.postProcess?.length ?? 0) / 3, 0);
  check('real mansion: stairs, fences and panes marked for shaping to their neighbours', shaped > 100, String(shaped));
}

// ---------------------------------------------------------------------------------------------------------------
// /locate

{
  const chat = [];
  const game = (x, z, dim = m.OVERWORLD) => ({ meta: { allowCommands: true }, chat: (t) => chat.push(t), world: { dim }, player: { x, z }, level: { seed: SEED } });
  m.executeCommand(game(0, 0), 'locate structure minecraft:mansion');
  m.executeCommand(game(0, 0), 'locate structure mansion');
  m.executeCommand(game(0, 0, m.DIMENSIONS.the_nether), 'locate structure minecraft:mansion');
  check('/locate mansion: the start chunk\'s corner, [640, ~, 480]', chat[0]?.includes('[640, ~, 480]'), chat[0]);
  check('/locate mansion (no namespace) the same', chat[1]?.includes('[640, ~, 480]'), chat[1]);
  check('/locate mansion in the Nether finds none', /Could not find/.test(chat[2] ?? ''), chat[2]);
  const far = m.locateMansion(SEED, -2000, 600);
  check('/locate from elsewhere finds that region\'s mansion ([-2240, ~, 576])', far?.[0] === -2240 && far?.[1] === 576, String(far));
}

// ---------------------------------------------------------------------------------------------------------------
// What it costs chunk generation

{
  const fresh = new m.ChunkGenerator(SEED);
  const bare = new m.ChunkGenerator(SEED);
  bare.mansions.place = () => {};
  const t0 = performance.now();
  fresh.mansions.start(0, 0);
  const layout = performance.now() - t0;
  const time = (g, cx0, cz0) => {
    const t = performance.now();
    for (let cx = cx0; cx < cx0 + 4; cx++) for (let cz = cz0; cz < cz0 + 4; cz++) g.generate(cx, cz);
    return (performance.now() - t) / 16;
  };
  // (warm both up on the same chunks first, then time them on the mansion's)
  time(fresh, 30, 20);
  time(bare, 30, 20);
  const withM = time(fresh, 40, 30), without = time(bare, 40, 30);
  console.log(`     (laying out a mansion: ${layout.toFixed(0)} ms; its chunks: ${withM.toFixed(1)} ms each, ${without.toFixed(1)} without it)`);
  check('cost: laying a mansion out takes under 150 ms', layout < 150);
  check('cost: a mansion\'s chunks take no more than 40% longer', withM < without * 1.4 + 3);
  const t1 = performance.now();
  let n = 0;
  for (let cx = -200; cx < 200; cx += 3) for (let cz = -200; cz < 200; cz += 3) (fresh.mansions.startsNear(cx, cz), n++);
  const per = (performance.now() - t1) / n;
  console.log(`     (looking for mansions round a chunk: ${(per * 1000).toFixed(0)} µs)`);
  check('cost: looking for mansions round a chunk takes well under a millisecond', per < 0.5);
}

await exitWithStatus(close);

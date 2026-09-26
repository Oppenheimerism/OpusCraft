// End cities (headless): node tests/end/endcity.mjs [seed]
// Placement, layout, generation of a whole city chunk by chunk, what's in it, and an isometric picture of it
// (tmp/end/endcity.png) and a map from above (tmp/end/endcity_map.png).
import { loadModules } from '../../scripts/load.mjs';
import { mkdirSync } from 'node:fs';
import { writePNG } from '../../scripts/png.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/world/gen/theEnd.ts', '/src/world/gen/endCity.ts', '/src/world/gen/endCityTemplates.ts',
  '/src/world/constants.ts', '/src/world/gen/biomes.ts', '/src/game/loot.ts', '/src/item/item.ts', '/src/inventory/container.ts', '/src/game/endCities.ts',
  '/src/core/rng.ts', '/src/world/gen/jigsaw.ts',
]);
const m = {};
for (const x of mods) Object.assign(m, x);
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const { BLOCKS, STATE_BLOCK, colIndex } = m;
const name = (st) => (st <= 0 ? 'air' : BLOCKS[STATE_BLOCK[st]].name);

// --- the templates
for (const [n, [sx, sy, sz]] of Object.entries(m.CITY_SIZES)) {
  const t = m.cityTemplate(n);
  let inside = true;
  for (let i = 0; i < t.blocks.length; i += 4) if (t.blocks[i] >= sx || t.blocks[i + 1] >= sy || t.blocks[i + 2] >= sz) inside = false;
  check(`template ${n} ${sx}x${sy}x${sz}: ${t.blocks.length / 4} blocks, ${t.markers.length} markers`, inside && t.sx === sx && t.sy === sy && t.sz === sz);
}
const markers = (n, k) => m.cityTemplate(n).markers.filter((x) => x.name === k).length;
check('the ship: an elytra marker, two chests, two brewing stands, the dragon head', markers('ship', 'Elytra') === 1 && markers('ship', 'Chest') === 2 &&
  m.cityTemplate('ship').blockEntities.filter((e) => e.id === 'brewing_stand' && e.items.length === 2 && e.items.every((s) => s[1] === 'potion' && s[4]?.potion?.potion === 'healing')).length === 2 &&
  m.cityTemplate('ship').blockEntities.some((e) => e.id === 'skull'));
check('fat tower tops: two chests', markers('fat_tower_top', 'Chest') === 2);
// every chest marker is over a chest
for (const n of Object.keys(m.CITY_SIZES)) {
  const t = m.cityTemplate(n);
  for (const mk of t.markers.filter((x) => x.name === 'Chest'))
    if (!t.blockEntities.some((e) => e.id === 'chest' && e.x === mk.x && e.y === mk.y - 1 && e.z === mk.z)) check(`${n}: chest under the marker at ${mk.x},${mk.y},${mk.z}`, false);
}

// --- placement
const seed = process.argv[2] ?? '1';
const gen = new m.EndGenerator(seed);
const C = gen.endCities;
{
  let tri = true;
  const hist = new Array(9).fill(0);
  for (let rx = -20; rx <= 20; rx++)
    for (let rz = -20; rz <= 20; rz++) {
      const [cx, cz] = C.potentialChunk(rx, rz);
      const i = cx - rx * 20, j = cz - rz * 20;
      if (i < 0 || i > 8 || j < 0 || j > 8) tri = false;
      hist[i]++;
    }
  check('the start chunk: 0..8 into its region, triangular (the middle likeliest)', tri && hist[4] > hist[0] * 2 && hist[4] > hist[8] * 2, hist.join(' '));
}
// cities within a few thousand blocks
const stubs = [];
let tried = 0, wrongBiome = 0, tooLow = 0;
for (let rx = -12; rx <= 12; rx++)
  for (let rz = -12; rz <= 12; rz++) {
    tried++;
    const [cx, cz] = C.potentialChunk(rx, rz);
    const b = gen.biomeOfChunk(cx, cz);
    const s = C.stub(rx, rz);
    if (s) stubs.push(s);
    else if (b !== m.B.end_highlands && b !== m.B.end_midlands) wrongBiome++;
    else tooLow++;
  }
console.log(`regions ${tried}: ${stubs.length} cities, ${wrongBiome} not highlands/midlands, ${tooLow} too low`);
check('some regions have cities, some are too low or in the wrong biome', stubs.length > 5 && tooLow > 0 && wrongBiome > 0);
check('none near the main island', stubs.every((s) => s.cx * s.cx + s.cz * s.cz > 4096));
check('every city at y 60 or above', stubs.every((s) => s.y >= 60));
{
  const s = stubs[0];
  const r = m.largeFeatureRandom(gen.seed, s.cx, s.cz);
  check('the turn is the start chunk\'s large-feature random\'s first draw', r.nextInt(4) === s.rot);
}
// /locate
{
  const f = m.locateEndCity(seed, 0, 0);
  check('/locate from the middle finds one, at a start chunk\'s corner', !!f && stubs.some((s) => s.cx * 16 === f[0] && s.cz * 16 === f[1]), JSON.stringify(f));
}

// --- layouts
const counts = {};
let ships = 0, maxPieces = 0, badOverlap = 0;
for (const s of stubs) {
  const rx = Math.floor(s.cx / 20), rz = Math.floor(s.cz / 20);
  const st = C.start(rx, rz);
  maxPieces = Math.max(maxPieces, st.pieces.length);
  for (const p of st.pieces) counts[p.name] = (counts[p.name] ?? 0) + 1;
  if (st.pieces.some((p) => p.name === 'ship')) ships++;
  // the same layout again
  const again = new m.EndCities(gen.seed, { biomeOfChunk: (a, b) => gen.biomeOfChunk(a, b), firstOccupiedHeight: (a, b) => gen.firstOccupiedHeight(a, b) }).start(rx, rz);
  if (JSON.stringify(again.pieces.map((p) => [p.name, p.x, p.y, p.z, p.rot])) !== JSON.stringify(st.pieces.map((p) => [p.name, p.x, p.y, p.z, p.rot]))) check('layout repeatable', false);
  // houses never overlap one another
  const houses = st.pieces.filter((p) => p.name === 'base_floor');
  for (let i = 0; i < houses.length; i++) for (let j = i + 1; j < houses.length; j++) if (houses[i].box.intersects(houses[j].box)) badOverlap++;
}
console.log('pieces over all cities:', JSON.stringify(counts));
check('cities have towers, bridges, houses, fat towers', counts.tower_base > 0 && counts.bridge_piece > 0 && counts.base_floor > stubs.length && counts.fat_tower_top > 0);
check('some cities have a ship, none two', ships > 0 && Object.values(counts).length && stubs.every((s) => C.start(Math.floor(s.cx / 20), Math.floor(s.cz / 20)).pieces.filter((p) => p.name === 'ship').length <= 1), `${ships} of ${stubs.length}`);
check('no two houses overlap', badOverlap === 0, String(badOverlap));

// --- one city (with a ship, if any has one), generated chunk by chunk
const pick = stubs.map((s) => C.start(Math.floor(s.cx / 20), Math.floor(s.cz / 20))).sort((a, b) => (b.pieces.some((p) => p.name === 'ship') - a.pieces.some((p) => p.name === 'ship')) || b.pieces.length - a.pieces.length)[0];
console.log(`city at chunk ${pick.cx},${pick.cz} (${pick.x}, ${pick.y}, ${pick.z}) turned ${pick.rot}: ${pick.pieces.length} pieces, box ${JSON.stringify(pick.bounds)}`);
const world = new Map();
const bes = [], ents = [];
const ck0 = Math.max(pick.cx - 8, pick.bounds.minX >> 4), ck1 = Math.min(pick.cx + 8, pick.bounds.maxX >> 4);
const cz0 = Math.max(pick.cz - 8, pick.bounds.minZ >> 4), cz1 = Math.min(pick.cz + 8, pick.bounds.maxZ >> 4);
const t0 = Date.now();
for (let cx = ck0; cx <= ck1; cx++)
  for (let cz = cz0; cz <= cz1; cz++) {
    const out = gen.generate(cx, cz);
    world.set(`${cx},${cz}`, out.blocks);
    bes.push(...out.blockEntities);
    ents.push(...out.entities);
  }
console.log(`generated ${(ck1 - ck0 + 1) * (cz1 - cz0 + 1)} chunks in ${Date.now() - t0} ms`);
const at = (x, y, z) => {
  const c = world.get(`${x >> 4},${z >> 4}`);
  return c ? c[colIndex(x & 15, y, z & 15)] : -1;
};
const inReach = (x, z) => world.has(`${x >> 4},${z >> 4}`);
// every piece is where the layout put it: its template's non-air blocks there (those not overwritten by later pieces)
{
  let wrong = 0, total = 0;
  const last = new Map();
  pick.pieces.forEach((p, i) => {
    const t = m.cityTemplate(p.name);
    for (let k = 0; k < t.blocks.length; k += 4) {
      if (t.blocks[k + 3] === 0 && !p.overwrite) continue;
      const [x, y, z] = p.pos(t.blocks[k], t.blocks[k + 1], t.blocks[k + 2]);
      last.set(`${x},${y},${z}`, [i, m.rotateState(t.blocks[k + 3], p.rot)]);
    }
  });
  for (const [k, [, st]] of last) {
    const [x, y, z] = k.split(',').map(Number);
    if (!inReach(x, z) || y < 1 || y > 255) continue;
    total++;
    const got = at(x, y, z);
    // (stairs change shape once placed; compare by block)
    if (STATE_BLOCK[got] !== STATE_BLOCK[st] && !(st === 0 && got === 0)) wrong++;
  }
  check('the world holds each piece\'s blocks (the later piece winning)', wrong === 0 && total > 1000, `${wrong} of ${total} wrong`);
}
const chests = bes.filter((b) => b.id === 'chest');
check('the city\'s chests have end_city_treasure', chests.length > 0 && chests.every((b) => b.data?.lootTable === 'chests/end_city_treasure' && typeof b.data.lootSeed === 'number'), `${chests.length} chests`);
check('each chest is a chest block', chests.every((b) => name(at(b.x, b.y, b.z)) === 'chest'));
const shulkers = ents.filter((e) => e.id === 'shulker');
check('shulkers sit at the sentries, on something', shulkers.length > 0 && shulkers.every((e) => at(Math.floor(e.x), e.y - 1, Math.floor(e.z)) > 0), `${shulkers.length} shulkers`);
if (pick.pieces.some((p) => p.name === 'ship')) {
  const ship = pick.pieces.find((p) => p.name === 'ship');
  const inWorld = inReach(ship.box.minX, ship.box.minZ) && inReach(ship.box.maxX, ship.box.maxZ);
  console.log(`the ship at ${ship.x},${ship.y},${ship.z} turned ${ship.rot}${inWorld ? '' : ' (partly beyond the 8 chunks)'}`);
  const frames = ents.filter((e) => e.id === 'item_frame');
  const f = frames[0];
  if (f) {
    const facing = f.data.facing, dx = [0, 0, 0, 0, -1, 1][facing], dz = [0, 0, -1, 1, 0, 0][facing];
    check('the ship\'s item frame holds an elytra, can be knocked out (drop chance 1), on the cabin wall', f.hand[0] === 'elytra' && f.data.dropChance === 1 && at(f.data.tileX - dx, f.data.tileY, f.data.tileZ - dz) > 0 && name(at(f.data.tileX, f.data.tileY, f.data.tileZ)) === 'air');
    check('the frame faces into the cabin (the template\'s south)', facing === [3, 4, 2, 5][ship.rot]);
  } else check('the ship\'s item frame', !inWorld);
  const stands = bes.filter((b) => b.id === 'brewing_stand');
  check('two brewing stands, two potions of healing each', !inWorld || (stands.length === 2 && stands.every((b) => b.items.length === 2 && b.items.every((s) => s[4].potion.potion === 'healing'))));
  const head = bes.find((b) => b.id === 'skull');
  check('the dragon head on the prow', !inWorld || (!!head && name(at(head.x, head.y, head.z)) === 'dragon_wall_head'));
}
// the towers' ladders run from the room under the roof to the top
{
  let broken = 0, towers = 0;
  for (let i = 0; i < pick.pieces.length; i++) {
    const p = pick.pieces[i];
    if (p.name !== 'tower_base') continue;
    towers++;
    const [x, , z] = p.pos(1, 0, 1);
    let y = p.y;
    const col = [];
    for (let j = i; j < pick.pieces.length; j++) {
      const q = pick.pieces[j];
      if (q.name === 'tower_base' && j > i) break;
      if (q.name !== 'tower_base' && q.name !== 'tower_piece') continue;
      const [qx, , qz] = q.pos(1, 0, 1);
      if (qx !== x || qz !== z) continue;
      y = q.y + (q.name === 'tower_base' ? 7 : 4);
    }
    for (let yy = p.y; yy < y; yy++) if (inReach(x, z) && name(at(x, yy, z)) !== 'ladder') col.push(yy);
    if (col.length) broken++;
  }
  check('every tower\'s ladder is whole', broken === 0, `${broken} of ${towers} broken`);
}
// the bridges' doorways are open, the step in front of each on the house side is there
{
  let blocked = 0, ends = 0;
  for (const p of pick.pieces) {
    if (p.name !== 'bridge_end') continue;
    ends++;
    for (let lx = 1; lx <= 3; lx++)
      for (let ly = 2; ly <= 4; ly++) {
        const [x, y, z] = p.pos(lx, ly, 0);
        if (inReach(x, z) && at(x, y, z) !== 0 && name(at(x, y, z)) !== 'ladder') blocked++;
      }
  }
  check('bridge doorways are open', blocked === 0, `${blocked} blocks in ${ends} doorways`);
}
// the house's floors: its door and ladders
{
  let bad = 0;
  for (const p of pick.pieces) {
    if (p.name !== 'base_floor') continue;
    for (let lx = 4; lx <= 6; lx++) for (let ly = 1; ly <= 2; ly++) {
      const [x, y, z] = p.pos(lx, ly, 9);
      if (inReach(x, z) && at(x, y, z) !== 0 && name(at(x, y, z)) !== 'end_stone') bad++;
    }
  }
  check('house doors are open (or buried in the island)', bad === 0, String(bad));
}
// the loot
{
  const c = new m.SimpleContainer(27);
  m.fillContainer(c, 'chests/end_city_treasure', 12345);
  const got = c.items.filter(Boolean);
  check('end_city_treasure fills a chest', got.length >= 2, got.map((s) => `${s.count} ${s.item.id}`).join(', '));
  let enchanted = 0, rolls = 0;
  for (let i = 0; i < 300; i++) {
    const r = new m.Rand(i * 7919 + 1, 0x100f);
    for (const s of m.rollLoot('chests/end_city_treasure', r)) {
      rolls++;
      if (s.tag?.enchantments && Object.keys(s.tag.enchantments).length) enchanted++;
    }
  }
  check('its gear comes enchanted (levels 20-39)', enchanted > rolls * 0.2, `${enchanted} of ${rolls}`);
}
// in the city (The City at the End of the Game)
{
  const p = pick.pieces[0];
  const [x, y, z] = p.pos(4, 1, 4);
  check('a block in the first house is in the city', m.inEndCity(seed, x, y, z) && !m.inEndCity(seed, x, y + 200, z));
}

// --- pictures
{
  const S = 3;
  const b = pick.bounds;
  const W = (b.maxX - b.minX + b.maxZ - b.minZ + 4) * S * 2, H = ((b.maxX - b.minX + b.maxZ - b.minZ) * S + (b.maxY - Math.max(0, b.minY - 40) + 4) * S * 2) | 0;
  const img = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) img.set([20, 14, 30, 255], i * 4);
  const COL = (n) => (n.startsWith('purpur') ? [170, 120, 170] : n === 'magenta_stained_glass' ? [210, 70, 210] : n === 'end_rod' ? [250, 250, 240] : n === 'end_stone' ? [220, 222, 160] : n === 'chest' ? [160, 110, 40] : n === 'ladder' ? [140, 100, 50] : n === 'brewing_stand' ? [120, 120, 120] : n.includes('head') ? [40, 40, 40] : [120, 200, 120]);
  const pts = [];
  const y0 = Math.max(1, b.minY - 40);
  for (let x = b.minX - 2; x <= b.maxX + 2; x++)
    for (let z = b.minZ - 2; z <= b.maxZ + 2; z++) {
      if (!inReach(x, z)) continue;
      for (let y = y0; y <= Math.min(255, b.maxY + 1); y++) {
        const st = at(x, y, z);
        if (st > 0) pts.push([x, y, z, name(st)]);
      }
    }
  pts.sort((a, c) => a[0] + a[1] + a[2] - (c[0] + c[1] + c[2]));
  const ox = (b.maxZ - b.minZ + 2) * S * 2, oy = (b.maxY - y0 + 2) * S * 2;
  const put = (px, py, c) => { if (px >= 0 && py >= 0 && px < W && py < H) img.set([...c, 255], (py * W + px) * 4); };
  for (const [x, y, z, n] of pts) {
    const X = x - b.minX, Y = y - y0, Z = z - b.minZ;
    const sx = ox + (X - Z) * S * 2, sy = oy + (X + Z) * S - Y * S * 2;
    const c = COL(n);
    for (let i = -2 * S; i < 2 * S; i++)
      for (let j = -S; j < S; j++) if (Math.abs(i) / (2 * S) + Math.abs(j) / S <= 1) put(sx + i, sy + j - S, c.map((v) => v));
    for (let i = 0; i < 2 * S; i++) for (let j = 0; j < 2 * S; j++) {
      put(sx - 2 * S + i, sy + j + Math.floor(i / 2) - S + S, c.map((v) => v * 0.75));
      put(sx + i, sy + j + S - Math.floor(i / 2) - 1 + 0, c.map((v) => v * 0.55));
    }
  }
  mkdirSync('tmp/end', { recursive: true }); // tmp/ is gitignored and may not exist in a fresh clone
  writePNG('tmp/end/endcity.png', W, H, img);
  // a map from above: the top block's colour, darker lower down
  const MW = b.maxX - b.minX + 5, MH = b.maxZ - b.minZ + 5, K = 3;
  const map = new Uint8Array(MW * K * MH * K * 4);
  for (let i = 0; i < map.length; i += 4) map.set([20, 14, 30, 255], i);
  for (let x = b.minX - 2; x <= b.maxX + 2; x++)
    for (let z = b.minZ - 2; z <= b.maxZ + 2; z++) {
      if (!inReach(x, z)) continue;
      for (let y = 255; y >= 1; y--) {
        const st = at(x, y, z);
        if (st <= 0) continue;
        const f = 0.4 + 0.6 * Math.min(1, (y - y0) / (b.maxY - y0));
        const c = COL(name(st)).map((v) => Math.min(255, v * f));
        for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) map.set([...c, 255], (((z - b.minZ + 2) * K + j) * MW * K + (x - b.minX + 2) * K + i) * 4);
        break;
      }
    }
  writePNG('tmp/end/endcity_map.png', MW * K, MH * K, map);
  console.log('wrote tmp/end/endcity.png and tmp/end/endcity_map.png');
}

console.log(fails ? `${fails} FAILED` : 'all passed');
await close();
process.exit(fails ? 1 : 0);

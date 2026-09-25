// M2: the ancient city and the deep dark's features. Where cities are placed (only in the deep dark, one to a
// region, the start at y -27), what a city is made of (its centre, quarters, entrance, buildings and sculk), the
// processors' random matching vanilla's, the chests' loot, the sculk the deep dark grows, /locate, and what a city
// costs chunk generation.
// Run: node tests/ancient-city/m2-city.mjs

import { check, exitWithStatus } from './lib.mjs';
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/gen/generator.ts', '/src/world/gen/ancientCity.ts', '/src/world/gen/ancientCityTemplates.ts', '/src/world/gen/jigsaw.ts',
  '/src/game/ancientCities.ts', '/src/game/loot.ts', '/src/item/item.ts', '/src/core/rng.ts', '/src/world/block.ts', '/src/world/constants.ts', '/src/world/gen/biomes.ts',
  '/src/world/gen/deepDark.ts',
]);
const m = {};
for (const mod of mods) Object.assign(m, mod);
const name = (st) => m.BLOCKS[m.STATE_BLOCK[st]].name;

// ---------------------------------------------------------------------------------------------------------------
// The processors' random: vanilla RandomSource.create(Mth.getSeed(pos)).nextFloat(), done in BigInt

{
  const s64 = (v) => BigInt.asIntN(64, v);
  const getSeed = (x, y, z) => {
    let i = s64(BigInt(Math.imul(x, 3129871)) ^ s64(BigInt(z) * 116129781n) ^ BigInt(y));
    i = s64(i * i * 42317861n + i * 11n);
    return i >> 16n;
  };
  const firstFloat = (seed) => {
    const s = (seed ^ 0x5deece66dn) & ((1n << 48n) - 1n);
    const n = (s * 0x5deece66dn + 0xbn) & ((1n << 48n) - 1n);
    return Number(n >> 24n) / 16777216;
  };
  const r = new m.Rand(7, 1);
  let bad = 0;
  const pts = [[0, 0, 0], [1, -52, 1], [-1, -1, -1], [30000000, 319, -30000000], [-29999999, -64, 29999999], [2147483, 7, -2147483]];
  for (let i = 0; i < 3000; i++) pts.push([r.nextInt(2000000) - 1000000, r.nextInt(384) - 64, r.nextInt(2000000) - 1000000]);
  for (const [x, y, z] of pts) if (m.positionFloat(x, y, z) !== firstFloat(getSeed(x, y, z))) bad++;
  check('processors: the position random is vanilla Mth.getSeed then LegacyRandomSource.nextFloat', bad === 0, `${bad} of ${pts.length} differ`);
}

// ---------------------------------------------------------------------------------------------------------------
// Placement

const SEED = '12345';
const gen = new m.ChunkGenerator(SEED);
const cities = gen.ancientCities;
{
  let found = 0, notDeep = 0, outside = 0, badY = 0;
  for (let rx = -12; rx < 12; rx++)
    for (let rz = -12; rz < 12; rz++) {
      const s = cities.stub(rx, rz);
      const [pcx, pcz] = cities.potentialChunk(rx, rz);
      if (pcx < rx * 24 || pcx > rx * 24 + 15 || pcz < rz * 24 || pcz > rz * 24 + 15) outside++;
      if (!s) continue;
      found++;
      if (gen.biome3(s.x, s.y, s.z) !== m.B.deep_dark) notDeep++;
      if (s.y !== -27 || s.cx !== pcx || s.cz !== pcz) badY++;
    }
  check('placement: one potential start a region, in its first 16 chunks (spacing 24, separation 8)', outside === 0);
  check('placement: cities in some regions but not all', found > 5 && found < 24 * 24 * 0.9, `${found} of 576`);
  check('placement: every city\'s centre is in the deep dark at y -27', notDeep === 0 && badY === 0, `${notDeep} not deep dark, ${badY} off`);
  // a region has no city only when the centre its start piece would have isn't in the deep dark
  let wrong = 0, tried = 0;
  const seed64 = m.worldSeed64(SEED);
  for (let rx = -12; rx < 12; rx++)
    for (let rz = -12; rz < 12; rz++) {
      if (cities.stub(rx, rz)) continue;
      const [pcx, pcz] = cities.potentialChunk(rx, rz);
      const s = m.cityStart(m.largeFeatureRandom(seed64, pcx, pcz), pcx, pcz);
      tried++;
      if (s && gen.biome3(s.x, s.y, s.z) === m.B.deep_dark) wrong++;
    }
  check('placement: the other regions have none, their start\'s centre not being in the deep dark', wrong === 0 && tried > 0, `${wrong} of ${tried}`);
}

// the nearest city to the origin, and its pieces
const [lx, lz] = m.locateAncientCity(SEED, 0, 0);
const layout = cities.near(lx >> 4, lz >> 4)[0];
{
  // vanilla's search: rings of regions outwards, x then z, the first one met on the nearest ring with one
  let first = null;
  for (let ring = 0; ring <= 100 && !first; ring++)
    for (let i = -ring; i <= ring && !first; i++)
      for (let j = -ring; j <= ring && !first; j++) {
        if (Math.abs(i) !== ring && Math.abs(j) !== ring) continue;
        const s = cities.stub(i, j);
        if (s) first = [s.cx * 16, s.cz * 16];
      }
  check('/locate: the corner of the start chunk of the first city on the nearest ring of regions', first && first[0] === lx && first[1] === lz, `${lx},${lz} vs ${first}`);
  check('/locate: seed 12345 from the origin finds the city at 528, -224', lx === 528 && lz === -224, `${lx},${lz}`);
}

{
  const P = layout.pieces;
  const id = (p) => p.element.template?.id ?? (p.element.elements ? p.element.elements[0].template.id : p.element.constructor.name);
  const start = P[0];
  const s = cities.stub(Math.floor((lx >> 4) / 24), Math.floor((lz >> 4) / 24));
  check('start: a city centre, the first piece', /^ancient_city\/city_center\/city_center_[123]$/.test(id(start)));
  const anchor = start.element.jigsaws(start.x, start.y, start.z, start.rot).find((j) => j.info.name === 'minecraft:city_anchor');
  check('start: its city_anchor one below y -27 (lowered by its ground level delta), the floor at y -52', anchor.y === -28 && start.box.minY === -52, `anchor ${anchor.y}, floor ${start.box.minY}`);
  check('start: the anchor at the start chunk\'s corner', anchor.x === s.cx * 16 && anchor.z === s.cz * 16);
  check('start: the stub at the centre of the start piece', s.x === Math.trunc((start.box.minX + start.box.maxX) / 2) && s.z === Math.trunc((start.box.minZ + start.box.maxZ) / 2));
  const quarters = P.filter((p) => /city_center\/walls\//.test(id(p)));
  check('pieces: the centre has its quarters round it (the sides and corners of the city with its outer wall)', quarters.length >= 6, `${quarters.length}`);
  check('pieces: the entrance, its connector and a path', P.some((p) => /entrance_connector/.test(id(p))) && P.some((p) => /entrance_path/.test(id(p))));
  const structures = P.filter((p) => /ancient_city\/structures\//.test(id(p)));
  check('pieces: buildings and ruins on the plots', structures.length >= 10, `${structures.length}`);
  check('pieces: the ice box sometimes (a list piece) or barracks and chambers', structures.some((p) => /barracks|chamber|ice_box/.test(id(p))));
  const sculk = P.filter((p) => p.element instanceof m.CitySculkElement);
  check('pieces: sculk patches on the streets', sculk.length >= 10, `${sculk.length}`);
  const c = { x: s.x, z: s.z };
  const far = P.filter((p) => p.box.minX < c.x - 116 || p.box.maxX > c.x + 116 || p.box.minZ < c.z - 116 || p.box.maxZ > c.z + 116);
  check('pieces: within 116 blocks of the centre', far.length === 0);
  let overlap = 0;
  for (let i = 0; i < P.length; i++)
    for (let j = i + 1; j < P.length; j++) {
      const a = P[i].box, b = P[j].box;
      if (a.intersects(b) && !(a.minX >= b.minX && a.maxX <= b.maxX && a.minY >= b.minY && a.maxY <= b.maxY && a.minZ >= b.minZ && a.maxZ <= b.maxZ) && !(b.minX >= a.minX && b.maxX <= a.maxX && b.minY >= a.minY && b.maxY <= a.maxY && b.minZ >= a.minZ && b.maxZ <= a.maxZ)) overlap++;
    }
  check('pieces: none cut into another (only inside a parent\'s space)', overlap === 0, `${overlap} overlap`);
  console.log(`     (${P.length} pieces: ${quarters.length} quarters, ${structures.length} buildings, ${sculk.length} sculk patches; box ${layout.bounds.minX},${layout.bounds.minY},${layout.bounds.minZ} to ${layout.bounds.maxX},${layout.bounds.maxY},${layout.bounds.maxZ})`);
}

// ---------------------------------------------------------------------------------------------------------------
// The city generated

const b = layout.bounds;
const chunks = new Map();
let cityTime = 0;
for (let cz = b.minZ >> 4; cz <= b.maxZ >> 4; cz++)
  for (let cx = b.minX >> 4; cx <= b.maxX >> 4; cx++) {
    const t = performance.now();
    chunks.set(`${cx},${cz}`, gen.generate(cx, cz));
    cityTime += performance.now() - t;
  }
const at = (x, y, z) => chunks.get(`${x >> 4},${z >> 4}`).blocks[m.colIndex(x & 15, y, z & 15)];
{
  const counts = new Map();
  for (const o of chunks.values()) for (const st of o.blocks) if (st) counts.set(name(st), (counts.get(name(st)) ?? 0) + 1);
  const n = (k) => counts.get(k) ?? 0;
  check('built: reinforced deepslate (the frame at the centre)', n('reinforced_deepslate') >= 60, `${n('reinforced_deepslate')}`);
  check('built: deepslate tiles and bricks, polished, cobbled and chiseled deepslate', n('deepslate_tiles') > 1000 && n('deepslate_bricks') > 1000 && n('polished_deepslate') > 100 && n('cobbled_deepslate') > 50 && n('chiseled_deepslate') > 0);
  // (the processors crack about 3 in 10 of the bricks and tiles)
  const cracked = n('cracked_deepslate_bricks') / (n('cracked_deepslate_bricks') + n('deepslate_bricks'));
  const crackedTiles = n('cracked_deepslate_tiles') / (n('cracked_deepslate_tiles') + n('deepslate_tiles'));
  check('processors: about 30% of the bricks and tiles cracked', cracked > 0.25 && cracked < 0.37 && crackedTiles > 0.25 && crackedTiles < 0.37, `${cracked.toFixed(2)}, ${crackedTiles.toFixed(2)}`);
  check('built: soul lanterns, chains, candles, skulls, gray wool and carpet', n('soul_lantern') > 20 && n('chain') > 20 && n('candle') + n('white_candle') > 5 && n('skeleton_skull') > 0 && n('gray_wool') > 0 && n('gray_carpet') > 0);
  check('built: sculk, veins, sensors, shriekers and catalysts', n('sculk') > 500 && n('sculk_vein') > 500 && n('sculk_sensor') > 5 && n('sculk_shrieker') > 2 && n('sculk_catalyst') > 2,
    ['sculk', 'sculk_vein', 'sculk_sensor', 'sculk_shrieker', 'sculk_catalyst'].map((k) => `${k} ${n(k)}`).join(', '));
  let summon = 0, shriekers = 0;
  const shrieker = m.BLOCK_BY_NAME.get('sculk_shrieker');
  for (const o of chunks.values()) for (const st of o.blocks) if (m.STATE_BLOCK[st] === shrieker.id) { shriekers++; if (shrieker.get(st, 'can_summon')) summon++; }
  check('built: the shriekers grown in world generation can summon', shriekers > 0 && summon === shriekers, `${summon} of ${shriekers}`);
  // block entities: one for every chest, sensor, shrieker, catalyst and campfire, none left over
  let missing = 0, stale = 0, chests = 0, withLoot = 0, ice = 0;
  const NEED = /^(chest|barrel|sculk_sensor|calibrated_sculk_sensor|sculk_shrieker|sculk_catalyst|soul_campfire|skeleton_skull)$/;
  for (const o of chunks.values()) {
    const listed = new Map(o.blockEntities.map((e) => [`${e.x},${e.y},${e.z}`, e]));
    for (const e of o.blockEntities) {
      const st = o.blocks[m.colIndex(e.x & 15, e.y, e.z & 15)];
      if (name(st) !== e.id) stale++;
      if (e.id === 'chest') {
        chests++;
        if (e.data?.lootTable === 'chests/ancient_city') withLoot++;
        if (e.data?.lootTable === 'chests/ancient_city_ice_box') ice++;
      }
    }
    for (let i = 0; i < o.blocks.length; i++) {
      const nm = name(o.blocks[i]);
      if (!NEED.test(nm)) continue;
      const x = o.cx * 16 + (i & 15), z = o.cz * 16 + ((i >> 4) & 15), y = (i >> 8) + m.MIN_Y;
      if (!listed.has(`${x},${y},${z}`)) missing++;
    }
  }
  check('block entities: listed for every chest, sensor, shrieker, catalyst, campfire and skull, and only where they stand', missing === 0 && stale === 0, `${missing} missing, ${stale} stale`);
  check('chests: the city\'s have chests/ancient_city (and an ice box its own)', chests >= 5 && withLoot + ice === chests, `${withLoot} + ${ice} of ${chests}`);
  // the city's streets are open: the air of the pieces is placed (vanilla SinglePoolElement), and the terrain is hollowed round them
  const start = layout.pieces[0];
  let open = 0, total = 0;
  for (let x = start.box.minX + 2; x <= start.box.maxX - 2; x += 3)
    for (let z = start.box.minZ + 2; z <= start.box.maxZ - 2; z += 3) {
      total++;
      if (m.FLAGS[at(x, -44, z)] & m.F_AIR) open++;
    }
  check('built: the centre is hollowed out (air 8 blocks over its floor)', open / total > 0.8, `${open} of ${total}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Loot

{
  const r = new m.Rand(99, 3);
  const seen = new Map();
  let badRolls = 0, swift = 0, badSwift = 0, hoes = 0, badHoe = 0, trims = 0, potions = 0, badPotion = 0;
  for (let i = 0; i < 3000; i++) {
    const items = m.rollLoot('chests/ancient_city', r);
    const main = items.filter((s) => !/armor_trim/.test(s.item.id));
    if (main.length < 5) badRolls++;
    for (const s of items) {
      seen.set(s.item.id, (seen.get(s.item.id) ?? 0) + 1);
      if (s.item.id === 'enchanted_book' && s.tag?.stored?.swift_sneak) {
        swift++;
        if (s.tag.stored.swift_sneak < 1 || s.tag.stored.swift_sneak > 3) badSwift++;
      }
      if (s.item.id === 'diamond_hoe') {
        hoes++;
        if (s.damage > s.item.maxDamage * 0.2 + 1 || !Object.keys(s.tag?.enchantments ?? {}).length) badHoe++;
      }
      if (/armor_trim/.test(s.item.id)) trims++;
      if (s.item.id === 'potion') {
        potions++;
        if (s.tag?.potion?.potion !== 'strong_regeneration') badPotion++;
      }
    }
  }
  const ids = ['enchanted_golden_apple', 'music_disc_otherside', 'compass', 'sculk_catalyst', 'name_tag', 'diamond_hoe', 'lead', 'diamond_horse_armor', 'saddle', 'music_disc_13', 'music_disc_cat',
    'diamond_leggings', 'sculk', 'sculk_sensor', 'candle', 'amethyst_shard', 'experience_bottle', 'glow_berries', 'iron_leggings', 'echo_shard', 'disc_fragment_5', 'potion', 'enchanted_book', 'bone', 'soul_torch', 'coal'];
  const absent = ids.filter((k) => !m.ITEMS.get(k));
  check('loot: every item of chests/ancient_city exists', absent.length === 0, absent.join(', '));
  const never = ids.filter((k) => !seen.get(k));
  check('loot: all of them turn up', never.length === 0, never.join(', '));
  check('loot: 5 to 10 rolls', badRolls === 0);
  check('loot: Swift Sneak books, I to III', swift > 50 && badSwift === 0, `${swift}, ${badSwift} bad`);
  check('loot: the diamond hoe enchanted at 30 to 50 levels, 80 to 100% of its durability left', hoes > 50 && badHoe === 0, `${hoes}, ${badHoe} bad`);
  check('loot: potions of Regeneration II', potions > 50 && badPotion === 0);
  // (the armor trim smithing templates aren't in the game yet, so like the other tables' they roll nothing for now)
  const trimPool = m.LOOT_TABLES['chests/ancient_city'][1].entries.map((e) => `${e.item || 'empty'}:${e.weight}${e.count ? 'x' + e.count.join('-') : ''}`).join(' ');
  check('loot: a pair of ward (4) or silence (1) trims against 75 empty', trimPool === 'empty:75 ward_armor_trim_smithing_template:4x2-2 silence_armor_trim_smithing_template:1x2-2', trimPool);
  void trims;
  const iceIds = ['suspicious_stew', 'golden_carrot', 'baked_potato', 'packed_ice', 'snowball'];
  const iceSeen = new Set();
  let stews = 0, badStew = 0;
  for (let i = 0; i < 500; i++)
    for (const s of m.rollLoot('chests/ancient_city_ice_box', r)) {
      iceSeen.add(s.item.id);
      if (s.item.id === 'suspicious_stew') {
        stews++;
        const e = s.tag?.stewEffects?.[0];
        if (!e || !((e.id === 'night_vision' && e.duration >= 140 && e.duration <= 200) || (e.id === 'blindness' && e.duration >= 100 && e.duration <= 140))) badStew++;
      }
    }
  check('loot: the ice box\'s food, ice and snowballs', iceIds.every((k) => iceSeen.has(k)));
  check('loot: its suspicious stew gives night vision (7-10 s) or blindness (5-7 s)', stews > 20 && badStew === 0, `${stews}, ${badStew} bad`);
}

// ---------------------------------------------------------------------------------------------------------------
// The deep dark's own sculk away from a city

{
  // a chunk with caves in the deep dark (the patches begin in the air beside the rock)
  let deep = null;
  for (let cz = -40; cz < 40 && !deep; cz += 2)
    for (let cx = -40; cx < 40 && !deep; cx += 2) {
      if (Math.abs(cx - (lx >> 4)) < 20 && Math.abs(cz - (lz >> 4)) < 20) continue;
      if (gen.biome3(cx * 16 + 8, -40, cz * 16 + 8) !== m.B.deep_dark) continue;
      const o = gen.generate(cx, cz);
      let air = 0;
      for (let i = 0; i < o.blocks.length; i++)
        if (m.FLAGS[o.blocks[i]] & m.F_AIR && o.caveBiomes?.[m.caveBiomeIndex(i & 15, (i >> 8) + m.MIN_Y, (i >> 4) & 15)] === m.B.deep_dark) air++;
      if (air > 2000) deep = o;
    }
  check('deep dark: a chunk of it with caves found', !!deep);
  if (deep) {
    const n = new Map();
    for (let i = 0; i < deep.blocks.length; i++) {
      const k = name(deep.blocks[i]);
      if (/sculk/.test(k)) n.set(k, (n.get(k) ?? 0) + 1);
    }
    check('deep dark: sculk and veins grow there', (n.get('sculk') ?? 0) > 30 && (n.get('sculk_vein') ?? 0) > 30, JSON.stringify([...n]));
    let outside = 0;
    for (let i = 0; i < deep.blocks.length; i++) {
      if (!/^sculk/.test(name(deep.blocks[i]))) continue;
      const x = deep.cx * 16 + (i & 15), z = deep.cz * 16 + ((i >> 4) & 15), y = (i >> 8) + m.MIN_Y;
      const q = m.caveBiomeIndex(x & 15, y, z & 15);
      // (a patch starts in the deep dark but can creep a little way past its edge)
      if (!deep.caveBiomes || (deep.caveBiomes[q] !== m.B.deep_dark && ![-4, 4].some((d) => deep.caveBiomes[m.caveBiomeIndex(x & 15, Math.min(m.MAX_Y - 1, Math.max(m.MIN_Y, y + d)), z & 15)] === m.B.deep_dark))) outside++;
    }
    check('deep dark: nowhere else', outside < 40, `${outside} outside`);
  }
  // no deep dark, no sculk: a chunk with none
  let plain = null;
  for (let cx = 0; cx < 40 && !plain; cx++) {
    const o = gen.generate(cx, 40);
    if (!o.caveBiomes || !o.caveBiomes.includes(m.B.deep_dark)) plain = o;
  }
  check('deep dark: a chunk without any has no sculk', plain && ![...plain.blocks].some((st) => /^sculk/.test(name(st))));
}

// ---------------------------------------------------------------------------------------------------------------
// What a city costs chunk generation: the same chunks made again without it

{
  const without = new m.ChunkGenerator(SEED);
  without.decorator.ancientCities = null;
  without.ancientCities.beardFor = () => null;
  const keys = [...chunks.keys()].map((k) => k.split(',').map(Number));
  for (let i = 0; i < 3; i++) without.generate(300 + i, 300);
  const t = performance.now();
  for (const [cx, cz] of keys) without.generate(cx, cz);
  const base = (performance.now() - t) / keys.length;
  // (and with it again, as warmed up, from a new generator: the layout and the sculk worked out afresh)
  const again = new m.ChunkGenerator(SEED);
  const t2 = performance.now();
  for (const [cx, cz] of keys) again.generate(cx, cz);
  const city = (performance.now() - t2) / keys.length;
  const region = ((city - base) * keys.length) / (24 * 24);
  console.log(`     (the city's ${keys.length} chunks: ${base.toFixed(1)} ms each without it, ${city.toFixed(1)} ms with it, its layout and sculk worked out once included; over its whole region ${region.toFixed(1)} ms a chunk)`);
  check('time: the city\'s chunks take at most half as long again as without it', city < base * 1.5, `${city.toFixed(1)} vs ${base.toFixed(1)} ms`);
  check('time: spread over its region, a city adds under 10% to a chunk', region < base * 0.1, `${region.toFixed(1)} ms`);
}

await exitWithStatus(close);

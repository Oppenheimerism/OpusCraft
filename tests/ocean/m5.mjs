// Headless checks for Stage 5 M5 (node tests/ocean/m5.mjs): shipwrecks, ocean ruins and buried treasure (their
// templates, what the real chunk generator makes of them, their loot), /locate, treasure maps and their red cross, the
// cartographer's ocean explorer map (one map to a monument, the record kept over a save), a fed dolphin leading to a
// real ruin or wreck, the new sherds and the heart of the sea, and the conduit (its frame, its power's reach, its
// hunting, sounds, particles, save, recipe), with its textures and renderer (through stand-ins).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();
const P = [
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/player.ts',
  '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/game/conduit.ts', '/src/game/treasureMaps.ts', '/src/game/loot.ts',
  '/src/core/rng.ts', '/src/game/mapData.ts', '/src/game/maps.ts', '/src/entity/trading.ts', '/src/entity/dolphin.ts', '/src/world/gen/oceanStructures.ts',
  '/src/world/gen/shipwreck.ts', '/src/world/gen/oceanRuins.ts', '/src/world/gen/templates.ts', '/src/world/gen/generator.ts', '/src/world/constants.ts',
  '/src/inventory/recipes.ts', '/src/inventory/customRecipes.ts', '/src/game/decoratedPot.ts', '/src/textures/decoratedPot.ts', '/src/textures/items.ts',
  '/src/textures/mobs.ts', '/src/textures/blocks.ts', '/src/textures/conduit.ts', '/src/render/oceanRenderers.ts', '/src/render/entityRenderer.ts',
  '/src/render/particles.ts', '/src/audio/gen/ocean.ts', '/src/render/effectVisuals.ts', '/src/world/blockEntity.ts', '/src/game/blockBehavior.ts',
  '/src/storage/worldStore.ts', '/src/textures/mapTextures.ts', '/src/entity/effects.ts', '/src/world/mapColors.ts', '/src/game/monuments.ts',
  '/src/game/commands.ts', '/src/world/fluids.ts',
];
const { mods, close } = await loadModules(P);
const M = Object.fromEntries(P.map((p, i) => [p.replace(/^\/src\//, '').replace(/\.ts$/, ''), mods[i]]));
const { S, BLOCKS, STATE_BLOCK, getBlock } = M['world/block'];
const { ITEMS, ITEM_LIST, ItemStack } = M['item/item'];
const { B } = M['world/gen/biomes'];
const C = M['game/conduit'], TM = M['game/treasureMaps'], L = M['game/loot'], R = M['core/rng'], MD = M['game/mapData'], MAPS = M['game/maps'];
const OS = M['world/gen/oceanStructures'], SW = M['world/gen/shipwreck'], OR = M['world/gen/oceanRuins'], T = M['world/gen/templates'], G = M['world/gen/generator'], K = M['world/constants'];
const EF = M['entity/effects'], spawner = M['game/spawner'];
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const name = (st) => BLOCKS[STATE_BLOCK[st]].name;
const SEED = 'ocean5';

/** stone from y 40 to 49; water from 50 to 62 over x, z in [-24, 24) (everywhere if `sea`); dry floor round it */
function setup({ sea = false, seed = SEED } = {}) {
  const world = new M['world/world'].World();
  for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) { const c = new M['world/chunk'].Chunk(cx, cz); c.biomes.fill(B.ocean); world.chunks.set(c.key, c); }
  for (let x = -64; x < 64; x++) for (let z = -64; z < 64; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 40; y <= 49; y++) c.setState(x & 15, y, z & 15, S('stone'));
    if (sea || (x >= -24 && x < 24 && z >= -24 && z < 24)) for (let y = 50; y <= 62; y++) c.setState(x & 15, y, z & 15, S('water'));
  }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new M['game/level'].Level(world, seed);
  const sounds = [], parts = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p, t: level.gameTime }); }, playUI() {} };
  level.particles = { blockBreak() {}, blockHit() {}, spawn(k, x, y, z) { parts.push({ k, x, y, z, t: level.gameTime }); }, entityEffect() {} };
  level.difficulty = 'normal';
  level.doDaylightCycle = false;
  level.dayTime = 6000;
  level.simulationDistance = 10;
  const player = new M['entity/player'].Player(level);
  player.moveTo(0.5, 55, 8.5, 0, 0);
  player.gameMode = 'survival';
  level.player = player;
  level.addEntity(player);
  return { level, world, player, sounds, parts };
}
const spawn = (level, type, x, y, z) => {
  const m = spawner.createMob(type, level);
  m.moveTo(x, y, z, 0, 0);
  m.finalizeSpawn('command');
  level.addEntity(m);
  return m;
};
/** ticks the level, the player held where it is */
const tickPinned = (level, player, n, each) => {
  const [px, py, pz] = [player.x, player.y, player.z];
  for (let i = 0; i < n; i++) {
    each?.(i);
    level.tick();
    player.moveTo(px, py, pz, player.yaw, player.pitch);
    player.dx = player.dy = player.dz = 0;
    player.fallDistance = 0;
    player.air = 300;
  }
};
/** on to the end of the next tick the conduits look round in (game time a multiple of 40) */
const toCheck = (level, player) => {
  do tickPinned(level, player, 1);
  while (level.gameTime % 40 !== 0);
};

// --- the templates
{
  const bad = [];
  for (const n of [...SW.OCEAN_SHIPWRECKS, ...SW.BEACHED_SHIPWRECKS]) {
    const t = SW.shipwreckTemplate(n);
    const chests = [];
    for (let i = 0; i < t.blocks.length; i += 4) if (name(t.blocks[i + 3]) === 'chest') chests.push([t.blocks[i], t.blocks[i + 1], t.blocks[i + 2]]);
    const marks = t.markers.filter((m) => /^(map|treasure|supply)_chest$/.test(m.name));
    const paired = chests.every(([x, y, z]) => marks.some((m) => m.x === x && m.y === y + 1 && m.z === z));
    if (!chests.length || chests.length !== marks.length || !paired || t.sz > 28) bad.push(`${n} ${t.sx}x${t.sy}x${t.sz} ${chests.length}/${marks.length}`);
  }
  check(`the ${SW.OCEAN_SHIPWRECKS.length} + ${SW.BEACHED_SHIPWRECKS.length} wrecks: each chest with its marker over it`, SW.OCEAN_SHIPWRECKS.length === 20 && SW.BEACHED_SHIPWRECKS.length === 11 && bad.length === 0, bad.join(', '));
  const full = SW.shipwreckTemplate('with_mast');
  check('a whole ship with a mast: supply, treasure and map chests', ['supply_chest', 'treasure_chest', 'map_chest'].every((k) => full.markers.some((m) => m.name === k)) && full.sy >= 20);
  const names = [];
  for (let i = 1; i <= 8; i++) names.push(`warm_${i}`, `brick_${i}`, `cracked_${i}`, `mossy_${i}`);
  for (let i = 4; i <= 7; i++) names.push(`big_warm_${i}`);
  for (const i of [1, 2, 3, 8]) names.push(`big_brick_${i}`, `big_cracked_${i}`, `big_mossy_${i}`);
  const rbad = [];
  for (const n of names) {
    const t = OR.ruinTemplate(`underwater_ruin/${n}`);
    const big = n.startsWith('big_');
    const drowned = t.markers.filter((m) => m.name === 'drowned').length, chest = t.markers.filter((m) => m.name === 'chest').length;
    if (!t.blocks.length || (big && (t.sx !== 16 || t.sz !== 16)) || (!big && (t.sx > 8 || t.sz > 8))) rbad.push(`${n} ${t.sx}x${t.sz}`);
    if (big && /^big_(warm|brick)/.test(n) && (drowned !== 2 || chest !== 1)) rbad.push(`${n} markers ${drowned} drowned ${chest} chest`);
  }
  check(`the ${names.length} ruin templates (big ones with a chest and two drowned)`, rbad.length === 0, rbad.join(', '));
  check('turning about a pivot (vanilla StructureTemplate.transform)', JSON.stringify([0, 1, 2, 3].map((r) => T.turnAbout(1, 2, r, 4, 15))) === JSON.stringify([[1, 2], [17, 12], [7, 28], [-9, 18]]));
}

// --- where they are and what the generator makes of them
const gen = new G.ChunkGenerator(SEED);
const loc = OS.oceanStructureLocator(SEED);
const SP = { shipwrecks: 24, ocean_ruins: 20, buried_treasures: 1 };
const startAt = (kind, pos) => {
  const set = OS.SET_OF[kind];
  return gen.oceanStructures.start(set, Math.floor((pos[0] >> 4) / SP[set]), Math.floor((pos[1] >> 4) / SP[set]));
};
const outs = new Map();
const chunkOut = (cx, cz) => {
  const k = cx + ',' + cz;
  if (!outs.has(k)) outs.set(k, gen.generate(cx, cz));
  return outs.get(k);
};
const gather = (b) => {
  const bes = [], ents = [];
  for (let cx = b.minX >> 4; cx <= b.maxX >> 4; cx++) for (let cz = b.minZ >> 4; cz <= b.maxZ >> 4; cz++) {
    const o = chunkOut(cx, cz);
    bes.push(...o.blockEntities.filter((e) => b.minX <= e.x && e.x <= b.maxX && b.minZ <= e.z && e.z <= b.maxZ && b.minY <= e.y && e.y <= b.maxY));
    ents.push(...o.entities.filter((e) => b.minX <= e.x && e.x <= b.maxX + 1 && b.minZ <= e.z && e.z <= b.maxZ + 1));
  }
  return { bes, ents };
};
const blockAt = (x, y, z) => name(chunkOut(x >> 4, z >> 4).blocks[K.colIndex(x & 15, y, z & 15)]);
const STRUCTURAL = /planks|_log$|_wood$|stairs|slab|fence|trapdoor|chest|suspicious|stone_bricks|cut_sandstone|chiseled_sandstone|smooth_sandstone/;
const structural = (b) => {
  let n = 0;
  for (let x = b.minX; x <= b.maxX; x++) for (let z = b.minZ; z <= b.maxZ; z++) for (let y = b.minY; y <= b.maxY; y++) if (STRUCTURAL.test(blockAt(x, y, z))) n++;
  return n;
};
{
  const found = {};
  for (const k of ['shipwreck', 'shipwreck_beached', 'ocean_ruin_cold', 'ocean_ruin_warm', 'buried_treasure']) found[k] = loc.nearest(k, 0, 0);
  check('/locate finds each of the five (vanilla searches 100 rings out)', Object.values(found).every((p) => Array.isArray(p)), JSON.stringify(found));
  check('...the buried treasure at (9, 9) of its chunk, the others at their chunk\'s corner', ((found.buried_treasure[0] % 16) + 16) % 16 === 9 && ((found.buried_treasure[1] % 16) + 16) % 16 === 9 && ((found.shipwreck[0] % 16) + 16) % 16 === 0);
  check('...the same where the generator puts them', ['shipwreck', 'ocean_ruin_warm', 'buried_treasure'].every((k) => JSON.stringify(gen.oceanStructures.nearest(k, 0, 0)) === JSON.stringify(found[k])));

  // a wreck at sea
  const ship = startAt('shipwreck', found.shipwreck);
  const s1 = gather(ship.bounds);
  const chests = s1.bes.filter((e) => e.id === 'chest');
  check('a shipwreck: its chests with the wreck\'s loot', chests.length >= 1 && chests.every((e) => /^chests\/shipwreck_(supply|treasure|map)$/.test(e.data?.lootTable) && e.data.lootSeed !== undefined), chests.map((e) => e.data?.lootTable).join());
  check('...built of wood', structural(ship.bounds) > 40, `${structural(ship.bounds)}`);
  const beached = startAt('shipwreck_beached', found.shipwreck_beached);
  gather(beached.bounds);
  check('a beached wreck', beached.kind === 'shipwreck_beached' && structural(beached.bounds) > 20);

  // warm ruins: sandstone, suspicious sand
  const warm = startAt('ocean_ruin_warm', found.ocean_ruin_warm);
  const w1 = gather(warm.bounds);
  const sus = w1.bes.filter((e) => e.id === 'brushable_block');
  check('a warm ruin: suspicious sand with the warm ruins\' finds (five at most a piece)', sus.length > 0 && sus.length <= 5 * warm.pieces.length && sus.every((e) => e.data.lootTable === 'archaeology/ocean_ruin_warm' && blockAt(e.x, e.y, e.z) === 'suspicious_sand'), `${sus.length} in ${warm.pieces.length}`);
  check('...waterlogged where it stands in the water', warm.pieces.every((p) => p.settings.waterlog));

  // a cold ruin cluster, a big one: stone brick, suspicious gravel, a chest and drowned
  let cold = null;
  outer: for (let ring = 0; ring < 16; ring++) for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) {
    if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
    const s = gen.oceanStructures.start('ocean_ruins', i, j);
    if (s && s.kind === 'ocean_ruin_cold' && s.pieces.some((p) => p.isLarge) && s.pieces.length > 3) { cold = s; break outer; }
  }
  check('a big cold ruin with its cluster (three overlays a piece)', cold !== null && cold.pieces.length % 3 === 0, cold ? `${cold.pieces.length} pieces at ${cold.cx},${cold.cz}` : '');
  if (cold) {
    const c1 = gather(cold.bounds);
    const gravel = c1.bes.filter((e) => e.id === 'brushable_block');
    check('...suspicious gravel with the cold ruins\' finds', gravel.length > 0 && gravel.every((e) => e.data.lootTable === 'archaeology/ocean_ruin_cold' && blockAt(e.x, e.y, e.z) === 'suspicious_gravel'), `${gravel.length}`);
    const chest = c1.bes.find((e) => e.data?.lootTable === 'chests/underwater_ruin_big');
    check('...the big ruin\'s chest (underwater_ruin_big, facing north, waterlogged)', chest && blockAt(chest.x, chest.y, chest.z) === 'chest' && BLOCKS[STATE_BLOCK[chunkOut(chest.x >> 4, chest.z >> 4).blocks[K.colIndex(chest.x & 15, chest.y, chest.z & 15)]]].get(chunkOut(chest.x >> 4, chest.z >> 4).blocks[K.colIndex(chest.x & 15, chest.y, chest.z & 15)], 'facing') === 'north');
    const drowned = c1.ents.filter((e) => e.id === 'drowned');
    check('...two drowned standing guard, never despawning, in water', drowned.length >= 2 && drowned.every((e) => e.persistent && blockAt(Math.floor(e.x), e.y, Math.floor(e.z)) === 'water'), drowned.map((e) => `${e.x},${e.y},${e.z}`).join(' '));
  }

  // buried treasure: a chest in the sand
  const bt = startAt('buried_treasure', found.buried_treasure);
  const tchunk = chunkOut(found.buried_treasure[0] >> 4, found.buried_treasure[1] >> 4);
  const tchest = tchunk.blockEntities.find((e) => e.data?.lootTable === 'chests/buried_treasure');
  check('buried treasure: a chest at (9, 9) of its chunk', bt && tchest && tchest.x === found.buried_treasure[0] && tchest.z === found.buried_treasure[1]);
  if (tchest) {
    const round = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map(([dx, dy, dz]) => blockAt(tchest.x + dx, tchest.y + dy, tchest.z + dz));
    check('...buried: solid all round it', round.every((n) => !['air', 'water', 'cave_air', 'lava'].includes(n)), round.join());
  }
}

// --- loot
{
  const tables = ['chests/shipwreck_map', 'chests/shipwreck_supply', 'chests/shipwreck_treasure', 'chests/underwater_ruin_small', 'chests/underwater_ruin_big', 'chests/buried_treasure', 'archaeology/ocean_ruin_warm', 'archaeology/ocean_ruin_cold'];
  const missing = new Set();
  for (const t of tables) for (const pool of L.LOOT_TABLES[t] ?? []) for (const e of pool.entries) if (e.item && !ITEMS.has(e.item)) missing.add(e.item);
  const known = new Set(['suspicious_stew', 'bamboo', 'sniffer_egg', 'coast_armor_trim_smithing_template', 'moss_block']);
  check('the eight tables (what the game lacks rolls nothing)', tables.every((t) => L.LOOT_TABLES[t]) && [...missing].every((m) => known.has(m)), [...missing].join());
  let hearts = 0, potions = [], rolls = 40;
  for (let i = 0; i < rolls; i++) {
    const items = L.rollLoot('chests/buried_treasure', new R.Rand(i, 7));
    if (items.some((s) => s.item.id === 'heart_of_the_sea')) hearts++;
    potions.push(...items.filter((s) => s.item.id === 'potion').map((s) => s.tag?.potion?.potion));
  }
  check('buried treasure always holds a heart of the sea', hearts === rolls);
  check('...and its potions are of water breathing', potions.length > 0 && potions.every((p) => p === 'water_breathing'), potions.slice(0, 3).join());
  const stews = [];
  for (let i = 0; i < 60; i++) stews.push(...L.rollLoot('chests/shipwreck_supply', new R.Rand(i, 11)).filter((s) => s.item.id === 'suspicious_stew'));
  const EFF = { night_vision: [60, 140], jump_boost: [60, 140], weakness: [120, 200], blindness: [100, 160], poison: [200, 400], saturation: [7, 7] };
  check('a wreck\'s supply stews are suspicious (one effect each, vanilla\'s lengths)', stews.length > 0 && stews.every((s) => s.tag?.stewEffects?.length === 1 && EFF[s.tag.stewEffects[0].id] && s.tag.stewEffects[0].duration >= EFF[s.tag.stewEffects[0].id][0] && s.tag.stewEffects[0].duration <= EFF[s.tag.stewEffects[0].id][1]), stews.slice(0, 4).map((s) => JSON.stringify(s.tag?.stewEffects)).join(' '));
  const sherds = new Set();
  for (let i = 0; i < 200; i++) for (const s of L.rollLoot('archaeology/ocean_ruin_warm', new R.Rand(i, 3))) sherds.add(s.item.id);
  check('warm ruins\' sand gives angler, shelter and snort sherds', ['angler', 'shelter', 'snort'].every((k) => sherds.has(`${k}_pottery_sherd`)));
  const cs = new Set();
  for (let i = 0; i < 200; i++) for (const s of L.rollLoot('archaeology/ocean_ruin_cold', new R.Rand(i, 3))) cs.add(s.item.id);
  check('cold ruins\' gravel: blade, explorer, mourner and plenty', ['blade', 'explorer', 'mourner', 'plenty'].every((k) => cs.has(`${k}_pottery_sherd`)));
}

// --- treasure maps and their red cross
{
  const { level, player } = setup({ sea: true });
  MD.setMapWorldSource(() => ({ level, meta: { id: 'm5world', transient: true } }));
  const bt = loc.nearest('buried_treasure', 0, 0);
  const origin = { x: bt[0] + 30, y: 60, z: bt[1] - 20 };
  const expect = TM.findNearestMapStructure(level, 'on_treasure_maps', origin.x, origin.y, origin.z, 50, false);
  check('the nearest buried treasure to a chest (50 rings out)', expect && expect[0] === bt[0] && expect[2] === bt[1], JSON.stringify(expect));
  const items = L.rollLoot('chests/shipwreck_map', new R.Rand(5, 1), origin);
  const map = items.find((s) => s.item.id === 'filled_map');
  const deco = map?.tag?.mapDecorations?.['+'];
  check('a wreck\'s map chest: a Buried Treasure Map to it', map && map.tag.itemName === 'Buried Treasure Map' && deco?.type === 'red_x' && deco.x === bt[0] && deco.z === bt[1] && deco.rotation === 180);
  const d = MAPS.getSavedData(map, level);
  check('...zoomed in once, tracking without limit', d && d.scale === 1 && d.trackingPosition && d.unlimitedTracking);
  let orange = 0, brown = 0;
  const { MapColor } = M['world/mapColors'];
  for (const c of d.colors) if (c >> 2 === MapColor.COLOR_ORANGE) orange++; else if (c >> 2 === MapColor.COLOR_BROWN) brown++;
  check('...drawn with where the water is (orange stripes, a brown shore)', orange > 200 && brown > 0, `${orange} orange, ${brown} brown`);
  player.inventory.setSelectedItem(map);
  d.tickCarriedBy(player, map);
  const x = d.decorations.get('+');
  const half = (v, c) => Math.trunc(Math.fround(Math.fround(v - c) / 2) * 2 + 0.5);
  check('...carried, the red cross goes on it where the treasure is, turned (8 sixteenths)', x && x.type === 'red_x' && x.rot === 8 && x.x === half(bt[0], d.centerX) && x.y === half(bt[1], d.centerZ), JSON.stringify(x));
  check('...it isn\'t an explorer map', !d.isExplorationMap());
  check('the red cross and the monument have icons', MD.DECORATION_TYPES.red_x?.showOnItemFrame && !MD.DECORATION_TYPES.red_x.trackCount && M['textures/mapTextures'].DECORATION_LIST.includes('red_x') && M['textures/mapTextures'].decorationIcon('monument').w > 0);
  const chest = new M['world/blockEntity'].ChestBlockEntity(origin.x, origin.y, origin.z);
  chest.lootTable = 'chests/shipwreck_map';
  chest.lootSeed = 12345;
  chest.unpackLoot();
  const cm = chest.container.items.find((s) => s?.item.id === 'filled_map');
  check('opening such a chest: the map leads from where the chest is', cm?.tag?.mapDecorations?.['+']?.x === bt[0]);
  MD.setMapWorldSource(null);
  const blank = L.rollLoot('chests/shipwreck_map', new R.Rand(5, 1), origin)[0];
  check('...with no world about, a blank map, still named', blank.item.id === 'map' && blank.tag?.itemName === 'Buried Treasure Map');
  const small = new Set();
  MD.setMapWorldSource(() => ({ level, meta: { id: 'm5world', transient: true } }));
  for (let i = 0; i < 60; i++) for (const s of L.rollLoot('chests/underwater_ruin_small', new R.Rand(i, 9), origin)) small.add(s.item.id + (s.tag?.itemName ? ':' + s.tag.itemName : ''));
  check('ruins\' chests sometimes hold one too', small.has('filled_map:Buried Treasure Map'), [...small].join());
  MD.setMapWorldSource(null);
}

// --- the cartographer's ocean explorer map
{
  const { level, player } = setup({ sea: true });
  const meta1 = { id: 'm5world', transient: true };
  MD.setMapWorldSource(() => ({ level, meta: meta1 }));
  TM.resetStructureReferences();
  const TR = M['entity/trading'];
  check('an apprentice cartographer offers it (the second level, after the glass panes)', TR.VILLAGER_TRADES.cartographer[1].includes(TM.oceanExplorerMapForEmeralds));
  const trader = { random: new R.Rand(1, 2), villagerType: 'plains', level, x: 0.5, y: 60, z: 0.5 };
  const nearest = M['game/monuments'].monuments(level).nearest(0, 0, 100);
  const o1 = TM.oceanExplorerMapForEmeralds(trader);
  const t1 = o1?.result.tag?.mapDecorations?.['+'];
  check('the Ocean Explorer Map: 13 emeralds and a compass, 12 uses, 5 xp, x0.2', o1 && o1.baseCostA.id === 'emerald' && o1.baseCostA.count === 13 && o1.costB?.id === 'compass' && o1.costB.count === 1 && o1.maxUses === 12 && o1.xp === 5 && o1.priceMultiplier === 0.2);
  check('...to the nearest monument, zoomed out twice, tinted', o1.result.item.id === 'filled_map' && o1.result.tag.itemName === 'Ocean Explorer Map' && o1.result.tag.mapColor === 3830373 && t1?.type === 'monument' && t1.x === nearest[0] && t1.z === nearest[1] && MAPS.getSavedData(o1.result, level)?.scale === 2, `${JSON.stringify(t1)} vs ${JSON.stringify(nearest)}`);
  const o2 = TM.oceanExplorerMapForEmeralds(trader);
  const t2 = o2?.result.tag?.mapDecorations?.['+'];
  check('...the next one to another monument (one map to each)', t2 && (t2.x !== t1.x || t2.z !== t1.z));
  const d1 = MAPS.getSavedData(o1.result, level);
  player.inventory.setSelectedItem(o1.result);
  d1.tickCarriedBy(player, o1.result);
  check('...carried, it shows the monument and is an explorer map', d1.decorations.get('+')?.type === 'monument' && d1.isExplorationMap());
  const CR = M['inventory/customRecipes'];
  const ring = (m) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (i === 4 ? m : ItemStack.of('paper')));
  const plain = MAPS.createMap(level, 0, 0, 0, true, false);
  check('...which paper won\'t zoom out, though it will a plain one', CR.customRecipeFor(ring(o1.result), 3) === null && CR.customRecipeFor(ring(plain), 3)?.result.tag?.mapPostProcessing === 'scale');
  await M['storage/worldStore'].saveWorldMeta(meta1).catch(() => {});
  check('the monuments the maps lead to are saved with the world', Array.isArray(meta1.structureReferences) && meta1.structureReferences.length === 2, JSON.stringify(meta1.structureReferences));
  const meta2 = { id: 'm5world', transient: true, structureReferences: [...(meta1.structureReferences ?? [])] };
  TM.resetStructureReferences();
  MD.setMapWorldSource(() => ({ level, meta: meta2 }));
  const t3 = TM.oceanExplorerMapForEmeralds(trader)?.result.tag?.mapDecorations?.['+'];
  check('...and loaded again, a third map leads to neither of those', t3 && ![t1, t2].some((t) => t.x === t3.x && t.z === t3.z));
  TM.resetStructureReferences();
  MD.setMapWorldSource(() => ({ level, meta: { id: 'another', transient: true } }));
  const t4 = TM.oceanExplorerMapForEmeralds(trader)?.result.tag?.mapDecorations?.['+'];
  check('...another world keeps its own', t4 && t4.x === t1.x && t4.z === t1.z);
  MD.setMapWorldSource(null);
  TM.resetStructureReferences();
}

// --- a fed dolphin leads to a real ruin or wreck
{
  const { level, player, parts } = setup({ sea: true });
  const D = M['entity/dolphin'];
  const d = spawn(level, 'dolphin', 40.5, 55, 40.5);
  const expect = TM.findNearestMapStructure(level, 'dolphin_located', 40, 55, 40, 50, false);
  check('the hook is the real search now', typeof D.dolphinHooks.findTreasure === 'function' && JSON.stringify(D.dolphinHooks.findTreasure(level, 40, 55, 40)) === JSON.stringify(expect));
  player.inventory.setSelectedItem(ItemStack.of('cod', 3));
  const fed = d.interact(player, player.inventory.selectedItem);
  tickPinned(level, player, 5);
  check('fed a fish, it takes the nearest ruin or wreck (vanilla: ring by ring, 50 out)', fed && d.treasurePos && d.treasurePos[0] === expect[0] && d.treasurePos[2] === expect[2], `${d.treasurePos} vs ${expect}`);
  const dist = () => Math.hypot(d.x - expect[0], d.z - expect[2]);
  const d0 = dist();
  tickPinned(level, player, 200);
  check('...and heads that way, happy', dist() < d0 - 5 && parts.some((p) => p.k === 'happy_villager'), `${d0.toFixed(1)} -> ${dist().toFixed(1)}`);
  let real = null;
  for (const set of ['ocean_ruins', 'shipwrecks']) {
    const sp = SP[set];
    const s = gen.oceanStructures.start(set, Math.floor((expect[0] >> 4) / sp), Math.floor((expect[2] >> 4) / sp));
    if (s && JSON.stringify(gen.oceanStructures.locatePos(s)) === JSON.stringify([expect[0], expect[2]])) real = s;
  }
  if (real) gather(real.bounds);
  check('...where the generator builds one', real && structural(real.bounds) > 5, real ? `${real.kind} ${structural(real.bounds)} blocks` : 'none');
}

// --- /locate
{
  const { level, player } = setup({ sea: true });
  const chats = [];
  const game = { meta: { allowCommands: true }, chat: (m) => chats.push(m), level, player, world: level.world };
  M['game/commands'].executeCommand(game, 'locate structure minecraft:shipwreck');
  M['game/commands'].executeCommand(game, 'locate structure buried_treasure');
  const w = loc.nearest('shipwreck', 0, 8), t = loc.nearest('buried_treasure', 0, 8);
  check('/locate structure shipwreck and buried_treasure', chats[0]?.includes(`[${w[0]}, ~, ${w[1]}]`) && chats[1]?.includes(`[${t[0]}, ~, ${t[1]}]`), chats.join(' | '));
  check('...not the villages\' business, nor the Nether\'s', TM.locateOceanStructure(level, 'minecraft:village_plains', 0, 0) === null);
}

// --- the items
{
  const SH = ['angler', 'blade', 'explorer', 'mourner', 'plenty', 'shelter', 'snort'].map((s) => `${s}_pottery_sherd`);
  check('the seven sea sherds', SH.every((s) => ITEMS.has(s)));
  const at = (id) => ITEM_LIST.findIndex((x) => x.id === id);
  const order = ['angler', 'archer', 'arms_up', 'blade', 'brewer', 'explorer', 'flow', 'guster', 'miner', 'mourner', 'plenty', 'prize', 'scrape', 'shelter', 'skull', 'snort'].map((s) => at(`${s}_pottery_sherd`));
  check('...in their places among the others (all sixteen, the trial chambers three too, in name order, together, as vanilla lists them)', order.every((v, i) => v >= 0 && (i === 0 || v === order[i - 1] + 1)), order.join());
  const pot = M['game/decoratedPot'];
  check('...pot ingredients, each with its pattern', SH.every((s) => pot.SHERDS.includes(s) && M['textures/decoratedPot'].patternOf(s)) && pot.SHERDS.length === 16);
  const grid = [null, ItemStack.of('angler_pottery_sherd'), null, ItemStack.of('brick'), null, ItemStack.of('snort_pottery_sherd'), null, ItemStack.of('brick'), null];
  const made = M['inventory/customRecipes'].customRecipeFor(grid, 3)?.result;
  check('...and a pot made with them shows them', made?.item.id === 'decorated_pot' && made.tag?.potDecorations?.join() === 'angler_pottery_sherd,brick,snort_pottery_sherd,brick');
  const tex = M['textures/items'].ITEM_TEXTURES;
  const opaque = (im) => { let n = 0; for (let i = 3; i < im.data.length; i += 4) if (im.data[i]) n++; return n; };
  check('...drawn (items and pot sides)', SH.every((s) => tex[s] && opaque(tex[s]()) > 20 && opaque(M['textures/decoratedPot'].decoratedPotSideTexture(M['textures/decoratedPot'].patternOf(s))) > 100));
  const heart = ITEMS.get('heart_of_the_sea');
  check('the heart of the sea: uncommon, after the nautilus shell, drawn', heart && heart.rarity === 'uncommon' && at('heart_of_the_sea') === at('nautilus_shell') + 1 && opaque(tex.heart_of_the_sea()) > 20);
  check('the conduit: a rare item', ITEMS.get('conduit')?.rarity === 'rare');
  const rows = ['###', '#X#', '###'], key = { '#': 'nautilus_shell', X: 'heart_of_the_sea' };
  const g = [];
  for (const row of rows) for (const ch of row) g.push(ItemStack.of(key[ch]));
  const r = M['inventory/recipes'].findRecipe(g, 3, 3);
  check('...crafted from a heart of the sea in eight nautilus shells', r?.result === 'conduit' && r.count === 1);
}

// --- the conduit
{
  const { level, world, player, sounds, parts } = setup({ sea: true });
  player.gameMode = 'creative';
  const conduit = getBlock('conduit');
  const beh = M['game/blockBehavior'].behaviorOf(S('conduit'));
  const place = (x, y, z) => beh.placement({ world, x, y, z, face: 1, hitY: 0.5, yaw: 0, pitch: 0, sneaking: false, clickedState: world.getState(x, y - 1, z), replacing: false });
  check('placed in water it\'s waterlogged, in the air it isn\'t', conduit.get(place(0, 55, 0), 'waterlogged') === true && conduit.get(place(0, 70, 0), 'waterlogged') === false);
  const [cx, cy, cz] = [0, 56, 0];
  world.setState(cx, cy, cz, S('conduit', { waterlogged: true }));
  const be = world.getBlockEntity(cx, cy, cz);
  check('it has its block entity', be instanceof C.ConduitBlockEntity);
  check('its frame: 42 places', C.FRAME_OFFSETS.length === 42 && C.FRAME_OFFSETS.every(([i, j, k]) => Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) === 2 && [i, j, k].includes(0)));
  const frame = (n, block = 'prismarine') => C.FRAME_OFFSETS.forEach(([i, j, k], idx) => world.setState(cx + i, cy + j, cz + k, idx < n ? S(idx % 4 === 1 ? 'sea_lantern' : idx % 4 === 2 ? 'dark_prismarine' : idx % 4 === 3 ? 'prismarine_bricks' : block) : S('water')));
  frame(15);
  toCheck(level, player);
  check('15 frame blocks: asleep', !be.active && be.effectBlocks.length === 15);
  frame(16);
  sounds.length = 0;
  toCheck(level, player);
  check('16 (any of the four kinds): it wakes', be.active && !be.hunting && be.effectBlocks.length === 16 && sounds.some((s) => s.n === 'block.conduit.activate'));
  // its reach: 16 blocks for every 7 frame blocks (32 here), players in the water only
  player.removeEffect?.('conduit_power');
  player.moveTo(0.5, 56, 31.5, 0, 0);
  toCheck(level, player);
  const eff = player.getEffect('conduit_power');
  check('...Conduit Power to a player in the water 31 away (13 s, ambient, level I)', eff && eff.amplifier === 0 && eff.ambient && eff.visible && eff.duration > 250 && eff.duration <= 260, eff ? `${eff.duration}` : 'none');
  player.activeEffects.clear();
  player.moveTo(0.5, 56, 32.5, 0, 0);
  toCheck(level, player);
  check('...but not 32 away', !player.getEffect('conduit_power'));
  player.moveTo(0.5, 64, 10.5, 0, 0);
  toCheck(level, player);
  check('...nor out of the water', !player.getEffect('conduit_power'));
  frame(42);
  player.moveTo(0.5, 56, 60.5, 0, 0);
  toCheck(level, player);
  check('the whole frame: it hunts, and reaches 96 (60 away in the water: powered)', be.hunting && be.effectBlocks.length === 42 && player.getEffect('conduit_power'));
  // hunting: a monster in the water within 8
  const drowned = spawn(level, 'drowned', 3.5, 55, 0.5);
  const cod = spawn(level, 'cod', -3.5, 56, 0.5);
  const hp0 = drowned.health, cod0 = cod.health;
  sounds.length = 0;
  toCheck(level, player);
  check('...a drowned in the water nearby is hurt 4 by magic, with a zap', be.destroyTarget === drowned && hp0 - drowned.health === 4 && sounds.some((s) => s.n === 'block.conduit.attack.target'), `${hp0} -> ${drowned.health}`);
  check('...a cod isn\'t', cod.health === cod0);
  toCheck(level, player);
  check('...and again every two seconds', hp0 - drowned.health === 8);
  check('...sparks drawn in from its frame and round its prey', parts.filter((p) => p.k === 'nautilus').length > 10);
  // saved with its target, and it finds it again
  const saved = be.save();
  check('saved with its target\'s UUID', saved.data?.Target === drowned.uuid);
  const be2 = M['world/blockEntity'].loadBlockEntity(saved);
  be.removed = true;
  world.blockEntities.set(be2.key, be2);
  toCheck(level, player);
  check('...loaded, it goes after the same one', be2 instanceof C.ConduitBlockEntity && be2.destroyTarget === drowned && hp0 - drowned.health === 12);
  // a zombie out of the water (on a stone raft over it, at night) isn't reached
  level.dayTime = 18000;
  for (let x = -1; x <= 6; x++) for (let z = -1; z <= 6; z++) world.setState(x, 63, z, S('stone'));
  const zombie = spawn(level, 'zombie', 2.5, 64, 2.5);
  const hz = zombie.health;
  drowned.removed = true;
  toCheck(level, player);
  toCheck(level, player);
  check('...a monster out of the water is left alone', zombie.isAlive && zombie.health === hz && !be2.destroyTarget, `${hz} -> ${zombie.health}`);
  // sounds while awake
  sounds.length = 0;
  for (let i = 0; i < 200; i++) tickPinned(level, player, 1);
  check('awake it hums (every 4 s) and pulses (every 3 to 5 s)', sounds.filter((s) => s.n === 'block.conduit.ambient').length >= 2 && sounds.filter((s) => s.n === 'block.conduit.ambient.short').length >= 2);
  // the water gone from round it: it sleeps
  world.setState(cx + 1, cy, cz, S('stone'));
  sounds.length = 0;
  toCheck(level, player);
  check('stone in the water round it: it goes out', !be2.active && sounds.some((s) => s.n === 'block.conduit.deactivate'));
  // conduit power itself
  const p2 = setup({ sea: true }).player;
  p2.moveTo(0.5, 56, 0.5, 0, 0);
  const plain = { dig: p2.digSpeedEffectFactor(), swing: p2.swingDuration(), breath: p2.hasWaterBreathing() };
  p2.addEffect(new EF.MobEffectInstance(EF.MOB_EFFECTS.conduit_power, 200, 0, true, true));
  check('Conduit Power: breathing under water, mining and swinging as with Haste I', !plain.breath && p2.hasWaterBreathing() && Math.abs(p2.digSpeedEffectFactor() - 1.2) < 1e-9 && plain.dig === 1 && p2.swingDuration() === 5 && plain.swing === 6);
  const NV = M['render/effectVisuals'];
  p2.baseTick?.();
  const under = NV.nightVisionScale(p2, 0);
  p2.moveTo(0.5, 70, 0.5, 0, 0);
  p2.baseTick?.();
  check('...and clear sight with the eyes under water', under === 1 && NV.nightVisionScale(p2, 0) === 0, `${under}`);
}

// --- sounds
{
  const gens = M['audio/gen/ocean'].oceanSounds();
  const want = { 'block.conduit.activate': 1, 'block.conduit.deactivate': 1, 'block.conduit.ambient': 1, 'block.conduit.ambient.short': 9, 'block.conduit.attack.target': 3 };
  const bad = [];
  for (const [n, v] of Object.entries(want)) {
    const s = gens[n];
    if (!s || s.variants !== v) { bad.push(`${n} ${s?.variants}`); continue; }
    for (let i = 0; i < v; i++) {
      const buf = s.generate(i, 22050);
      let peak = 0, finite = true;
      for (const x of buf) { if (!Number.isFinite(x)) finite = false; peak = Math.max(peak, Math.abs(x)); }
      if (!finite || peak < 0.05 || buf.length < 4000) bad.push(`${n}#${i} peak ${peak.toFixed(3)} len ${buf.length}`);
    }
  }
  check('the conduit\'s five sounds (15 takes)', bad.length === 0, bad.join(', '));
}

// --- particles, textures and the renderer
{
  const { world, level } = setup({ sea: true });
  const pe = new M['render/particles'].ParticleEngine({ sprites: {} }, world, () => 0xffffff);
  pe.spawn('nautilus', 0.5, 57, 0.5, 2, -1, 1);
  const sp = pe.sprites[0];
  check('the nautilus spark: starts out at the offset, homes in like a rune', sp && sp.x === 2.5 && sp.enchant?.x === 0.5 && sp.frames?.[0] === 'nautilus' && sp.lightMode === 'enchant');
  const MT = M['textures/mobs'].MOB_TEXTURES;
  const px = (im, x, y) => im.data[(y * im.w + x) * 4 + 3];
  const faceClear = (im, u, v, s) => { let n = 0; for (let y = v; y < v + s; y++) for (let x = u; x < u + s; x++) if (!px(im, x, y)) n++; return n; };
  const base = MT.conduit_base(), cage = MT.conduit_cage();
  const cube = (u, v, s) => [[u + s, v], [u + 2 * s, v], [u, v + s], [u + s, v + s], [u + 2 * s, v + s], [u + 3 * s, v + s]];
  check('the shell (32x16): every face painted', base.w === 32 && base.h === 16 && cube(0, 0, 6).every(([u, v]) => faceClear(base, u, v, 6) === 0));
  check('the cage (32x16): open frames', cage.w === 32 && cage.h === 16 && cube(0, 0, 8).every(([u, v]) => { const c = faceClear(cage, u, v, 8); return c > 16 && c < 64 && px(cage, u, v); }));
  const winds = [];
  for (let i = 0; i < 22; i++) winds.push(MT[`conduit_wind_${i}`]?.(), MT[`conduit_wind_vertical_${i}`]?.());
  check('the current: 22 frames each way (64x32), moving', winds.every((w) => w && w.w === 64 && w.h === 32 && faceClear(w, 16, 16, 16) < 256) && winds[0].data.join() !== winds[2].data.join());
  const eyes = [MT.conduit_open_eye(), MT.conduit_closed_eye()];
  check('its eye, open and shut (16x16, front and back)', eyes.every((e) => e.w === 16 && faceClear(e, 0, 0, 8) < 64 && faceClear(e, 8, 0, 8) < 64) && eyes[0].data.join() !== eyes[1].data.join());
  const bt = M['textures/blocks'].BLOCK_TEXTURES.conduit?.();
  const img = bt?.frames ? { ...bt, data: bt.frames[0] } : bt;
  check('the block texture (its item\'s and its specks\')', img && img.w === 16 && faceClear(img, 3, 3, 10) === 0);
  check('the spark\'s sprite', typeof M['textures/mobs'].MOB_PARTICLE_TEXTURES.nautilus === 'function' && M['textures/mobs'].MOB_PARTICLE_TEXTURES.nautilus().w === 8);
  // the renderer, through stand-ins
  let quads = 0, texs = [], lights = [];
  const batch = { quad() { quads++; lights.push(this.lightB); }, begin(s) { texs.push(s.texture.n); }, flush() {}, setOverlay() {}, lightB: 96, lightS: 100, color: [1, 1, 1, 1] };
  const pose = new M['render/entityRenderer'].PoseStack();
  const kit = { pose, items: { render() {} }, tex: (n) => (MT[n] ? { n } : null), setupLiving: () => ({}), overlay() {}, drawBody() {}, state: (t, extra) => ({ texture: t, ...extra }), attackAnim: () => 0 };
  const gl = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k === k.toUpperCase() ? 0 : () => ({})) });
  const rr = new M['render/oceanRenderers'].OceanRenderers(gl, kit);
  world.setState(0, 56, 0, S('conduit', { waterlogged: true }));
  const be = world.getBlockEntity(0, 56, 0);
  const cam = { x: 3, y: 57, z: 3, yaw: 30, pitch: 10, fov: 70 };
  rr.renderAppearance(batch, level, cam, 0.5);
  check('asleep: the closed shell', quads === 6 && texs.join() === 'conduit_base' && batch.lightB === 96);
  be.active = true;
  be.tickCount = 70;
  quads = 0; texs = [];
  rr.renderAppearance(batch, level, cam, 0.5);
  check('awake: the cage, the current twice (its frame for the time), the shut eye', quads === 24 && texs.join() === 'conduit_cage,conduit_wind_vertical_1,conduit_closed_eye', texs.join());
  be.hunting = true;
  be.tickCount = 140;
  texs = [];
  rr.renderAppearance(batch, level, cam, 0.5);
  check('hunting: the eye open', texs.join() === 'conduit_cage,conduit_wind_2,conduit_open_eye', texs.join());
  check('lit by where it is', lights.every((l) => l === lights[0]) && batch.lightB === 96);
  cam.x = 200;
  quads = 0;
  rr.renderAppearance(batch, level, cam, 0.5);
  check('not drawn from 64 blocks off', quads === 0);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

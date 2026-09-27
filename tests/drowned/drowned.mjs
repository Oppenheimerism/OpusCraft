// Headless checks for the drowned (node tests/drowned/drowned.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/entity/drowned.ts', '/src/world/gen/biomes.ts',
  '/src/entity/ai/navigation.ts', '/src/entity/thrownTrident.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, D, biomes, nav, tri] = mods;
const { ItemStack } = itemMod;
const { S } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

/** a flat world of stone to y=39 with a sea of water to y=62 (sea level 63) over [x0,x1]x[z0,z1], grass land elsewhere at 63 */
function makeLevel({ difficulty = 'normal', dayTime = 18000, sea = [-12, 12, -12, 12], biome = 'plains' } = {}) {
  const world = new worldMod.World();
  for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) {
    const c = new chunkMod.Chunk(cx, cz);
    c.biomes.fill(biomes.BIOME_ID[biome]);
    world.chunks.set(c.key, c);
  }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  level.sound = { play: (n, x, y, z, v, p) => sounds.push(n), playUI() {} };
  level.particles = { spawn() {}, blockBreak() {}, spell() {}, poof() {}, entityEffect() {} };
  const st = S('stone'), gs = S('grass_block'), w = S('water');
  for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    const wet = x >= sea[0] && x <= sea[1] && z >= sea[2] && z <= sea[3];
    for (let y = 36; y <= 39; y++) c.setState(x & 15, y, z & 15, st);
    for (let y = 40; y <= 62; y++) c.setState(x & 15, y, z & 15, wet ? w : st);
    if (!wet) c.setState(x & 15, 63, z & 15, gs);
    c.heightmap[((z & 15) << 4) | (x & 15)] = wet ? 63 : 64;
  }
  level.dayTime = dayTime;
  level.difficulty = difficulty;
  return { world, level, sounds };
}
const mobAt = (level, type, x, y, z) => { const m = spawner.createMob(type, level); m.moveTo(x + 0.5, y, z + 0.5, 0, 0); m.finalizeSpawn('egg'); level.addEntity(m); return m; };
const strip = (m) => { for (const s of ['mainhand', 'offhand', 'feet', 'legs', 'chest', 'head']) m.setItemSlot(s, null); };
function playerAt(level, x, y, z, mode = 'survival') {
  const p = new playerMod.Player(level);
  p.gameMode = mode;
  p.moveTo(x, y, z, 0, 0);
  level.player = p;
  level.addEntity(p);
  return p;
}

// --- registered
{
  check('registered, with a spawn egg and a name', !!spawner.MOB_TYPES.drowned && !!itemMod.ITEMS.get('drowned_spawn_egg') && spawner.entityDisplayName('drowned') === 'Drowned');
  const { level } = makeLevel();
  const d = mobAt(level, 'drowned', 20, 64, 20);
  // (a spawn egg's drowned is a baby now and then, as a zombie's is: a grown one's size is what's checked)
  d.setBaby(false);
  check('a zombie\'s size and build', d instanceof D.Drowned && Math.abs(d.width - 0.6) < 1e-6 && Math.abs(d.height - 1.95) < 1e-6 && d.maxHealth === 20);
  const d2 = spawner.loadEntity(d.save(), level);
  check('saved and loaded', d2?.type === 'drowned' && d2 instanceof D.Drowned);
}

// --- a zombie held under water becomes a drowned
{
  const { level, sounds } = makeLevel();
  const z = mobAt(level, 'zombie', 0, 50, 0);
  strip(z);
  z.setItemSlot('head', ItemStack.of('iron_helmet'));
  z.setBaby(false);
  z.persistenceRequired = true;
  let started = -1, converted = -1, at = null;
  for (let t = 0; t < 1000 && converted < 0; t++) {
    level.tick();
    if (!z.removed) { z.moveTo(0.5, 50, 0.5, z.yaw, z.pitch); z.dx = z.dy = z.dz = 0; }
    if (started < 0 && z.underWaterConverting) started = t;
    if (z.removed) {
      converted = t;
      const d = level.entities.find((e) => e.type === 'drowned' && !e.removed);
      if (d) at = { dx: d.x - z.x, dy: d.y - z.y, dz: d.z - z.z, d };
    }
  }
  check('after 30 s under, a zombie starts to shake', started >= 590 && started <= 610, `at ${started}`);
  check('and 15 s later a drowned stands in its place', converted - started >= 295 && converted - started <= 305 && !!at && Math.abs(at.dx) + Math.abs(at.dz) < 1e-6 && Math.abs(at.dy) < 0.01, `${converted - started} ticks ${JSON.stringify(at && { dx: at.dx, dy: at.dy, dz: at.dz })}`);
  check('wearing its helmet, as persistent', at?.d.getItemBySlot('head')?.item.id === 'iron_helmet' && at.d.persistenceRequired === true);
  check('with the conversion sound', sounds.includes('entity.zombie.converted_to_drowned'));
  // (and a drowned under water stays one)
  const d = at?.d;
  if (d) {
    for (let t = 0; t < 1000; t++) { level.tick(); d.moveTo(0.5, 50, 0.5, d.yaw, d.pitch); d.dx = d.dy = d.dz = 0; }
    check('a drowned doesn\'t convert or drown', !d.removed && !d.underWaterConverting && d.health === d.maxHealth);
  }
}

// --- spawn rules (against how often it's dark enough there at all)
{
  const { level, world } = makeLevel();
  const ns = new spawner.NaturalSpawner(level, 1);
  level.tick();
  const N = 20000;
  const rate = (x, y, z, n = N) => { let k = 0; for (let i = 0; i < n; i++) if (ns.placementOk('drowned', x, y, z) && ns.checkSpawnRules('drowned', x, y, z)) k++; return k; };
  const darkRate = (x, y, z) => { let k = 0; for (let i = 0; i < N; i++) if (D.drownedSpawnConditions(level, x, y, z, () => Math.random())) k++; return k; };
  const dark = darkRate(0, 50, 0);
  const deep = rate(0, 50, 0), shallow = rate(0, 60, 0), land = rate(20, 64, 20);
  check('in the sea: one try in 40, and only five below sea level', Math.abs(deep / dark - 1 / 40) < 0.008 && shallow === 0, `deep ${deep}/${dark} dark, shallow ${shallow}`);
  check('never on land', land === 0);
  for (const c of world.chunks.values()) c.biomes.fill(biomes.BIOME_ID.river);
  const river = rate(0, 60, 0), riverDeep = rate(0, 50, 0), darkShallow = darkRate(0, 60, 0);
  check('in a river: one in 15, at any depth', Math.abs(river / darkShallow - 1 / 15) < 0.015 && Math.abs(riverDeep / dark - 1 / 15) < 0.015, `${river}/${darkShallow}, deep ${riverDeep}/${dark}`);
  // (just water with nothing under it: no)
  world.setState(0, 49, 0, S('stone'));
  check('only with water under it too', rate(0, 50, 0, 4000) === 0);
  level.difficulty = 'peaceful';
  check('never in peaceful', rate(0, 55, 0, 4000) === 0);
}

// --- the biomes' lists
{
  const { level, world } = makeLevel();
  const ns = new spawner.NaturalSpawner(level, 1);
  const weight = (b) => {
    for (const c of world.chunks.values()) c.biomes.fill(biomes.BIOME_ID[b]);
    return ns.mobsAt('monster', 0, 50, 0).filter((s) => s.type === 'drowned').map((s) => `${s.weight}:${s.min}-${s.max}`).join(',');
  };
  const got = Object.fromEntries(['river', 'frozen_river', 'ocean', 'deep_ocean', 'warm_ocean', 'lukewarm_ocean', 'cold_ocean', 'frozen_ocean', 'deep_frozen_ocean', 'dripstone_caves', 'plains', 'beach'].map((b) => [b, weight(b)]));
  check('rivers 100, frozen rivers 1, every ocean 5, dripstone caves 95 in fours, none on land', got.river === '100:1-1' && got.frozen_river === '1:1-1' && ['ocean', 'deep_ocean', 'warm_ocean', 'lukewarm_ocean', 'cold_ocean', 'frozen_ocean', 'deep_frozen_ocean'].every((b) => got[b] === '5:1-1') && got.dripstone_caves === '95:4-4' && got.plains === '' && got.beach === '', JSON.stringify(got));
}

// --- what they spawn holding
{
  const { level } = makeLevel();
  const n = 4000, c = { trident: 0, fishing_rod: 0, nautilus: 0, armour: 0, other: 0, shellDrop: 0 };
  for (let i = 0; i < n; i++) {
    const d = spawner.createMob('drowned', level);
    d.moveTo(0.5, 50, 0.5, 0, 0);
    d.finalizeSpawn('natural');
    const m = d.mainHand?.item.id;
    if (m === 'trident') c.trident++;
    else if (m === 'fishing_rod') c.fishing_rod++;
    else if (m) c.other++;
    if (d.offHand?.item.id === 'nautilus_shell') { c.nautilus++; if (d.equipmentDropChance('offhand') > 1) c.shellDrop++; }
    if (['head', 'chest', 'legs', 'feet'].some((s) => d.getItemBySlot(s))) c.armour++;
  }
  check('one in 16 holds a trident, one in 27 a fishing rod', c.trident > 180 && c.trident < 330 && c.fishing_rod > 90 && c.fishing_rod < 220 && c.other === 0, JSON.stringify(c));
  check('3% a nautilus shell in the other hand, a sure drop', c.nautilus > 70 && c.nautilus < 180 && c.shellDrop === c.nautilus);
  check('no armour of their own', c.armour === 0);
}

// --- by day it goes after only what's in the water; at night, anything
{
  const { level } = makeLevel({ dayTime: 6000 });
  const d = mobAt(level, 'drowned', 0, 50, 0);
  strip(d);
  const onLand = playerAt(level, 16.5, 64, 0.5);
  check('by day, a player on land is no target', !d.okTarget(onLand));
  onLand.moveTo(3.5, 55, 0.5, 0, 0);
  level.tick();
  check('a player in the water is', onLand.inWater && d.okTarget(onLand));
  level.dayTime = 18000;
  onLand.moveTo(16.5, 64, 0.5, 0, 0);
  level.tick();
  check('at night, anyone', d.okTarget(onLand));
}

// --- it swims after a player in the water, on its water navigation
{
  const { level } = makeLevel({ dayTime: 6000 });
  const d = mobAt(level, 'drowned', -8, 44, -8);
  strip(d);
  const p = playerAt(level, 8.5, 52, 8.5);
  let swam = false, water = false, pushed = true, minDist = 1e9, drown = false;
  for (let t = 0; t < 800; t++) {
    level.tick();
    p.moveTo(8.5, 52, 8.5, 0, 0);
    p.dx = p.dy = p.dz = 0;
    p.health = p.maxHealth;
    swam ||= d.swimming;
    water ||= d.navigation instanceof nav.WaterBoundPathNavigation;
    if (d.swimming) pushed &&= !d.isPushedByFluid();
    minDist = Math.min(minDist, Math.hypot(d.x - p.x, d.y - p.y, d.z - p.z));
    if (d.health < d.maxHealth) drown = true;
  }
  check('it targets the player in the water', d.target === p);
  check('and swims (water navigation, not pushed about by currents)', swam && water && pushed);
  check('reaching them across the sea', minDist < 2.5, `closest ${minDist.toFixed(2)}`);
  check('it doesn\'t drown', !drown);
}

// --- no target: out of the water it walks; at night, deep down, it swims up
{
  const { level } = makeLevel({ dayTime: 18000 });
  const d = mobAt(level, 'drowned', 0, 41, 0);
  strip(d);
  const y0 = d.y;
  let maxY = y0;
  for (let t = 0; t < 600; t++) { level.tick(); maxY = Math.max(maxY, d.y); }
  check('at night it rises from the sea bed', maxY > y0 + 8, `${y0.toFixed(1)} -> ${maxY.toFixed(1)}`);
}
{
  const { level } = makeLevel({ dayTime: 6000 });
  const d = mobAt(level, 'drowned', 16, 64, 0);
  strip(d);
  let inWater = -1;
  for (let t = 0; t < 1200 && inWater < 0; t++) { level.tick(); if (d.inWater) inWater = t; }
  check('by day, ashore, it heads back into the water', inWater >= 0, `after ${inWater} ticks`);
  check('ashore it doesn\'t swim', !d.swimming || d.inWater);
}

// --- a trident: it throws from up to ten blocks, one every two seconds
{
  const { level, sounds } = makeLevel({ dayTime: 18000 });
  const d = mobAt(level, 'drowned', 0, 50, 0);
  strip(d);
  d.setItemSlot('mainhand', ItemStack.of('trident'));
  const p = playerAt(level, 0.5, 50, 8.5);
  const thrown = [];
  const add = level.addEntity.bind(level);
  level.addEntity = (e) => { if (e instanceof tri.ThrownTrident) thrown.push({ e, t: level.gameTime }); return add(e); };
  let usedItem = false, aggressive = false, hurt = 0;
  const h0 = p.health;
  for (let t = 0; t < 200; t++) {
    level.tick();
    p.moveTo(0.5, 50, 8.5, 0, 0);
    p.dx = p.dy = p.dz = 0;
    usedItem ||= d.usingItem;
    aggressive ||= d.aggressive;
    if (p.health < h0) { hurt = Math.max(hurt, h0 - p.health); p.health = p.maxHealth; }
  }
  level.addEntity = add;
  const gaps = thrown.slice(1).map((x, i) => x.t - thrown[i].t);
  check('it throws tridents', thrown.length >= 3, `${thrown.length} in 10 s`);
  check('every 40 ticks', gaps.length > 0 && gaps.every((g) => g === 40), JSON.stringify(gaps));
  check('its own: nobody picks them up', thrown.every((x) => x.e.owner === d && x.e.pickup === 'disallowed'), thrown[0]?.e.pickup);
  check('arm raised while it fights (using the trident, aggressive)', usedItem && aggressive);
  check('with the shoot sound', sounds.includes('entity.drowned.shoot'));
  check('a hit hurts (8, less the armour)', hurt >= 6, `${hurt}`);
  check('it keeps its own trident', d.mainHand?.item.id === 'trident');
}

// --- loot
{
  const { level } = makeLevel();
  const drops = { flesh: 0, maxFlesh: 0, copperPlayer: 0, copperOther: 0, copperLoot3: 0, n: 3000 };
  for (let i = 0; i < drops.n; i++) {
    for (const [byPlayer, looting] of [[true, 0], [false, 0], [true, 3]]) {
      const d = mobAt(level, 'drowned', 0, 50, 0);
      strip(d);
      const before = new Set(level.entities);
      d.dropLoot(byPlayer, looting);
      for (const e of level.entities) {
        if (before.has(e) || e.type !== 'item') continue;
        const id = e.stack.item.id;
        if (id === 'rotten_flesh' && looting === 0) { drops.flesh++; drops.maxFlesh = Math.max(drops.maxFlesh, e.stack.count); }
        if (id === 'copper_ingot') {
          if (!byPlayer) drops.copperOther++;
          else if (looting) drops.copperLoot3++;
          else drops.copperPlayer++;
        }
        e.remove();
      }
      d.remove();
    }
  }
  check('rotten flesh, up to two', drops.flesh > 2000 && drops.maxFlesh === 2, JSON.stringify(drops));
  check('a copper ingot from 11% of a player\'s kills', drops.copperPlayer > 250 && drops.copperPlayer < 420);
  check('19% with looting III', drops.copperLoot3 > 470 && drops.copperLoot3 < 680);
  check('never unless a player killed it', drops.copperOther === 0);
}

// --- its voice changes under water
{
  const { level } = makeLevel();
  const d = mobAt(level, 'drowned', 0, 50, 0);
  const l = mobAt(level, 'drowned', 20, 64, 20);
  level.tick();
  check('under water it gurgles (ambient_water, hurt_water, death_water)', d.ambientSound() === 'entity.drowned.ambient_water' && d.hurtSound() === 'entity.drowned.hurt_water' && d.deathSound() === 'entity.drowned.death_water');
  check('ashore its plain voice', l.ambientSound() === 'entity.drowned.ambient' && l.hurtSound() === 'entity.drowned.hurt' && l.deathSound() === 'entity.drowned.death');
}

console.log(fails ? `${fails} FAILED` : 'all passed');
await close();
process.exit(fails ? 1 : 0);

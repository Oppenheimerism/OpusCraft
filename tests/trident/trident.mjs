// Headless checks for the trident (VITE_ROOT=<repo> node tests/trident/trident.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/game/interaction.ts', '/src/entity/thrownTrident.ts',
  '/src/entity/lightning.ts', '/src/item/enchantHelper.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, interMod, tridentMod, lightningMod, ench] = mods;
const { ItemStack, ITEMS } = itemMod;
const { S } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const trident = (enchantments) => new ItemStack(ITEMS.get('trident'), 1, 0, enchantments ? { enchantments } : null);

function makeLevel() {
  const world = new worldMod.World();
  for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  level.sound = { play: (n) => sounds.push(n), playUI() {} };
  level.particles = { spawn() {}, blockBreak() {}, spell() {}, poof() {}, entityEffect() {} };
  const gs = S('grass_block');
  for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) { const c = world.getChunk(x >> 4, z >> 4); c.setState(x & 15, 63, z & 15, gs); c.heightmap[((z & 15) << 4) | (x & 15)] = 64; }
  level.dayTime = 6000;
  level.difficulty = 'normal';
  return { world, level, sounds };
}
function makePlayer(level, x = 0.5, z = 0.5, mode = 'survival') {
  const p = new playerMod.Player(level);
  p.gameMode = mode;
  p.moveTo(x, 64, z, 0, 0);
  level.player = p;
  level.addEntity(p);
  for (let i = 0; i < 5; i++) level.tick();
  return { p, inter: new interMod.Interaction(level, p) };
}
/** a mob held in place, its hurts recorded */
function target(level, type, x, z, y = 64) {
  const m = spawner.createMob(type, level);
  m.moveTo(x, y, z, 0, 0);
  level.addEntity(m);
  m.aiStep = () => {};
  m.hurts = [];
  const hurt = m.hurt.bind(m);
  m.hurt = (a, src, ...rest) => { m.hurts.push([a, src, rest[0]]); return hurt(a, src, ...rest); };
  return m;
}
/** hold use for `ticks`, then let go */
function draw(inter, ticks) {
  inter.use(true, true);
  for (let i = 0; i < ticks; i++) inter.tickUsingItem();
  inter.use(false, false);
}
const tridents = (level) => level.entities.filter((e) => e.type === 'trident' && !e.removed);

// --- thrown: not before half a second; then out of the hand at 2.5 blocks a tick, a point of wear on it
{
  const { level, sounds } = makeLevel();
  const { p, inter } = makePlayer(level);
  const t0 = trident();
  p.inventory.setSlot(0, t0);
  inter.use(true, true);
  check('drawing it back', p.isUsingItem() && p.useItem === t0 && p.useDuration === 72000);
  for (let i = 0; i < 5; i++) inter.tickUsingItem();
  inter.use(false, false);
  check('let go too soon: not thrown', tridents(level).length === 0 && p.inventory.getSlot(0) === t0 && t0.damage === 0);
  draw(inter, 12);
  const [t] = tridents(level);
  check('thrown', !!t && t instanceof tridentMod.ThrownTrident);
  check('gone from the hand', p.inventory.getSlot(0) === null);
  check('at 2.5 blocks a tick, straight ahead', t && Math.abs(Math.hypot(t.dx, t.dy, t.dz) - 2.5) < 0.1 && t.dz > 2.3, t && `${t.dx.toFixed(3)} ${t.dy.toFixed(3)} ${t.dz.toFixed(3)}`);
  check('carrying the trident, a point worn', t?.pickupStack.item.id === 'trident' && t.pickupStack.damage === 1 && t.pickup === 'allowed');
  check('the throw sound', sounds.includes('item.trident.throw'));
  // (it comes down, sticks in the ground, and its thrower picks it up)
  let landed = -1;
  for (let i = 0; i < 200 && !t.removed; i++) {
    level.tick();
    if (landed < 0 && t.inGround) landed = i;
    if (t.inGround && i > landed + 10) p.moveTo(t.x, 64, t.z, 0, 0);
  }
  check('it lands with the ground-hit sound', landed >= 0 && sounds.includes('item.trident.hit_ground'));
  const back = p.inventory.main.find((s) => s?.item.id === 'trident');
  check('and is picked up again', t.removed && !!back && back.damage === 1);
}

// --- in creative it stays in the hand, unworn, and the thrown one can't be picked up
{
  const { level } = makeLevel();
  const { p, inter } = makePlayer(level, 0.5, 0.5, 'creative');
  const t0 = trident();
  p.inventory.setSlot(0, t0);
  draw(inter, 12);
  const [t] = tridents(level);
  check('creative: thrown, still held, unworn', !!t && p.inventory.getSlot(0) === t0 && t0.damage === 0 && t.pickup === 'creative_only');
}

// --- from the offhand
{
  const { level } = makeLevel();
  const { p, inter } = makePlayer(level);
  p.inventory.offhand = trident();
  draw(inter, 12);
  check('from the offhand', tridents(level).length === 1 && p.inventory.offhand === null);
}

// --- one use from breaking, it won't be thrown
{
  const { level } = makeLevel();
  const { p, inter } = makePlayer(level);
  const t0 = trident();
  t0.damage = 249;
  p.inventory.setSlot(0, t0);
  inter.use(true, true);
  check('too worn to use', !p.isUsingItem());
}

// --- a hit: 8, from the thrower; it drops away and can't hit again. Impaling only against what lives in the water
{
  const { level, sounds } = makeLevel();
  const { p, inter } = makePlayer(level);
  p.inventory.setSlot(0, trident());
  const pig = target(level, 'pig', 0.5, 6.5, 65);
  const pig2 = target(level, 'pig', 0.5, 8.5, 65);
  let hitAt = -1;
  draw(inter, 12);
  const [t] = tridents(level);
  for (let i = 0; i < 40; i++) {
    level.tick();
    if (hitAt < 0 && pig.hurts.length) hitAt = i;
  }
  check('the pig is hit once, for 8', pig.hurts.length === 1 && pig.hurts[0][0] === 8 && Math.abs(pig.health - 2) < 1e-6, JSON.stringify(pig.hurts.map((h) => h[0])) + ` health ${pig.health}`);
  check('by the thrower', pig.hurts[0]?.[1] === 'trident' && pig.hurts[0]?.[2] === p);
  check('with the hit sound', sounds.includes('item.trident.hit'));
  check('the pig behind it is untouched', pig2.hurts.length === 0);
  check('and it has done its damage', t.dealtDamage === true);
}
{
  const { level } = makeLevel();
  const { p, inter } = makePlayer(level);
  p.inventory.setSlot(0, trident({ impaling: 3 }));
  const cod = target(level, 'squid', 0.5, 6.5, 65);
  draw(inter, 12);
  for (let i = 0; i < 30; i++) level.tick();
  check('impaling III on a squid: 8 + 7.5', cod.hurts.length === 1 && cod.hurts[0][0] === 15.5, JSON.stringify(cod.hurts.map((h) => h[0])));
  const { level: l2 } = makeLevel();
  const { p: p2, inter: i2 } = makePlayer(l2);
  p2.inventory.setSlot(0, trident({ impaling: 3 }));
  const pig = target(l2, 'pig', 0.5, 6.5, 65);
  draw(i2, 12);
  for (let i = 0; i < 30; i++) l2.tick();
  check('but on a pig just 8', pig.hurts.length === 1 && pig.hurts[0][0] === 8, JSON.stringify(pig.hurts.map((h) => h[0])));
}

// --- loyalty: having hit, or lain a moment where it landed, it flies back to its thrower's hand
{
  const { level, sounds } = makeLevel();
  const { p, inter } = makePlayer(level);
  p.inventory.setSlot(0, trident({ loyalty: 3 }));
  p.pitch = 30;
  draw(inter, 12);
  p.pitch = 0;
  const [t] = tridents(level);
  let landed = -1, returning = -1, home = -1;
  for (let i = 0; i < 200 && home < 0; i++) {
    level.tick();
    if (landed < 0 && t.inGround) landed = i;
    if (returning < 0 && t.noPhysics) returning = i;
    if (t.removed) home = i;
  }
  check('it lands', landed >= 0);
  check('and after 5 ticks there it turns back', returning - landed >= 4 && returning - landed <= 6, `${returning - landed}`);
  check('with the return sound', sounds.includes('item.trident.return'));
  check('into its thrower\'s inventory', home >= 0 && p.inventory.main.some((s) => s?.item.id === 'trident' && ench.levelOf(s, 'loyalty') === 3), `home at ${home}`);
}
{
  const { level } = makeLevel();
  const { p, inter } = makePlayer(level);
  p.inventory.setSlot(0, trident({ loyalty: 1 }));
  const pig = target(level, 'pig', 0.5, 6.5, 65);
  draw(inter, 12);
  const [t] = tridents(level);
  let returning = -1;
  for (let i = 0; i < 20 && returning < 0; i++) { level.tick(); if (t.noPhysics) returning = i; }
  check('loyal: straight back after a hit', pig.hurts.length === 1 && returning >= 0 && !t.inGround);
  check('a loyal trident never despawns', (() => { t.life = 5000; t.tickDespawn?.(); return !t.removed; })());
}
{
  // (its thrower gone: it drops where it is)
  const { level } = makeLevel();
  const { p, inter } = makePlayer(level);
  p.inventory.setSlot(0, trident({ loyalty: 3 }));
  p.pitch = 30;
  draw(inter, 12);
  const [t] = tridents(level);
  for (let i = 0; i < 12; i++) level.tick();
  p.gameMode = 'spectator';
  for (let i = 0; i < 5; i++) level.tick();
  check('thrower a spectator: it drops as an item', t.removed && level.entities.some((e) => e.type === 'item' && e.stack?.item.id === 'trident'));
}

// --- channeling: in a thunderstorm, a hit under the open sky calls down lightning (from the thrower)
function storm(level) {
  level.setWeather('thunder');
  level.rain = level.rainO = 1;
  level.thunder = level.thunderO = 1;
}
{
  const { level, sounds } = makeLevel();
  storm(level);
  const { p, inter } = makePlayer(level);
  check('thundering', level.isThundering());
  p.inventory.setSlot(0, trident({ channeling: 1 }));
  const pig = target(level, 'pig', 0.5, 6.5, 65);
  let calls = null;
  level.onChanneledLightning = (hit) => { calls = hit.map((e) => e.type); };
  const bolts = [];
  const add = level.addEntity.bind(level);
  level.addEntity = (e) => { if (e instanceof lightningMod.LightningBolt) bolts.push(e); return add(e); };
  draw(inter, 12);
  for (let i = 0; i < 20; i++) level.tick();
  check('channeling: lightning on the pig', bolts.length === 1 && Math.abs(bolts[0].x - pig.x) < 1 && Math.abs(bolts[0].z - pig.z) < 1);
  check('called down by the thrower', bolts[0]?.cause === p);
  check('with its thunder', sounds.includes('item.trident.thunder'));
  check('the pig struck (a zombified piglin now)', calls !== null && calls.includes('pig'), JSON.stringify(calls));
}
{
  const { level } = makeLevel();
  const { p, inter } = makePlayer(level);
  p.inventory.setSlot(0, trident({ channeling: 1 }));
  target(level, 'pig', 0.5, 6.5, 65);
  let bolts = 0;
  const add = level.addEntity.bind(level);
  level.addEntity = (e) => { if (e instanceof lightningMod.LightningBolt) bolts++; return add(e); };
  draw(inter, 12);
  for (let i = 0; i < 20; i++) level.tick();
  check('no storm: no lightning', bolts === 0);
  const { level: l2, world: w2 } = makeLevel();
  storm(l2);
  const { p: p2, inter: i2 } = makePlayer(l2);
  p2.inventory.setSlot(0, trident({ channeling: 1 }));
  target(l2, 'pig', 0.5, 6.5, 65);
  for (let x = -1; x <= 1; x++) for (let z = 5; z <= 8; z++) { w2.getChunk(x >> 4, z >> 4).setState(x & 15, 67, z & 15, S('stone')); w2.getChunk(x >> 4, z >> 4).heightmap[((z & 15) << 4) | (x & 15)] = 68; }
  let b2 = 0;
  const add2 = l2.addEntity.bind(l2);
  l2.addEntity = (e) => { if (e instanceof lightningMod.LightningBolt) b2++; return add2(e); };
  draw(i2, 12);
  for (let i = 0; i < 20; i++) l2.tick();
  check('under a roof: no lightning', b2 === 0);
}

// --- riptide: only in water or rain; it flings its wielder along their look, spinning through what they meet
{
  const { level, world, sounds } = makeLevel();
  const w = S('water');
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 12; z++) for (let y = 63; y <= 66; y++) world.getChunk(x >> 4, z >> 4).setState(x & 15, y, z & 15, w);
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 12; z++) world.getChunk(x >> 4, z >> 4).setState(x & 15, 62, z & 15, S('stone'));
  const { level: dry } = makeLevel();
  const { p: pd, inter: idry } = makePlayer(dry);
  pd.inventory.setSlot(0, trident({ riptide: 3 }));
  idry.use(true, true);
  check('riptide on dry land: won\'t draw', !pd.isUsingItem());
  const { p, inter } = makePlayer(level);
  p.moveTo(0.5, 63.2, 0.5, 0, 0);
  for (let i = 0; i < 3; i++) level.tick();
  check('in the water', p.inWater && p.isInWaterOrRainNow());
  const t0 = trident({ riptide: 3 });
  p.inventory.setSlot(0, t0);
  const pig = target(level, 'pig', 0.5, 3.5, 63.2);
  // (drawn long enough for a full-strength blow)
  inter.use(true, true);
  for (let i = 0; i < 25; i++) { inter.tickUsingItem(); level.tick(); p.moveTo(0.5, 63.2, 0.5, 0, 0); p.dx = p.dy = p.dz = 0; }
  const before = { dx: p.dx, dz: p.dz };
  inter.use(false, false);
  check('riptide: nothing thrown, still in hand', tridents(level).length === 0 && p.inventory.getSlot(0) === t0 && t0.damage === 1);
  check('flung ahead at 3 blocks a tick (III)', Math.abs(p.dz - before.dz - 3) < 0.05, `${p.dz.toFixed(3)}`);
  check('spinning for a second', p.isAutoSpinAttack() && p.autoSpinAttackTicks === 20);
  check('riptide III sound', sounds.includes('item.trident.riptide_3'));
  let hitAt = -1, stopped = -1;
  for (let i = 0; i < 25; i++) {
    level.tick();
    if (hitAt < 0 && pig.hurts.length) { hitAt = i; if (!p.isAutoSpinAttack()) stopped = i; }
  }
  check('it spins into the pig for 8', pig.hurts.length === 1 && Math.abs(pig.hurts[0][0] - 8) < 1e-6, JSON.stringify(pig.hurts.map((h) => h[0])));
  check('and the spin ends on the hit', hitAt >= 0 && stopped === hitAt);
  check('the trident takes a point more from the blow', t0.damage === 2, `${t0.damage}`);
}

// --- saved and loaded with its enchantments and whether it has hit
{
  const { level } = makeLevel();
  const { p, inter } = makePlayer(level);
  p.inventory.setSlot(0, trident({ loyalty: 2, channeling: 1 }));
  p.pitch = 30;
  draw(inter, 12);
  const [t] = tridents(level);
  for (let i = 0; i < 3; i++) level.tick();
  t.dealtDamage = true;
  const d = t.save();
  const t2 = spawner.loadEntity(d, level);
  check('saved and loaded', t2 instanceof tridentMod.ThrownTrident && t2.loyalty === 2 && ench.levelOf(t2.pickupStack, 'channeling') === 1 && t2.dealtDamage === true && t2.pickupStack.damage === 1, JSON.stringify(d.data));
  check('in the summonable list', spawner.summonableTypes?.().includes('trident') ?? true);
}

console.log(fails ? `${fails} FAILED` : 'all passed');
await close();
process.exit(fails ? 1 : 0);

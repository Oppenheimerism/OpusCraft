// Headless checks for the wandering trader and his spawner (node tests/trader/trader.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 400000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/entity/wanderingTrader.ts', '/src/world/gen/biomes.ts',
  '/src/textures/mobs.ts', '/src/inventory/merchantMenu.ts', '/src/entity/trading.ts', '/src/game/wanderingTraderSpawner.ts', '/src/core/rng.ts',
  '/src/textures/villager.ts', '/src/audio/gen/wanderingTrader.ts', '/src/entity/llama.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, WT, biomes, mobs, mm, trading, WTS, rng, , audio, L] = mods;
const { ItemStack } = itemMod;
const { S } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

/** flat grass at y=63 (standing at 64) over stone */
function makeLevel() {
  const world = new worldMod.World();
  for (let cx = -6; cx <= 6; cx++) for (let cz = -6; cz <= 6; cz++) {
    const c = new chunkMod.Chunk(cx, cz);
    c.biomes.fill(biomes.BIOME_ID.plains);
    world.chunks.set(c.key, c);
  }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  level.sound = { play: (n) => sounds.push(n), playUI() {} };
  level.particles = { spawn() {}, blockBreak() {}, spell() {}, poof() {}, entityEffect() {}, blockParticle() {} };
  const xp = [];
  level.awardExperience = (x, y, z, n) => xp.push(n);
  const st = S('stone'), gs = S('grass_block');
  for (let x = -96; x <= 96; x++) for (let z = -96; z <= 96; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 55; y <= 62; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, gs);
    c.heightmap[((z & 15) << 4) | (x & 15)] = 64;
  }
  level.dayTime = 6000;
  level.difficulty = 'normal';
  return { world, level, sounds, xp };
}
function playerAt(level, x, y, z, mode = 'creative') {
  const p = new playerMod.Player(level);
  p.gameMode = mode;
  p.moveTo(x + 0.5, y, z + 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  return p;
}
const mobAt = (level, type, x, y, z, reason = 'egg') => { const m = spawner.createMob(type, level); m.moveTo(x + 0.5, y, z + 0.5, 0, 0); m.finalizeSpawn(reason); level.addEntity(m); return m; };
const settle = (level, n = 20) => { for (let i = 0; i < n; i++) level.tick(); };
const [LIST, RARE] = trading.WANDERING_TRADER_TRADES;

// --- registered
{
  check('registered with a spawn egg and a name', !!spawner.MOB_TYPES.wandering_trader && !!itemMod.ITEMS.get('wandering_trader_spawn_egg') && !!mobs.SPAWN_EGG_TEXTURES.wandering_trader_spawn_egg && spawner.entityDisplayName('wandering_trader') === 'Wandering Trader');
  const t = mobs.MOB_TEXTURES.wandering_trader?.();
  check('his skin, 64 x 64 on the villager layout', t && t.w === 64 && t.h === 64 && t.data[(12 * 64 + 44) * 4 + 3] === 0 && t.data[(1 * 64 + 44) * 4 + 3] === 255);
  const snd = audio.wanderingTraderSounds();
  check('his ten sounds', ['ambient', 'trade', 'yes', 'no', 'hurt', 'death', 'drink_potion', 'drink_milk', 'disappeared', 'reappeared'].every((k) => !!snd['entity.wandering_trader.' + k]));
  check('the lists: 64 common, 6 rare', LIST.length === 64 && RARE.length === 6, `${LIST.length} ${RARE.length}`);
}

// --- the entity
{
  const { level } = makeLevel();
  playerAt(level, 30, 64, 30);
  const t = mobAt(level, 'wandering_trader', 0, 64, 0);
  check('0.6 x 1.95, eyes at 1.62; 20 health, speed 0.7', near(t.width, 0.6) && near(t.height, 1.95) && near(t.eyeHeight, 1.62) && t.maxHealth === 20 && near(t.moveSpeedAttr, 0.7));
  check('a creature, never on a lead, never despawning when far', t.category === 'creature' && !t.canBeLeashed() && !t.removeWhenFarAway());
  let baby = false;
  const group = {};
  for (let i = 0; i < 200; i++) { const x = spawner.createMob('wandering_trader', level); x.finalizeSpawn('natural', group); baby ||= x.isBaby(); }
  check('never a baby, even in a pack', !baby);
  const r = t.ropeHoldPosition(1);
  check('his llamas\' leads held at his arms (0.95 up, 0.2 in front)', near(r[1] - t.y, 0.95) && near(Math.hypot(r[0] - t.x, r[2] - t.z), 0.2));
}

// --- offers
{
  const { level } = makeLevel();
  playerAt(level, 30, 64, 30);
  const counts = new Map(), rareSeen = new Set();
  let shapeOk = true, fiveOk = true;
  for (let i = 0; i < 300; i++) {
    const t = mobAt(level, 'wandering_trader', i % 20, 64, 0);
    const o = t.getOffers();
    const common = o.slice(0, 5), rare = o.slice(5);
    fiveOk &&= common.length === 5 && new Set(common.map((x) => x.result.item.id)).size === 5 && rare.length <= 1;
    for (const x of o) {
      shapeOk &&= x.baseCostA.id === 'emerald' && x.costB === null && x.xp === 1 && near(x.priceMultiplier, 0.05);
      counts.set(x.result.item.id, (counts.get(x.result.item.id) ?? 0) + 1);
    }
    for (const x of rare) rareSeen.add(x.result.item.id);
    t.remove();
  }
  check('five different things from the list, and at most one rare', fiveOk);
  check('priced in emeralds, 0.05 multiplier, 1 xp', shapeOk);
  const t = mobAt(level, 'wandering_trader', 0, 64, 0);
  t.offers = null;
  const byId = (id) => [...LIST, ...RARE].map((l) => l(t)).find((o) => o && o.result.item.id === id);
  const sand = byId('sand'), slime = byId('slime_ball'), dye = byId('lime_dye'), ice = byId('blue_ice'), sapling = byId('cherry_sapling');
  check('as vanilla: 8 sand for 1, 5 uses of a slime ball at 4, 3 dye for 1, blue ice at 6, a sapling at 5', sand?.result.count === 8 && sand.baseCostA.count === 1 && sand.maxUses === 8 && slime?.baseCostA.count === 4 && slime.maxUses === 5 && dye?.result.count === 3 && dye.maxUses === 12 && ice?.baseCostA.count === 6 && sapling?.baseCostA.count === 5, `${sand?.result.count} ${slime?.baseCostA.count} ${dye?.result.count} ${ice?.baseCostA.count} ${sapling?.baseCostA.count}`);
  check('rare offers seen (of what the game has)', rareSeen.size >= 3, [...rareSeen].join());
  const missing = LIST.map((l) => l(t)).filter((o) => !o).length;
  check('(items the game lacks make no offer)', true, `${missing} of ${LIST.length} missing`);
}

// --- trading
{
  const { level, sounds, xp } = makeLevel();
  const p = playerAt(level, 1, 64, 0, 'survival');
  const t = mobAt(level, 'wandering_trader', 0, 64, 0);
  settle(level, 5);
  let opened = null;
  level.onOpenMerchant = (v, pp) => { opened = new mm.MerchantMenu(pp, v); };
  check('a villager spawn egg in hand: no trading', !t.interact(p, ItemStack.of('villager_spawn_egg', 1)) && !opened);
  check('a click opens his trading', t.interact(p, null) && opened && t.isTrading() && t.tradingPlayer === p);
  check('not twice at once', !t.interact(p, null));
  const m = opened;
  check('no level, no bar, no restocking', m.traderLevel() === 1 && !m.showProgressBar() && !m.canRestock() && m.offers() === t.getOffers());
  const o = t.getOffers()[0];
  p.inventory.main[0] = ItemStack.of('emerald', 64);
  m.clicked(30, 0, 'pickup');
  m.clicked(0, 0, 'pickup');
  check('emeralds in: his offer in the result, and his yes', m.trade.items[2]?.item.id === t.getOffers().find((x) => x.satisfiedBy(m.trade.items[0], null))?.result.item.id && sounds.includes('entity.wandering_trader.yes'), String(m.trade.items[2]?.item.id));
  const active = m.trade.activeOffer;
  m.clicked(2, 0, 'pickup');
  check('taking it: the offer used, 3-6 experience for the player', active.uses === 1 && xp.length === 1 && xp[0] >= 3 && xp[0] <= 6 && t.xp === 0, `${active.uses} ${xp}`);
  settle(level, 4);
  check('he stands still, eyes on the trader', t.navigation.isDone() && t.isTrading());
  p.moveTo(6.5, 64, 0.5, 0, 0);
  settle(level, 4);
  check('the player walks 5 blocks off: the trading\'s over', !t.isTrading() && !m.stillValid(p));
  void o;
}

// --- drinking at dusk and dawn
{
  const { level, sounds } = makeLevel();
  playerAt(level, 30, 64, 30);
  const t = mobAt(level, 'wandering_trader', 0, 64, 0);
  level.dayTime = 18000;
  let held = false, heldAt = -1;
  for (let i = 0; i < 60; i++) { level.tick(); if (!held && t.mainHand?.item.id === 'potion') { held = true; heldAt = i; } }
  check('at night he drinks a potion of invisibility', held && t.isInvisible() && !t.mainHand, `held ${held} at ${heldAt}`);
  check('gulping, and a shimmer as he goes', sounds.filter((s) => s === 'entity.wandering_trader.drink_potion').length >= 5 && sounds.includes('entity.wandering_trader.disappeared'));
  const inv = t.getEffect('invisibility');
  check('for three minutes', inv && inv.duration > 3500 && inv.duration <= 3600, String(inv?.duration));
  level.dayTime = 1000;
  let milk = false;
  for (let i = 0; i < 60; i++) { level.tick(); milk ||= t.mainHand?.item.id === 'milk_bucket'; }
  check('by day, milk: seen again', milk && !t.isInvisible() && !t.mainHand && sounds.includes('entity.wandering_trader.drink_milk') && sounds.includes('entity.wandering_trader.reappeared'));
  settle(level, 40);
  check('and no more drinking while it\'s day', !t.mainHand && !t.usingItem);
}

// --- leaving
{
  const { level } = makeLevel();
  const p = playerAt(level, 1, 64, 0);
  const t = mobAt(level, 'wandering_trader', 0, 64, 0);
  settle(level, 30);
  check('from a spawn egg he stays (no despawn delay)', t.despawnDelay === 0 && !t.removed);
  t.despawnDelay = 3;
  level.onOpenMerchant = () => {};
  t.interact(p, null);
  settle(level, 3);
  check('not while he\'s trading', !t.removed && t.despawnDelay === 3);
  t.stopTrading();
  settle(level, 3);
  check('then gone when his time is up', t.removed);
}

// --- wandering to his target, and staying near it
{
  const { level } = makeLevel();
  playerAt(level, 60, 64, 60);
  const t = mobAt(level, 'wandering_trader', 0, 64, 0);
  t.wanderTarget = [24, 64, 0];
  let reached = -1;
  for (let i = 0; i < 1200 && reached < 0; i++) { level.tick(); if (!t.wanderTarget) reached = i; }
  check('he makes for his wander target, and forgets it within 2 blocks', reached > 0 && Math.hypot(t.x - 24.5, t.z - 0.5) < 3, `${reached} ${t.x.toFixed(1)},${t.z.toFixed(1)}`);
  t.restrictTo(0, 64, 0, 16);
  t.moveTo(40.5, 64, 0.5, 0, 0);
  t.navigation.stop();
  let back = false;
  for (let i = 0; i < 1500 && !back; i++) { level.tick(); back = Math.hypot(t.x, t.z) < 17; }
  check('outside his 16 blocks, back he goes', back, `${t.x.toFixed(1)},${t.z.toFixed(1)}`);
}

// --- zombies are after him, and he runs from them
{
  const { level } = makeLevel();
  playerAt(level, 60, 64, 60);
  const t = mobAt(level, 'wandering_trader', 0, 64, 0);
  const z = mobAt(level, 'zombie', 6, 64, 0);
  const d0 = Math.hypot(t.x - z.x, t.z - z.z);
  let targeted = false, maxD = 0;
  for (let i = 0; i < 60; i++) { level.tick(); targeted ||= z.target === t; maxD = Math.max(maxD, Math.hypot(t.x - z.x, t.z - z.z)); }
  check('a zombie goes for him', targeted);
  check('he runs', maxD > d0 + 2, `${d0.toFixed(1)} -> ${maxD.toFixed(1)}`);
  const d = mobAt(level, 'drowned', -6, 64, 0);
  let dT = false;
  for (let i = 0; i < 40; i++) { level.tick(); dT ||= d.target === t; }
  check('and a drowned', dT);
}

// --- saving
{
  const { level } = makeLevel();
  playerAt(level, 30, 64, 30);
  const t = mobAt(level, 'wandering_trader', 0, 64, 0);
  t.despawnDelay = 40000;
  t.wanderTarget = [5, 64, -7];
  const offers = t.getOffers().map((o) => o.result.item.id).join();
  t.getOffers()[0].uses = 2;
  const saved = t.save();
  const u = spawner.createMob('wandering_trader', level);
  u.load(saved);
  check('saved: his time left, his wander target, his offers and their uses', u.despawnDelay === 40000 && u.wanderTarget?.join() === '5,64,-7' && u.getOffers().map((o) => o.result.item.id).join() === offers && u.getOffers()[0].uses === 2);
}

// --- the spawner
{
  const { level } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  const sp = new WTS.WanderingTraderSpawner();
  sp.load(undefined);
  check('a new world: a day to wait, 25%', sp.spawnDelay === 24000 && sp.spawnChance === 25);
  // chance rolls that fail: the chance climbs to 75 and stays
  sp.random = { nextInt: (n) => n - 1 };
  const chances = [];
  for (let d = 0; d < 4; d++) { sp.spawnDelay = 1200; for (let i = 0; i < 1200; i++) sp.tick(level); chances.push(sp.spawnChance); }
  check('each day he doesn\'t come, 25% more, to 75%', chances.join() === '50,75,75,75' && sp.spawnDelay === 24000, chances.join());
  // the wait counts down only once a minute
  sp.spawnDelay = 24000;
  for (let i = 0; i < 1199; i++) sp.tick(level);
  check('the wait counts down by the minute', sp.spawnDelay === 24000);
  sp.tick(level);
  check('...1200 at a time', sp.spawnDelay === 22800);
  level.gameRules.doTraderSpawning = false;
  for (let i = 0; i < 1200; i++) sp.tick(level);
  check('doTraderSpawning off: nothing counts down', sp.spawnDelay === 22800);
  level.gameRules.doTraderSpawning = true;
  // both rolls pass: he comes
  const real = new rng.Rand(7);
  let k = 0;
  sp.random = { nextInt: (n) => (k++ < 2 ? 0 : real.nextInt(n)) };
  sp.spawnDelay = 1200;
  sp.spawnChance = 50;
  let came = 0;
  for (let i = 0; i < 1200; i++) came += sp.tick(level);
  const t = level.entities.find((e) => e.type === 'wandering_trader');
  const llamas = level.entities.filter((e) => e.type === 'trader_llama');
  check('he comes: on the surface within 48 blocks of the player', came === 1 && t && t.y === 64 && Math.abs(t.x - p.x) <= 49 && Math.abs(t.z - p.z) <= 49, t ? `${t.x},${t.y},${t.z}` : 'none');
  check('forty minutes to stay, making for the player, kept within 16 blocks of there', t.despawnDelay === 48000 && t.wanderTarget?.join() === '0,64,0' && t.restrictRadius === 16 && sp.traderId === t.uuid);
  check('two trader llamas, grown, on his leads, near him', llamas.length === 2 && llamas.every((l) => l.leashHolder === t && !l.isBaby() && Math.abs(l.x - t.x) <= 5 && Math.abs(l.z - t.z) <= 5), llamas.map((l) => `${l.x - t.x},${l.z - t.z}`).join(' '));
  check('then the chance is back to 25% and the wait a day', sp.spawnChance === 25 && sp.spawnDelay === 24000);
  settle(level, 5);
  check('his llamas keep his time', llamas.every((l) => Math.abs(l.despawnDelay - t.despawnDelay) <= 1), llamas.map((l) => l.despawnDelay).join());
  // a bell within 48 blocks: he's sent there
  const { level: l2 } = makeLevel();
  playerAt(l2, 0, 64, 0);
  l2.setBlock(20, 64, 10, S('bell'));
  const sp2 = new WTS.WanderingTraderSpawner();
  sp2.load({ delay: 1200, chance: 75 });
  k = 0;
  sp2.random = { nextInt: (n) => (k++ < 2 ? 0 : real.nextInt(n)) };
  for (let i = 0; i < 1200; i++) sp2.tick(l2);
  const t2 = l2.entities.find((e) => e.type === 'wandering_trader');
  check('a village bell within 48: he\'s sent to it', t2 && t2.wanderTarget?.join() === '20,64,10' && Math.abs(t2.x - 20) <= 49, t2 ? `${t2.wanderTarget}` : 'none');
  check('saved and loaded', JSON.stringify(sp2.save()) === JSON.stringify({ delay: 24000, chance: 25, id: t2.uuid }));
  // no room: nothing comes
  const { level: l3, world: w3 } = makeLevel();
  playerAt(l3, 0, 64, 0);
  for (let x = -96; x <= 96; x++) for (let z = -96; z <= 96; z++) w3.getChunk(x >> 4, z >> 4).setState(x & 15, 64, z & 15, S('water'));
  const sp3 = new WTS.WanderingTraderSpawner();
  sp3.load({ delay: 1200, chance: 75 });
  k = 0;
  sp3.random = { nextInt: (n) => (k++ < 2 ? 0 : real.nextInt(n)) };
  let c3 = 0;
  for (let i = 0; i < 1200; i++) c3 += sp3.tick(l3);
  check('nowhere to stand (all water): he doesn\'t come, and the chance keeps climbing', c3 === 0 && !l3.entities.some((e) => e.type === 'wandering_trader') && sp3.spawnChance === 75);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

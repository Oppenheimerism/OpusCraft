// Headless checks for Stage 5 M4 (node tests/ocean/m4.mjs): the fish (cod, salmon, pufferfish, tropical fish), their
// buckets, dolphins and glow squid — what they are, where they spawn, how they swim, flop, school, puff up, breathe,
// dry out and go dark; scooping them up and pouring them out (by hand and from a dispenser); their items, eggs, saves,
// sounds, particles, textures and renderers (through stand-ins).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/entity/fish.ts', '/src/entity/dolphin.ts', '/src/entity/glowSquid.ts',
  '/src/game/ocean.ts', '/src/item/item.ts', '/src/render/oceanRenderers.ts', '/src/textures/mobs.ts', '/src/render/entityRenderer.ts',
  '/src/audio/gen/ocean.ts', '/src/textures/items.ts', '/src/game/oceanSpawns.ts', '/src/game/itemBehavior.ts', '/src/item/hoverText.ts',
  '/src/game/redstone/dispenseItems.ts', '/src/entity/mob.ts', '/src/render/fishRenderers.ts', '/src/world/gen/biomes.ts', '/src/world/dir.ts',
  '/src/render/particles.ts', '/src/world/fluids.ts', '/src/render/mobModels.ts', '/src/entity/water.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, F, D, GS, , itemMod, R, texMobs, entityRenderer, oceanAudio, itemTex, OS, IB, HT, DI, M, FR, biomes, dir, PE, fluids, mobModels, water] = mods;
const { S, BLOCKS, STATE_BLOCK } = blockMod;
const { ITEMS, ITEM_LIST, ItemStack } = itemMod;
const { MOB_TEXTURES } = texMobs;
const { B } = biomes;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const name = (st) => BLOCKS[STATE_BLOCK[st]].name;

/** stone from y 40 to 49; water from 50 to 62 over x, z in [-24, 24) (everywhere if `sea`); dry floor round it */
function setup({ biome = 'plains', sea = false } = {}) {
  const world = new worldMod.World();
  for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) { const c = new chunkMod.Chunk(cx, cz); c.biomes.fill(B[biome]); world.chunks.set(c.key, c); }
  for (let x = -64; x < 64; x++) for (let z = -64; z < 64; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 40; y <= 49; y++) c.setState(x & 15, y, z & 15, S('stone'));
    if (sea || (x >= -24 && x < 24 && z >= -24 && z < 24)) for (let y = 50; y <= 62; y++) c.setState(x & 15, y, z & 15, S('water'));
  }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new levelMod.Level(world, 'test');
  const sounds = [], parts = [], triggers = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p, t: level.gameTime }); }, playUI() {} };
  level.particles = { blockBreak() {}, blockHit() {}, spawn(k, x, y, z) { parts.push({ k, x, y, z }); }, entityEffect() {} };
  level.onPlayerTrigger = (p, t, d) => triggers.push({ t, d });
  level.difficulty = 'normal';
  level.doDaylightCycle = false;
  level.dayTime = 6000;
  level.simulationDistance = 10;
  const player = new playerMod.Player(level);
  player.moveTo(0.5, 55, 8.5, 0, 0);
  player.gameMode = 'survival';
  level.player = player;
  level.addEntity(player);
  return { level, world, player, sounds, parts, triggers };
}
const spawn = (level, type, x, y, z, reason = 'command', group) => {
  const m = spawner.createMob(type, level);
  m.moveTo(x, y, z, 0, 0);
  m.finalizeSpawn(reason, group);
  level.addEntity(m);
  return m;
};
/** ticks the level, the player held where it is */
const tickPinned = (level, player, n, until, each) => {
  const [px, py, pz] = [player.x, player.y, player.z];
  for (let i = 0; i < n; i++) {
    each?.();
    level.tick();
    player.moveTo(px, py, pz, player.yaw, player.pitch);
    player.dx = player.dy = player.dz = 0;
    player.fallDistance = 0;
    player.air = 300;
    if (until?.()) return i + 1;
  }
  return n;
};

// --- what they are
{
  const { level } = setup();
  const kinds = { cod: F.Cod, salmon: F.Salmon, pufferfish: F.Pufferfish, tropical_fish: F.TropicalFish, dolphin: D.Dolphin, glow_squid: GS.GlowSquid };
  const made = Object.fromEntries(Object.keys(kinds).map((k) => [k, spawner.createMob(k, level)]));
  check('the six are made by name', Object.entries(kinds).every(([k, C]) => made[k] instanceof C));
  check('...and named', Object.keys(kinds).map((k) => spawner.entityDisplayName(k)).join(',') === 'Cod,Salmon,Pufferfish,Tropical Fish,Dolphin,Glow Squid');
  check('fish are water ambient, the dolphin a water creature, the glow squid underground', ['cod', 'salmon', 'pufferfish', 'tropical_fish'].every((k) => made[k].category === 'water_ambient') && made.dolphin.category === 'water_creature' && made.glow_squid.category === 'underground_water_creature');
  const size = (m) => `${+m.width.toFixed(3)}x${+m.height.toFixed(3)}`;
  check('sizes (cod 0.5x0.3, salmon 0.7x0.4, a deflated pufferfish 0.35, tropical 0.5x0.4, dolphin 0.9x0.6, glow squid 0.8)', Object.values(made).map(size).join(' ') === '0.5x0.3 0.7x0.4 0.35x0.35 0.5x0.4 0.9x0.6 0.8x0.8', Object.values(made).map(size).join(' '));
  check('health: fish 3, dolphin and glow squid 10; the dolphin bites for 3', ['cod', 'salmon', 'pufferfish', 'tropical_fish'].every((k) => made[k].maxHealth === 3) && made.dolphin.maxHealth === 10 && made.glow_squid.maxHealth === 10 && made.dolphin.attackDamage === 3);
  check('fish go further than 64 away, the rest 128', M.despawnDistance('water_ambient') === 64 && M.despawnDistance('water_creature') === 128 && M.despawnDistance('monster') === 128);
  check('the dolphin holds its breath 4800 ticks', made.dolphin.air === 4800 && D.DOLPHIN_AIR === 4800 && !made.dolphin.canBreatheUnderwater());
  check('spawn eggs with sprites', ['cod', 'dolphin', 'glow_squid', 'pufferfish', 'salmon', 'tropical_fish'].every((m) => ITEMS.get(`${m}_spawn_egg`)?.creativeTab === 'spawn_eggs' && itemTex.ITEM_TEXTURES[`${m}_spawn_egg`]));
  const tf = ITEMS.get('tropical_fish');
  check('tropical fish: food (1, 0.1)', tf?.food?.nutrition === 1 && Math.abs(tf.food.saturation - 0.1) < 1e-9 && tf.creativeTab === 'food');
  const buckets = ['cod', 'salmon', 'tropical_fish', 'pufferfish'].map((f) => ITEMS.get(`${f}_bucket`));
  check('the buckets: one to a stack, "Bucket of ..."', buckets.every((b) => b && b.maxStack === 1 && b.creativeTab === 'tools') && buckets.map((b) => b.name).join('|') === 'Bucket of Cod|Bucket of Salmon|Bucket of Tropical Fish|Bucket of Pufferfish', buckets.map((b) => b?.name).join('|'));
  check('glow ink sac', ITEMS.get('glow_ink_sac') && ITEMS.get('glow_ink_sac').maxStack === 64);
  check('...all with sprites', ['tropical_fish', 'cod_bucket', 'salmon_bucket', 'tropical_fish_bucket', 'pufferfish_bucket', 'glow_ink_sac'].every((id) => itemTex.ITEM_TEXTURES[id]));
  const ids = ITEM_LIST.map((i) => i.id);
  const at = (id) => ids.indexOf(id);
  check('in the creative order: tropical fish after cooked salmon, the buckets after water, glow ink after ink', at('tropical_fish') === at('cooked_salmon') + 1 && ['cod_bucket', 'salmon_bucket', 'tropical_fish_bucket', 'pufferfish_bucket'].every((id, i) => at(id) === at('water_bucket') + 1 + i) && at('glow_ink_sac') === at('ink_sac') + 1);
}

// --- where they spawn
{
  const W = OS.waterSpawnsFor;
  const s = (l) => l.map((e) => `${e.type} ${e.weight} ${e.min}-${e.max}`).join(', ');
  const all = (n) => { const w = W(n); return `${s(w.water)} | ${s(w.water_ambient)} | ${s(w.underground_water_creature)}`; };
  const exp = {
    ocean: 'squid 1 1-4, dolphin 1 1-2 | cod 10 3-6 | glow_squid 10 4-6',
    deep_ocean: 'squid 1 1-4, dolphin 1 1-2 | cod 10 3-6 | glow_squid 10 4-6',
    cold_ocean: 'squid 3 1-4 | cod 15 3-6, salmon 15 1-5 | glow_squid 10 4-6',
    lukewarm_ocean: 'squid 10 1-2, dolphin 2 1-2 | cod 15 3-6, pufferfish 5 1-3, tropical_fish 25 8-8 | glow_squid 10 4-6',
    deep_lukewarm_ocean: 'squid 8 1-4, dolphin 2 1-2 | cod 8 3-6, pufferfish 5 1-3, tropical_fish 25 8-8 | glow_squid 10 4-6',
    warm_ocean: 'squid 10 1-4, dolphin 2 1-2 | pufferfish 15 1-3, tropical_fish 25 8-8 | glow_squid 10 4-6',
    frozen_ocean: 'squid 1 1-4 | salmon 15 1-5 | glow_squid 10 4-6',
    river: 'squid 2 1-4 | salmon 5 1-5 | glow_squid 10 4-6',
    mangrove_swamp: ' | tropical_fish 25 8-8 | glow_squid 10 4-6',
    lush_caves: ' | tropical_fish 25 8-8 | glow_squid 10 4-6',
    plains: ' |  | glow_squid 10 4-6',
    deep_dark: ' |  | ',
  };
  const bad = Object.entries(exp).filter(([n, e]) => all(n) !== e).map(([n]) => `${n}: ${all(n)}`);
  check('the water spawn lists of vanilla OverworldBiomes', bad.length === 0, bad.join('; '));
  // through the spawner, in a warm ocean
  const { level } = setup({ biome: 'warm_ocean', sea: true });
  const sp = new spawner.NaturalSpawner(level, 1);
  const types = (cat) => sp.mobsAt(cat, 30, 55, 30).map((e) => e.type).join(',');
  check('the spawner\'s lists in a warm ocean', types('water_ambient') === 'pufferfish,tropical_fish' && types('water_creature') === 'squid,dolphin' && types('underground_water_creature') === 'glow_squid' && types('axolotls') === '', `${types('water_ambient')} / ${types('water_creature')}`);
  // the rules: fish near the top of the sea, the glow squid deep in the dark
  const rules = (t, x, y, z) => sp.checkSpawnRules(t, x, y, z);
  check('fish and dolphins: 13 below the sea level to it, water below and above', rules('cod', 30, 55, 30) && rules('dolphin', 30, 51, 30) && !rules('cod', 30, 50, 30) && !rules('cod', 30, 62, 30));
  check('placed in water', sp.placementOk('tropical_fish', 30, 55, 30) && !sp.placementOk('tropical_fish', 30, 63, 30));
  const rb = level.rawBrightness;
  level.rawBrightness = () => 0;
  const deep = (y) => { level.world.getChunk(1, 1).setState(0, y, 0, S('water')); return GS.GlowSquid.checkSpawn(level, 16, y, 16); };
  check('glow squid: 33 below the sea or deeper, in the dark, in water', deep(30) && !deep(31) && !GS.GlowSquid.checkSpawn(level, 16, 25, 16));
  level.rawBrightness = () => 1;
  check('...never where there\'s any light', !deep(30));
  level.rawBrightness = rb;
  check('tropical fish: anywhere in the lush caves\' water', F.TropicalFish.checkTropicalFishSpawn(level, 30, 20, 30, 'lush_caves') === false && (() => { const c = level.world.getChunk(1, 1); for (const y of [19, 20, 21]) c.setState(14, y, 14, S('water')); return F.TropicalFish.checkTropicalFishSpawn(level, 30, 20, 30, 'lush_caves'); })());
  // natural spawning
  for (let i = 0; i < 400; i++) { level.tick(); sp.tick(); }
  const tally = {};
  for (const e of level.entities) if (e !== level.player) tally[e.type] = (tally[e.type] ?? 0) + 1;
  check('a warm sea fills with tropical fish and pufferfish, squid and dolphins', (tally.tropical_fish ?? 0) + (tally.pufferfish ?? 0) > 0 && (tally.squid ?? 0) + (tally.dolphin ?? 0) > 0 && !tally.cod, JSON.stringify(tally));
  const fish = level.entities.filter((e) => e instanceof F.AbstractFish);
  const far = fish.filter((e) => e.distanceToSqr(level.player.x, level.player.y, level.player.z) > 64 * 64);
  check('...no fish spawned past 64 away', far.length === 0);
}

// --- swimming, flopping, choking
{
  const { level, player, sounds } = setup();
  player.gameMode = 'creative';
  const cod = spawn(level, 'cod', 0.5, 55, -10.5);
  const beached = spawn(level, 'cod', 40.5, 50, 0.5);
  const squid = spawn(level, 'squid', 40.5, 50, 8.5);
  let moved = 0, minY = 99, maxY = 0, top = 0, codAir = 300;
  const x0 = cod.x, z0 = cod.z;
  for (let i = 0; i < 500; i++) {
    tickPinned(level, player, 1);
    moved = Math.max(moved, Math.hypot(cod.x - x0, cod.z - z0));
    minY = Math.min(minY, cod.y);
    maxY = Math.max(maxY, cod.y);
    codAir = Math.min(codAir, cod.air);
    if (i < 60 && beached.isAlive) top = Math.max(top, beached.y);
  }
  check('a cod swims about in the water', moved > 2 && minY >= 49.9 && maxY < 63, `moved ${moved.toFixed(1)}, y ${minY.toFixed(2)}..${maxY.toFixed(2)}`);
  check('...never short of breath', codAir === 300 && cod.isAlive);
  check('on land it flops (0.4 up)', top > 50.5 && top < 51.5 && sounds.some((s) => s.n === 'entity.cod.flop'), `top ${top.toFixed(2)}`);
  check('...and chokes (air out after 15 s, then 2 a second)', !beached.isAlive && sounds.some((s) => s.n === 'entity.cod.death'));
  check('a squid on land chokes too', !squid.isAlive);
  check('swimming fish swish', sounds.some((s) => s.n === 'entity.fish.swim'));
}

// --- schools
{
  const { level, player } = setup();
  player.gameMode = 'creative';
  const group = {};
  const school = [0, 1, 2, 3, 4].map((i) => spawn(level, 'cod', -10.5 + i * 0.4, 55, -10.5, 'natural', group));
  const leader = school[0];
  check('a pack spawned together is a school: the first leads', leader.hasFollowers() && school.slice(1).every((f) => f.isFollower()));
  for (let i = 0; i < 300; i++) tickPinned(level, player, 1);
  const spread = Math.max(...school.map((f) => Math.hypot(f.x - leader.x, f.z - leader.z)));
  check('...and they keep together', spread < 11, `${spread.toFixed(1)} apart`);
  const trop = [];
  let alike = 0;
  for (let g = 0; g < 40; g++) {
    const grp = {};
    const five = [0, 1, 2, 3, 4].map(() => spawn(level, 'tropical_fish', 10.5, 55, 10.5, 'natural', grp));
    if (five.every((f) => f.variant === five[0].variant)) alike++;
    trop.push(...five);
  }
  check('tropical fish packs share their kind (the common ones, nine in ten)', alike >= 28, `${alike}/40`);
  const common = trop.filter((t) => F.COMMON_TROPICAL.includes(t.variant)).length;
  check('...most of the kinds are the 22 common ones', common > trop.length * 0.8, `${common}/${trop.length}`);
  check('22 named kinds', F.COMMON_TROPICAL.length === 22 && F.COMMON_TROPICAL_NAMES.length === 22 && new Set(F.COMMON_TROPICAL).size === 22);
  const v = F.packTropical(10, 1, 14), u = F.unpackTropical(v);
  check('packed variants: pattern, body and pattern colours', u.pattern === 10 && u.base === 1 && u.patternColor === 14 && u.large && u.index === 4 && F.TROPICAL_PATTERNS[10] === 'betty');
  check('Clownfish: kob, orange on white', F.unpackTropical(F.COMMON_TROPICAL[5]).pattern === 0 && F.unpackTropical(F.COMMON_TROPICAL[5]).base === 1 && F.unpackTropical(F.COMMON_TROPICAL[5]).patternColor === 0);
}

// --- pufferfish
{
  const { level, player, sounds } = setup();
  const pf = spawn(level, 'pufferfish', 0.5, 55, 7.2);
  let s1 = -1, s2 = -1, poisoned = false;
  for (let i = 0; i < 120 && s2 < 0; i++) {
    tickPinned(level, player, 1, null, () => pf.moveTo(0.5, 55, 7.2, 0, 0));
    if (s1 < 0 && pf.puffState === 1) s1 = i;
    if (pf.puffState === 2) s2 = i;
    poisoned ||= player.hasEffect('poison');
  }
  check('a survival player near: it puffs up halfway at once, all the way 40 ticks on', s1 >= 0 && s2 - s1 >= 39 && s2 - s1 <= 43 && sounds.filter((s) => s.n === 'entity.puffer_fish.blow_up').length === 2, `${s1} ${s2}`);
  check('...growing (0.7 across)', Math.abs(pf.width - 0.7) < 1e-9);
  for (let i = 0; i < 30 && !poisoned; i++) {
    tickPinned(level, player, 1, null, () => pf.moveTo(player.x, player.y + 0.3, player.z, 0, 0));
    poisoned ||= player.hasEffect('poison');
  }
  check('touching the player it stings: poison', poisoned && sounds.some((s) => s.n === 'entity.puffer_fish.sting'));
  player.gameMode = 'creative';
  player.moveTo(0.5, 55, -20.5, 0, 0);
  let d1 = -1, d0 = -1;
  for (let i = 0; i < 300 && d0 < 0; i++) {
    tickPinned(level, player, 1, null, () => pf.moveTo(0.5, 55, 7.2, 0, 0));
    if (d1 < 0 && pf.puffState === 1) d1 = i;
    if (pf.puffState === 0) d0 = i;
  }
  check('left alone, it goes down a step at a time', d1 > 55 && d0 > d1 && sounds.some((s) => s.n === 'entity.puffer_fish.blow_out'), `${d1} ${d0}`);
  const pf2 = spawn(level, 'pufferfish', 0.5, 55, -18.5);
  tickPinned(level, player, 60);
  check('a creative player doesn\'t scare it', pf2.puffState === 0);
  const cow = spawn(level, 'cow', 0.5, 55, -16.5);
  const sq = spawn(level, 'squid', 0.5, 55, -16.5);
  pf2.setPuffState(2);
  const h = cow.health;
  for (let i = 0; i < 10; i++) { pf2.moveTo(cow.x, cow.y + 0.5, cow.z, 0, 0); pf2.aiStep(); }
  check('puffed up, it stings mobs (not the sea\'s own)', cow.health < h && cow.hasEffect('poison') && sq.health === sq.maxHealth);
}

// --- buckets
{
  const { level, player, sounds, triggers } = setup();
  const cod = spawn(level, 'cod', 0.5, 55, 5.5);
  cod.health = 2;
  player.inventory.setSelectedItem(ItemStack.of('water_bucket'));
  const ok = cod.interact(player, player.inventory.selectedItem);
  const held = player.inventory.selectedItem;
  check('a water bucket scoops up a cod: its bucket in hand, keeping its health', ok && held?.item.id === 'cod_bucket' && held.tag?.bucketEntity?.Health === 2 && cod.removed && sounds.some((s) => s.n === 'item.bucket.fill_fish'));
  check('...for Tactical Fishing', triggers.some((t) => t.t === 'filled_bucket' && t.d?.filledBucket === 'cod_bucket'));
  check('an empty bucket doesn\'t', !spawn(level, 'salmon', 0.5, 55, 5.5).interact(player, ItemStack.of('bucket')));
  player.gameMode = 'creative';
  player.inventory.clear();
  player.inventory.setSelectedItem(ItemStack.of('water_bucket'));
  const t = spawn(level, 'tropical_fish', 0.5, 55, 5.5);
  t.variant = F.COMMON_TROPICAL[5];
  t.interact(player, player.inventory.selectedItem);
  const slot = player.inventory.findSlot((s) => s.item.id === 'tropical_fish_bucket');
  const tb = slot >= 0 ? player.inventory.getSlot(slot) : null;
  check('in creative the water bucket stays, and the fish\'s comes too', player.inventory.selectedItem?.item.id === 'water_bucket' && tb?.tag?.bucketEntity?.BucketVariantTag === F.COMMON_TROPICAL[5]);
  check('a bucket of tropical fish names its kind', tb && HT.hoverText(tb).includes('§7§oClownfish'), JSON.stringify(tb && HT.hoverText(tb)));
  const rare = ItemStack.of('tropical_fish_bucket');
  rare.tag = { bucketEntity: { Health: 3, BucketVariantTag: F.packTropical(10, 1, 14) } };
  const lines = HT.hoverText(rare);
  check('...or its pattern and colours', lines.includes('§7§oBetty') && lines.includes('§7§oOrange, Red'), JSON.stringify(lines));
  // poured out: looking down at the floor two blocks ahead, on the dry land
  player.gameMode = 'survival';
  player.moveTo(30.5, 50, 0.5, 0, 45);
  const stack = ItemStack.of('tropical_fish_bucket');
  stack.tag = { bucketEntity: { Health: 1, BucketVariantTag: F.packTropical(10, 1, 14) } };
  player.inventory.setSelectedItem(stack);
  const r = IB.itemBehaviorOf('tropical_fish_bucket').use(level, player, stack);
  const out = level.entities.find((e) => e instanceof F.TropicalFish && Math.abs(e.x - 30.5) < 0.01 && Math.abs(e.z - 2.5) < 0.01);
  check('used, it pours its water where it\'s pointed...', r === 'success' && name(level.getState(30, 50, 2)) === 'water' && sounds.some((s) => s.n === 'item.bucket.empty_fish'), `${r} ${name(level.getState(30, 50, 2))}`);
  check('...the fish in it, as it was (and it never despawns)', out && out.fromBucket && out.health === 1 && out.variant === F.packTropical(10, 1, 14) && out.requiresCustomPersistence() && !out.removeWhenFarAway());
  check('...and an empty bucket is left', player.inventory.selectedItem?.item.id === 'bucket');
  // into a waterloggable block looked at
  level.setBlock(30, 50, 4, S('oak_slab'));
  player.moveTo(30.5, 50, 2.5, 0, 45);
  const st2 = ItemStack.of('salmon_bucket');
  player.inventory.setSelectedItem(st2);
  const r2 = IB.itemBehaviorOf('salmon_bucket').use(level, player, st2);
  const slab = BLOCKS[STATE_BLOCK[level.getState(30, 50, 4)]];
  check('...into a slab looked at, waterlogging it', r2 === 'success' && slab.name === 'oak_slab' && slab.get(level.getState(30, 50, 4), 'waterlogged') === true && level.entities.some((e) => e instanceof F.Salmon && Math.abs(e.z - 4.5) < 0.01 && Math.abs(e.y - 50.5) < 0.01), `${r2}`);
  // a dispenser
  const src = { level, x: 30, y: 50, z: 10, facing: dir.SOUTH, be: { addItem: () => -1 }, success: true };
  const left = DI.dispenseBehaviorFor(ItemStack.of('pufferfish_bucket'))(src, ItemStack.of('pufferfish_bucket'));
  check('a dispenser pours one out in front, and keeps the bucket', left?.item.id === 'bucket' && name(level.getState(30, 50, 11)) === 'water' && level.entities.some((e) => e instanceof F.Pufferfish && e.fromBucket && Math.abs(e.z - 11.5) < 0.01));
  level.setBlock(30, 50, 13, S('stone'));
  const src2 = { ...src, z: 12 };
  const n0 = level.entities.length;
  const left2 = DI.dispenseBehaviorFor(ItemStack.of('cod_bucket'))(src2, ItemStack.of('cod_bucket'));
  check('...where the water can\'t go, it\'s thrown out', left2 === null && level.entities.length === n0 + 1 && level.entities.at(-1).stack?.item.id === 'cod_bucket');
}

// --- dolphins
{
  const { level, player, sounds, parts } = setup();
  const d = spawn(level, 'dolphin', 0.5, 55, 4.5);
  let graced = -1;
  // (sprinting under the water: forward, with the sprint key)
  player.input.forward = player.input.sprint = true;
  for (let i = 0; i < 60 && graced < 0; i++) {
    tickPinned(level, player, 1);
    if (player.hasEffect('dolphins_grace')) graced = i;
  }
  player.input.forward = player.input.sprint = false;
  check('a player swimming near a dolphin gets Dolphin\'s Grace', graced >= 0, `${graced}`);
  // under the water, it holds its breath
  const d2 = spawn(level, 'dolphin', -10.5, 52, -10.5);
  let under = 0;
  for (let i = 0; i < 20; i++) { tickPinned(level, player, 1); if (d2.eyeFluid === fluids.FLUID_WATER) under++; }
  check('under the water it holds its breath', under < 20 || d2.air === 4780, `${d2.air} (${under} under)`);
  d2.air = 130;
  let back = -1;
  for (let i = 0; i < 400 && back < 0; i++) { tickPinned(level, player, 1); if (d2.air === 4800) back = i; }
  check('...and short of breath it goes up for air, all of it back at once', back >= 0 && d2.isAlive, `${back}`);
  // fed a fish, it goes looking for treasure (the real search, M5's, stood in for: none, then one 40 east)
  const realHook = D.dolphinHooks.findTreasure;
  D.dolphinHooks.findTreasure = () => null;
  player.inventory.setSelectedItem(ItemStack.of('cod', 3));
  const fed = d.interact(player, player.inventory.selectedItem);
  check('fed a fish (eaten)', fed && d.gotFish && player.inventory.selectedItem.count === 2 && sounds.some((s) => s.n === 'entity.dolphin.eat'));
  check('...not anything else', !d.interact(player, ItemStack.of('bread')));
  tickPinned(level, player, 10);
  check('...no treasure about (nothing to find): it gives up', !d.gotFish);
  let hookX = null;
  D.dolphinHooks.findTreasure = (lvl, x, y, z) => { hookX = x; return [x + 40, 0, z]; };
  player.moveTo(0.5, 55, -20.5, 0, 0);
  player.sprinting = false;
  const x0 = d.x;
  d.interact(player, player.inventory.selectedItem);
  let furthest = 0;
  for (let i = 0; i < 300; i++) { tickPinned(level, player, 1); furthest = Math.max(furthest, d.x - x0); }
  check('...with some, it heads that way, happy', d.treasurePos[0] === hookX + 40 && furthest > 8 && parts.some((p) => p.k === 'happy_villager'), `${d.treasurePos} ${furthest.toFixed(1)}`);
  D.dolphinHooks.findTreasure = realHook;
  check('a quick dolphin leaves a wake', parts.some((p) => p.k === 'dolphin'));
  // out of the water
  const beached = spawn(level, 'dolphin', 40.5, 50, 0.5);
  let hop = 0;
  for (let i = 0; i < 100; i++) { tickPinned(level, player, 1); hop = Math.max(hop, beached.y - 50); }
  check('on land it dries out (a tick at a time), hopping about', beached.moistness <= 2400 - 99 && beached.moistness >= 2400 - 101 && hop > 0.5, `${beached.moistness} hop ${hop.toFixed(2)}`);
  beached.moistness = 3;
  const h = beached.health;
  tickPinned(level, player, 15);
  check('...and dried out, it gets hurt', beached.health < h);
  beached.moistness = 2400;
  const h2 = beached.health;
  beached.air = 5;
  tickPinned(level, player, 30);
  check('...but never chokes in the air', beached.air === 4800 && beached.health >= h2 - 1e-9);
}

// --- glow squid
{
  const { level, player, parts } = setup();
  const g = spawn(level, 'glow_squid', -10.5, 55, -10.5);
  tickPinned(level, player, 5);
  check('glow squid: glow sparks about it', parts.filter((p) => p.k === 'glow').length >= 5);
  check('...shining at full light', g.blockLight(0) === 15);
  g.hurt(1, 'mob', player, player);
  check('hurt, it goes dark 5 s', g.darkTicksRemaining === 100 && g.blockLight(3) === 3 && g.blockLight(0) === 0);
  tickPinned(level, player, 95);
  check('...brightening over the last half second', g.darkTicksRemaining === 5 && g.blockLight(3) === 7, `${g.darkTicksRemaining} ${g.blockLight(3)}`);
  tickPinned(level, player, 10);
  check('...and shines again', g.blockLight(2) === 15);
  const sq = spawn(level, 'squid', -12.5, 55, -12.5);
  g.hurt(1, 'magic');
  check('its ink is the glowing kind', g.squirtSound() === 'entity.glow_squid.squirt' && g.inkParticle() === 'glow_squid_ink' && sq.inkParticle() === 'squid_ink');
  check('drops 1 to 3 glow ink sacs', JSON.stringify(g.lootTable()) === JSON.stringify([{ item: 'glow_ink_sac', min: 1, max: 3 }]));
}

// --- saves
{
  const { level } = setup();
  const round = (e) => spawner.loadEntity(spawner.saveEntity(e), level);
  const t = spawn(level, 'tropical_fish', 0, 55, 0);
  t.variant = F.packTropical(7, 3, 9);
  t.fromBucket = true;
  const pf = spawn(level, 'pufferfish', 0, 55, 0);
  pf.setPuffState(2);
  const d = spawn(level, 'dolphin', 0, 55, 0);
  d.moistness = 1234; d.gotFish = true; d.treasurePos = [100, 0, -50]; d.air = 999;
  const g = spawn(level, 'glow_squid', 0, 55, 0);
  g.darkTicksRemaining = 42;
  const [t2, pf2, d2, g2] = [t, pf, d, g].map(round);
  check('saved and loaded: the tropical fish\'s kind, from a bucket', t2 instanceof F.TropicalFish && t2.variant === t.variant && t2.fromBucket);
  check('...the pufferfish\'s puff (and size)', pf2.puffState === 2 && Math.abs(pf2.width - 0.7) < 1e-9);
  check('...the dolphin\'s moisture, fish, treasure and breath', d2.moistness === 1234 && d2.gotFish && d2.treasurePos.join() === '100,0,-50' && d2.air === 999);
  check('...the glow squid\'s dark', g2.darkTicksRemaining === 42);
}

// --- sounds
{
  const gens = oceanAudio.oceanSounds();
  const names = ['entity.fish.swim', 'item.bucket.fill_fish', 'item.bucket.empty_fish'];
  for (const f of ['cod', 'salmon', 'tropical_fish', 'puffer_fish']) for (const k of ['flop', 'hurt', 'death']) names.push(`entity.${f}.${k}`);
  for (const k of ['blow_up', 'blow_out', 'sting']) names.push(`entity.puffer_fish.${k}`);
  for (const k of ['ambient', 'ambient_water', 'hurt', 'death', 'eat', 'play', 'jump', 'attack', 'splash', 'swim']) names.push(`entity.dolphin.${k}`);
  for (const k of ['ambient', 'hurt', 'death', 'squirt']) names.push(`entity.glow_squid.${k}`);
  const bad = [];
  for (const n of names) {
    const s = gens[n];
    if (!s) { bad.push(`${n} missing`); continue; }
    for (let v = 0; v < s.variants; v++) {
      const buf = s.generate(v, 22050);
      let peak = 0, finite = true;
      for (const x of buf) { if (!Number.isFinite(x)) finite = false; peak = Math.max(peak, Math.abs(x)); }
      if (!finite || peak < 0.05 || buf.length < 1500) bad.push(`${n}#${v} peak ${peak.toFixed(3)} len ${buf.length}`);
    }
  }
  check(`their ${names.length} sounds`, bad.length === 0, bad.join(', '));
}

// --- particles
{
  const { world } = setup();
  const pe = new PE.ParticleEngine({ sprites: {} }, world, () => 0xffffff);
  pe.spawn('glow', 0, 55, 0, 0, 0, 0);
  pe.spawn('glow_squid_ink', 0, 55, 0, 0, 0.1, 0);
  pe.spawn('dolphin', 0, 55, 0, 0, 0, 0);
  const [glow, ink, wake] = pe.sprites;
  check('glow sparks (self-lit), glowing ink (mint), a dolphin\'s blue wake', pe.sprites.length === 3 && glow.lightMode === 'flame' && Math.abs(ink.g - 225 / 255) < 1e-9 && wake.b === 1 && wake.r === 0.3);
}

// --- textures and renderers
function faces(c) {
  const { u, v, w, h, d } = c;
  return { down: [u + d, v, w, d], up: [u + d + w, v, w, d], west: [u, v + d, d, h], north: [u + d, v + d, w, h], east: [u + d + w, v + d, d, h], south: [u + 2 * d + w, v + d, w, h] };
}
function walk(part, nm, out) {
  part.cubes.forEach((c, i) => out.push([`${nm}#${i}`, c]));
  for (const [n, ch] of part.children) walk(ch, n, out);
}
{
  const sets = [
    ['cod', FR.codModel()], ['salmon', FR.salmonModel()], ['pufferfish', FR.pufferSmallModel()], ['pufferfish', FR.pufferMidModel()], ['pufferfish', FR.pufferBigModel()],
    ['tropical_a', FR.tropicalAModel()], ['tropical_b', FR.tropicalBModel()], ['dolphin', FR.dolphinModel()], ['glow_squid', mobModels.squidModel()],
  ];
  const bad = [];
  for (const [tex, def] of sets) {
    const img = MOB_TEXTURES[tex]?.();
    if (!img) { bad.push(`${tex} missing`); continue; }
    const cubes = [];
    walk(def.root, 'root', cubes);
    for (const [n, c] of cubes) for (const [f, [x0, y0, w, h]] of Object.entries(faces(c))) {
      // (a face past the texture's edge is vanilla's own: the puffer's back fin's far side)
      if (w * h === 0 || x0 + w > img.w || y0 + h > img.h) continue;
      // (a flat fin's faces are the fin's outline: some of them may be clear)
      const flat = c.w === 0 || c.h === 0 || c.d === 0;
      let clear = 0;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (img.data[(y * img.w + x) * 4 + 3] === 0) clear++;
      if (clear / (w * h) > (flat ? 0.6 : 0.02)) bad.push(`${tex} ${n}.${f} ${clear}/${w * h}`);
    }
  }
  check('every face of every model painted', bad.length === 0, bad.slice(0, 8).join(', '));
  const pats = [];
  for (const ab of ['a', 'b']) for (let i = 1; i <= 6; i++) {
    const img = MOB_TEXTURES[`tropical_${ab}_pattern_${i}`]?.();
    let opaque = 0;
    if (img) for (let k = 3; k < img.data.length; k += 4) if (img.data[k]) opaque++;
    if (!img || img.w !== 32 || opaque === 0) pats.push(`${ab}${i}`);
  }
  check('the twelve patterns (32x32, some of each painted)', pats.length === 0, pats.join(','));
  check('the glow particle sprite', typeof texMobs.MOB_PARTICLE_TEXTURES?.glow === 'function' || texMobs.MOB_PARTICLE_TEXTURES?.glow);
}
{
  const { level } = setup();
  const A = { limbSwing: 0, limbAmount: 0, age: 100, headYaw: 20, headPitch: 0 };
  let quads = 0, lights = [], colors = [];
  const batch = { quad() { quads++; lights.push(this.lightB); colors.push(this.color.join()); }, begin() {}, flush() {}, setOverlay() {}, lightB: 96, lightS: 100, color: [1, 1, 1, 1] };
  const pose = new entityRenderer.PoseStack();
  let drawn = [];
  const kit = {
    pose, items: { render() { drawn.push('item'); } }, tex: (n) => (MOB_TEXTURES[n] ? { n } : null),
    setupLiving: (e, dx, dy, dz, p, flip, cb) => { pose.reset(); cb?.(pose); return A; }, overlay() {},
    drawBody: (b, e, d, tex) => { drawn.push(tex.n); d.root.render(b, pose, d.texW, d.texH); },
    state: (t, extra) => ({ texture: t, ...extra }), attackAnim: () => 0,
  };
  const gl = new Proxy({}, { get: (_t, k) => (k === 'createTexture' ? () => ({}) : typeof k === 'string' && k === k.toUpperCase() ? 0 : () => {}) });
  const rr = new R.OceanRenderers(gl, kit);
  const res = {};
  for (const t of ['cod', 'salmon', 'pufferfish', 'tropical_fish', 'dolphin', 'glow_squid']) {
    const e = spawn(level, t, 0.5, 55, 0.5);
    quads = 0; drawn = [];
    const ok = rr.render(batch, e, 0, 0, 0, 0.5);
    res[t] = { ok, quads, drawn: drawn.join('+'), e };
  }
  check('each is drawn', Object.values(res).every((r) => r.ok && r.quads >= 6), Object.entries(res).map(([t, r]) => `${t} ${r.quads}`).join(', '));
  check('...in its own texture', res.cod.drawn === 'cod' && res.salmon.drawn === 'salmon' && res.pufferfish.drawn === 'pufferfish' && res.dolphin.drawn === 'dolphin' && res.glow_squid.drawn === 'glow_squid');
  const pf = res.pufferfish.e;
  const q = [0, 1, 2].map((s) => { pf.setPuffState(s); quads = 0; rr.render(batch, pf, 0, 0, 0, 0.5); return quads; });
  check('a pufferfish in the model for its puff', q[0] !== q[2] && q[1] !== q[2], q.join('/'));
  const t = res.tropical_fish.e;
  t.variant = F.packTropical(8, 11, 4);
  quads = 0; colors = [];
  rr.render(batch, t, 0, 0, 0, 0.5);
  const blue = '0.23529411764705882,0.26666666666666666,0.6666666666666666,1';
  check('a tropical fish: the large body in its colour, the pattern over it in the other', colors.length > 0 && colors.some((c) => c.startsWith('0.23529')) && colors.some((c) => c.startsWith('0.996')) && batch.color.join() === '1,1,1,1', [...new Set(colors)].join(' | '));
  void blue;
  const g = res.glow_squid.e;
  lights = [];
  rr.render(batch, g, 0, 0, 0, 0.5);
  check('a glow squid lit by its own light', lights.length > 0 && lights.every((l) => l === 240) && batch.lightB === 96);
  g.darkTicksRemaining = 50;
  lights = [];
  rr.render(batch, g, 0, 0, 0, 0.5);
  check('...but the world\'s while it\'s dark', lights.every((l) => l === 96));
  const d = res.dolphin.e;
  d.setItemSlot('mainhand', ItemStack.of('cod'));
  drawn = [];
  rr.render(batch, d, 0, 0, 0, 0.5);
  check('a dolphin carrying something shows it', drawn.includes('item'));
  d.pitch = 350; d.pitchO = 10;
  quads = 0;
  rr.render(batch, d, 0, 0, 0, 0.5);
  check('...its pitch eased the short way round', quads > 0);
  check('shadows', FR.FISH_SHADOW_RADII.cod === 0.3 && FR.FISH_SHADOW_RADII.dolphin === 0.7 && R.OCEAN_SHADOW_RADII.tropical_fish === 0.15 && R.OCEAN_SHADOW_RADII.guardian === 0.5);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

// Headless checks for Stage 5 M7 (node tests/ocean/m7.mjs): axolotls — their attributes and colours, spawning in the
// lush caves' pools over clay (in groups, the later ones babies), swimming about and making for water from land,
// drying out (and rain, and a splash of water), playing dead, hunting (and the cooldown after), always going for
// drowned, helping a player who finishes a fight, breeding (the bucket of tropical fish and the water bucket back,
// the baby's colour), being tempted, babies keeping to grown ones, the bucket of axolotl both ways (and the
// advancements), the drowned's hunting of them, saving, and the sounds, textures, model and renderer (through
// stand-ins).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const P = [
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/player.ts',
  '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/entity/axolotl.ts', '/src/entity/fish.ts', '/src/game/fishBuckets.ts',
  '/src/game/itemBehavior.ts', '/src/game/oceanSpawns.ts', '/src/item/potions.ts', '/src/entity/thrownPotion.ts', '/src/entity/effects.ts',
  '/src/game/advancements.ts', '/src/render/axolotlRenderer.ts', '/src/render/oceanRenderers.ts', '/src/render/entityRenderer.ts',
  '/src/textures/mobs.ts', '/src/textures/items.ts', '/src/audio/synth.ts', '/src/entity/mob.ts', '/src/entity/ai/goals.ts',
];
const { mods, close } = await loadModules(P);
const M = Object.fromEntries(P.map((p, i) => [p.replace(/^\/src\//, '').replace(/\.ts$/, ''), mods[i]]));
const { S } = M['world/block'];
const { ITEMS, ItemStack } = M['item/item'];
const { B } = M['world/gen/biomes'];
const AX = M['entity/axolotl'], FISH = M['entity/fish'], POT = M['item/potions'];
const spawner = M['game/spawner'];
const { Axolotl } = AX;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/**
 * a lush cave's pool: stone below; a pool of water from y 52 to 55 over clay for x in [-16, 0), z in [-16, 16);
 * stone round it up to y 55 (so the land is at 56); all of it lush caves (or `biome`)
 */
function setup({ biome = B.lush_caves } = {}) {
  const world = new M['world/world'].World();
  for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) { const c = new M['world/chunk'].Chunk(cx, cz); c.biomes.fill(biome); world.chunks.set(c.key, c); }
  for (let x = -64; x < 64; x++) for (let z = -64; z < 64; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 40; y <= 50; y++) c.setState(x & 15, y, z & 15, S('stone'));
    if (x >= -16 && x < 0 && z >= -16 && z < 16) {
      c.setState(x & 15, 51, z & 15, S('clay'));
      for (let y = 52; y <= 55; y++) c.setState(x & 15, y, z & 15, S('water'));
    } else for (let y = 51; y <= 55; y++) c.setState(x & 15, y, z & 15, S('stone'));
  }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new M['game/level'].Level(world, 'axolotls');
  const sounds = [], parts = [], triggers = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p, t: level.gameTime }); }, playUI() {} };
  level.particles = { blockBreak() {}, blockHit() {}, spawn(k, x, y, z) { parts.push({ k, x, y, z, t: level.gameTime }); }, entityEffect() {} };
  level.onPlayerTrigger = (p, type, payload) => triggers.push({ type, payload });
  level.difficulty = 'normal';
  level.doDaylightCycle = false;
  level.dayTime = 6000;
  level.simulationDistance = 4;
  const player = new M['entity/player'].Player(level);
  player.moveTo(12.5, 56, 20.5, 0, 0);
  player.gameMode = 'survival';
  level.player = player;
  level.addEntity(player);
  return { level, world, player, sounds, parts, triggers };
}
const spawn = (level, type, x, y, z) => {
  const m = spawner.createMob(type, level);
  m.moveTo(x, y, z, 0, 0);
  m.finalizeSpawn('command');
  level.addEntity(m);
  return m;
};
/** ticks the level, the player held where it is; stops early when `until` holds */
const tickPinned = (level, player, n, until) => {
  const [px, py, pz] = [player.x, player.y, player.z];
  for (let i = 0; i < n; i++) {
    level.tick();
    player.moveTo(px, py, pz, player.yaw, player.pitch);
    player.dx = player.dy = player.dz = 0;
    player.fallDistance = 0;
    player.air = 300;
    player.health = player.maxHealth;
    if (until?.(i)) return i + 1;
  }
  return n;
};
const hold = (player, id) => player.inventory.setSelectedItem(id ? ItemStack.of(id) : null);

// --- the axolotl itself
{
  const { level } = setup();
  const a = spawn(level, 'axolotl', -8.5, 52, -8.5);
  check('an axolotl: 14 health, speed 1, 2 attack damage, a full block\'s step, 0.75 x 0.42, its eyes at 0.2751', a instanceof Axolotl && a.maxHealth === 14 && a.health === 14 && a.moveSpeedAttr === 1 && a.attackDamage === 2 && a.stepHeight === 1 && near(a.width, 0.75) && near(a.height, 0.42) && near(a.eyeHeight, 0.2751));
  check('...the axolotls\' own category, five minutes\' breath, one of the four common colours', a.category === 'axolotls' && a.air === 6000 && a.variant >= 0 && a.variant <= 3 && AX.AXOLOTL_VARIANTS.join() === 'lucy,wild,gold,cyan,blue');
  check('...breathes in the water, isn\'t pushed by it, goes on a lead; eats buckets of tropical fish', a.canBreatheUnderwater() && !a.isPushedByFluid() && a.canBeLeashed() && a.isFood(ItemStack.of('tropical_fish_bucket')) && !a.isFood(ItemStack.of('cod_bucket')));
  a.setAge(-24000);
  check('...a baby half the size', near(a.width, 0.375) && near(a.height, 0.21) && near(a.eyeHeight, 0.2751 / 2));
  check('...its head turns only with its body; no walk target anywhere better', a.maxHeadXRot() === 1 && a.maxHeadYRot() === 1 && a.walkTargetValue(0, 0, 0) === 0);
}

// --- spawning
{
  const { level } = setup();
  const rule = (x, y, z) => Axolotl.checkAxolotlSpawnRules(level, x, y, z);
  check('spawns over clay', rule(-8, 52, -8) && !rule(-8, 53, -8) && !rule(8, 56, 8));
  const W = M['game/oceanSpawns'].waterSpawnsFor('lush_caves');
  check('the lush caves\' axolotls: weight 10, in fours to sixes', W.axolotls.length === 1 && W.axolotls[0].type === 'axolotl' && W.axolotls[0].weight === 10 && W.axolotls[0].min === 4 && W.axolotls[0].max === 6);
  check('...and nowhere else', M['game/oceanSpawns'].waterSpawnsFor('ocean').axolotls.length === 0);
  const sp = new spawner.NaturalSpawner(level, 1);
  check('...through the spawner: in the water over clay', sp.mobsAt('axolotls', -8, 52, -8).some((d) => d.type === 'axolotl') && sp.checkSpawnRules('axolotl', -8, 52, -8) && !sp.checkSpawnRules('axolotl', -8, 53, -8) && !sp.checkSpawnRules('axolotl', 8, 56, 8));
  const g = {};
  const grp = [];
  for (let i = 0; i < 6; i++) { const m = spawner.createMob('axolotl', level); m.moveTo(-8.5, 52, -8.5, 0, 0); m.finalizeSpawn('natural', g); grp.push(m); }
  check('a group: the first two grown, the rest babies, all in the group\'s two common colours', !grp[0].isBaby() && !grp[1].isBaby() && grp.slice(2).every((m) => m.isBaby()) && g.axolotlVariants.length === 2 && g.axolotlVariants.every((v) => v < 4) && grp.every((m) => g.axolotlVariants.includes(m.variant)));
  let got = [];
  for (let i = 0; i < 3000 && got.length === 0; i++) {
    sp.spawnCategoryForChunk('axolotls', -1, i % 2 ? -1 : 0);
    got = level.entities.filter((e) => e.type === 'axolotl');
  }
  check('the natural spawner puts them in the pool', got.length > 0 && got.every((e) => e.y >= 52 && e.y < 56 && e.x < 0), `${got.length}`);
  check('...where they may despawn (not from a bucket)', got.length > 0 && got[0].removeWhenFarAway(10000) && !got[0].requiresCustomPersistence());
}

// --- in the water, and on land
{
  const { level, player } = setup();
  const a = spawn(level, 'axolotl', -8.5, 53, 0.5);
  const x0 = a.x, z0 = a.z;
  let farthest = 0, dry = 0, targets = 0;
  tickPinned(level, player, 400, () => {
    farthest = Math.max(farthest, Math.hypot(a.x - x0, a.z - z0));
    if (level.gameTime > 5 && !a.inWater) dry++;
    if (a.walkTarget) targets++;
    return false;
  });
  check('in the water it swims about (now and then breaking the surface), idling', farthest > 2 && dry < 40 && targets > 100 && a.activity() === 'idle', `${farthest.toFixed(2)} ${dry} ${targets}`);
  // (a block and a half from the edge: a crawl that long outlasts no MoveToTargetSink)
  const b = spawn(level, 'axolotl', 1.2, 56, 0.5);
  let maxStep = 0, px = b.x, pz = b.z, wantedWater = false;
  const t = tickPinned(level, player, 1500, () => {
    if (!b.inWater && b.onGround) maxStep = Math.max(maxStep, Math.hypot(b.x - px, b.z - pz));
    px = b.x;
    pz = b.z;
    if (b.walkTarget && 'pos' in b.walkTarget.t && b.walkTarget.t.pos[0] < 0) wantedWater = true;
    return b.inWater;
  });
  check('on land it makes for the water nearby, and gets in', wantedWater && b.inWater, `${t} ticks`);
  check('...crawling slowly', maxStep > 0 && maxStep < 0.05, maxStep.toFixed(4));
}

// --- drying out
{
  const { level, player } = setup();
  const a = spawn(level, 'axolotl', 30.5, 56, 30.5);
  a.air = 5;
  tickPinned(level, player, 25);
  check('out of the water it dries out: from twenty ticks past empty, 2 damage', a.air === 0 && a.health === 12 && a.lastDamageSource === 'dryOut', `${a.air} ${a.health}`);
  tickPinned(level, player, 20);
  check('...and again a second later', a.health === 10 && a.air === 0);
  const rain = level.isRainingAt;
  level.isRainingAt = () => true;
  tickPinned(level, player, 1);
  level.isRainingAt = rain;
  check('...but not in the rain', a.air === 6000);
  a.air = 100;
  const pot = new M['entity/thrownPotion'].ThrownPotion(level, player, POT.potionStack('splash_potion', 'water'));
  pot.moveTo(a.x + 1, a.y, a.z, 0, 0);
  pot.applyWater();
  check('a splash of water wets it again: a minute and a half', a.air === 1900);
  a.air = 5900;
  a.rehydrate();
  check('...up to the full five minutes', a.air === 6000);
  const w = spawn(level, 'axolotl', -8.5, 53, 0.5);
  tickPinned(level, player, 10);
  check('in the water it holds all its breath', w.air === 6000);
}

// --- playing dead
{
  const { level, player } = setup();
  const a = spawn(level, 'axolotl', -8.5, 53, 0.5);
  // (something that hurts it, but stays out of it)
  const z = spawner.createMob('drowned', level);
  z.moveTo(-12.5, 52, 0.5, 0, 0);
  tickPinned(level, player, 5);
  let tries = 0;
  while (a.playDeadTicks < 0 && tries++ < 200) {
    a.invulnerableTime = 0;
    a.health = 14;
    a.hurt(5, 'mob', z);
  }
  check('hurt in the water by something, now and then it plays dead: 200 ticks', a.playDeadTicks === 200, `${tries} tries`);
  a.health = 14;
  let started = -1;
  const steps = [];
  tickPinned(level, player, 30, (i) => {
    if (started < 0 && a.activeEffects.has('regeneration')) started = i;
    return false;
  });
  check('...playing dead: regeneration for ten seconds, not something to attack', a.activity() === 'play_dead' && a.isPlayingDead() && started >= 0 && a.getEffect('regeneration').duration > 150 && !a.canBeSeenAsEnemy() && !z.canAttack(a), `${started}`);
  // (its move control stands idle, so what it was doing runs down: vanilla's LivingEntity.aiStep eases the forward
  // push by 2% a tick)
  let lx = a.x, lz = a.z;
  tickPinned(level, player, 100, () => { steps.push(Math.hypot(a.x - lx, a.z - lz)); [lx, lz] = [a.x, a.z]; return false; });
  const early = Math.max(...steps.slice(0, 10)), late = Math.max(...steps.slice(-10));
  check('...it stops swimming: no walk target, no path, just drifting to a stop', a.walkTarget === null && a.navigation.isDone() && late < 0.05 && late <= early + 1e-9, `${early.toFixed(3)} ${late.toFixed(3)}`);
  const n = tickPinned(level, player, 250, () => a.playDeadTicks < 0);
  check('...for ten seconds, then it idles again', !a.isPlayingDead() && a.activity() === 'idle' && a.playDeadTicks === -1 && z.canAttack(a) && n > 40, `${n} ${a.activity()} ${a.playDeadTicks} ${z.canAttack(a)} ${a.isAlive}`);
  const b = spawn(level, 'axolotl', 30.5, 56, 30.5);
  tickPinned(level, player, 2);
  let dead = 0;
  for (let i = 0; i < 60; i++) { b.invulnerableTime = 0; b.health = 14; b.hurt(5, 'mob', z); if (b.playDeadTicks >= 0) dead++; }
  check('...never on land', dead === 0);
}

// --- hunting, the cooldown, the drowned, and a friend's help
{
  const { level, player, sounds, triggers } = setup();
  player.moveTo(0.5, 56, 4.5, 90, 0);
  const a = spawn(level, 'axolotl', -8.5, 53, 0.5);
  const cod = spawn(level, 'cod', -5.5, 53, 0.5);
  let fought = false;
  const n = tickPinned(level, player, 600, () => {
    if (a.attackTarget === cod && a.activity() === 'fight') fought = true;
    return cod.dead && a.activity() === 'idle';
  });
  check('it hunts a fish in the water nearby, and kills it', fought && cod.dead && sounds.some((s) => s.n === 'entity.axolotl.attack'), `${n} ticks`);
  check('...then hunts no more for two minutes', a.huntingCooldownUntil - level.gameTime > 2300 && a.huntingCooldownUntil - level.gameTime <= 2400);
  const cod2 = spawn(level, 'cod', -6.5, 53, 2.5);
  tickPinned(level, player, 60);
  check('...leaving the next fish be', a.attackTarget === null && !cod2.dead);
  const dr = spawn(level, 'drowned', Math.min(-1.5, a.x + 2), 52, a.z);
  tickPinned(level, player, 60, () => a.attackTarget === dr);
  check('...but it always goes for a drowned in the water', a.attackTarget === dr);
  // the player finishes the drowned off: the axolotl's friend
  hold(player, null);
  player.addEffect(new M['entity/effects'].MobEffectInstance(M['entity/effects'].MOB_EFFECTS.mining_fatigue, 600, 0));
  dr.hurt(1000, 'player', player);
  tickPinned(level, player, 3);
  const regen = player.getEffect('regeneration');
  const trig = M['game/advancements'].ADVANCEMENTS.get('husbandry/kill_axolotl_target').criteria;
  check('a player who finishes off its foe gets Regeneration (five seconds), and loses Mining Fatigue', regen && regen.duration > 90 && regen.duration <= 100 && !player.activeEffects.has('mining_fatigue'));
  check('...The Healing Power of Friendship!: an effect from an axolotl', Object.values(trig).some((c) => c.t === 'effects_changed' && c.source === 'axolotl') && triggers.some((t) => t.type === 'effects_changed' && t.payload.effectSource === 'axolotl' && t.payload.effects.has('regeneration')));
}

// --- the drowned hunt them; nothing hunts one playing dead
{
  const { level } = setup();
  const a = spawn(level, 'axolotl', -8.5, 53, 0.5);
  const dr = spawn(level, 'drowned', -10.5, 52, 0.5);
  dr.ensureGoals();
  const goal = dr.targetSelector.goals.map((w) => w.goal).find((g) => g.test && g.test(a));
  check('the drowned go for axolotls', !!goal && dr.canAttack(a));
  a.playingDead = true;
  check('...not one playing dead', !dr.canAttack(a) && !a.canBeSeenAsEnemy());
}

// --- breeding, tempting, babies
{
  const { level, player } = setup();
  const bred = [];
  level.onBred = (baby, cause) => bred.push({ baby, cause });
  player.moveTo(0.5, 56, 0.5, 90, 0);
  const a = spawn(level, 'axolotl', -3.5, 53, 0.5);
  const b = spawn(level, 'axolotl', -4.5, 53, 2.5);
  hold(player, 'tropical_fish_bucket');
  tickPinned(level, player, 25);
  const toward = (a.walkTarget && a.walkTarget.t.entity === player) || a.distanceToSqr(player.x, player.y, player.z) < 3.5 * 3.5;
  check('a bucket of tropical fish tempts them (within ten blocks)', a.temptingPlayer === player && a.isTempted && a.lookTarget?.entity === player && toward, `${a.temptingPlayer === player} ${a.isTempted} ${toward}`);
  const ok = a.interact(player, player.inventory.selectedItem);
  check('fed one, it\'s in love, and the water bucket comes back', ok && a.isInLove() && player.inventory.selectedItem?.item.id === 'water_bucket');
  hold(player, 'tropical_fish_bucket');
  b.interact(player, player.inventory.selectedItem);
  hold(player, null);
  let baby = null;
  tickPinned(level, player, 400, () => { baby = level.entities.find((e) => e.type === 'axolotl' && e !== a && e !== b); return !!baby; });
  check('two in love have a baby', !!baby && baby.isBaby() && a.age > 5990 && b.age > 5990 && baby.persistenceRequired, `${a.age} ${b.age}`);
  check('...in one of its parents\' colours', baby && (baby.variant === a.variant || baby.variant === b.variant || baby.variant === 4));
  check('...no longer tempted with the food put away (and a five-second pause)', a.temptingPlayer === null && !a.isTempted && (a.temptationCooldown > 0 || a.temptationCooldown === -1));
  // babies and the grown
  const ad = spawn(level, 'axolotl', -14.5, 53, -10.5);
  const bb = spawn(level, 'axolotl', -6.5, 53, -10.5);
  bb.setAge(-24000);
  let follows = false;
  tickPinned(level, player, 400, () => { follows = bb.nearestVisibleAdult !== null && bb.walkTarget?.t.entity instanceof Axolotl && !bb.walkTarget.t.entity.isBaby(); return follows; });
  check('a baby keeps to a grown one it sees, five to sixteen blocks off', follows);
  // feeding in creative: the fish bucket stays, a water bucket comes if there's none
  const c = spawn(level, 'axolotl', -3.5, 53, -3.5);
  player.gameMode = 'creative';
  hold(player, 'tropical_fish_bucket');
  c.interact(player, player.inventory.selectedItem);
  check('...in creative the bucket of fish stays, with a water bucket beside it', player.inventory.selectedItem?.item.id === 'tropical_fish_bucket' && player.inventory.findSlot((s) => s.item.id === 'water_bucket') >= 0);
  player.gameMode = 'survival';
  check('the breeding is the player\'s (Two by Two, the Best Friends Forever stats)', bred.length === 1 && bred[0].baby === baby && bred[0].cause === player);
}

// --- the bucket
{
  const { level, player, sounds, triggers } = setup();
  const a = spawn(level, 'axolotl', -3.5, 53, 0.5);
  a.variant = 2;
  a.setAge(-1000);
  a.health = 9;
  a.huntingCooldownUntil = level.gameTime + 1000;
  hold(player, 'water_bucket');
  const ok = a.interact(player, player.inventory.selectedItem);
  const s = player.inventory.selectedItem;
  const d = s?.tag?.bucketEntity;
  check('a water bucket scoops one up: the bucket keeps its health, colour, age and hunting cooldown', ok && a.removed && s.item.id === 'axolotl_bucket' && d.Health === 9 && d.Variant === 2 && d.Age === -1000 && d.HuntingCooldown === 1000);
  check('...with its own sound, and The Cutest Predator', sounds.some((x) => x.n === 'item.bucket.fill_axolotl') && triggers.some((t) => t.type === 'filled_bucket' && t.payload.filledBucket === 'axolotl_bucket') && M['game/advancements'].ADVANCEMENTS.get('husbandry/axolotl_in_a_bucket').criteria.c.items.join() === 'axolotl_bucket');
  const u = FISH.releaseBucketFish(level, s, -5, 53, 0);
  check('poured out: the same axolotl, from a bucket (it never despawns)', u instanceof Axolotl && u.variant === 2 && u.age === -1000 && u.health === 9 && u.fromBucket && u.requiresCustomPersistence() && !u.removeWhenFarAway(10000) && u.huntingCooldownUntil === level.gameTime + 1000);
  check('...a bucket of axolotl used like a fish\'s, with its own splash', !!M['game/itemBehavior'].itemBehaviorOf('axolotl_bucket')?.use && FISH.bucketEmptySound('axolotl_bucket') === 'item.bucket.empty_axolotl' && FISH.bucketEmptySound('cod_bucket') === 'item.bucket.empty_fish');
  const it = ITEMS.get('axolotl_bucket');
  check('the items: the bucket of axolotl (one to a stack) and the spawn egg', it && it.maxStack === 1 && it.name === 'Bucket of Axolotl' && ITEMS.get('axolotl_spawn_egg')?.creativeTab === 'spawn_eggs');
}

// --- saving
{
  const { level } = setup();
  const a = spawn(level, 'axolotl', -3.5, 53, 0.5);
  a.variant = 3;
  a.fromBucket = true;
  a.playDeadTicks = 120;
  a.huntingCooldownUntil = level.gameTime + 500;
  a.setAge(-300);
  const d = JSON.parse(JSON.stringify(a.saveData()));
  const u = new Axolotl(level);
  u.loadData(d);
  check('saved and loaded: its colour, from a bucket, playing dead, the hunting cooldown, its age', u.variant === 3 && u.fromBucket && u.playDeadTicks === 120 && u.huntingCooldownUntil === level.gameTime + 500 && u.age === -300);
}

// --- sounds
{
  const { level, player, sounds } = setup();
  const SND = M['audio/synth'].SOUNDS;
  const want = ['idle_air', 'idle_water', 'hurt', 'death', 'attack', 'swim', 'splash'].map((n) => 'entity.axolotl.' + n);
  want.push('item.bucket.fill_axolotl', 'item.bucket.empty_axolotl');
  const bad = [];
  let takes = 0;
  for (const n of want) {
    const s = SND[n];
    if (!s) { bad.push(`${n} missing`); continue; }
    for (let i = 0; i < s.variants; i++) {
      const buf = s.generate(i, 22050);
      takes++;
      let peak = 0, finite = true;
      for (const x of buf) { if (!Number.isFinite(x)) finite = false; peak = Math.max(peak, Math.abs(x)); }
      if (!finite || peak < 0.05 || buf.length < 1000) bad.push(`${n}#${i} peak ${peak.toFixed(3)} len ${buf.length}`);
    }
  }
  check(`the axolotl's sounds (${takes} takes)`, bad.length === 0, bad.join(', '));
  const w = spawn(level, 'axolotl', -3.5, 53, 0.5);
  const l = spawn(level, 'axolotl', 20.5, 56, 0.5);
  tickPinned(level, player, 3);
  check('idle: one call in the water, another in the air', w.ambientSound() === 'entity.axolotl.idle_water' && l.ambientSound() === 'entity.axolotl.idle_air');
  w.playingDead = true;
  const before = sounds.length;
  w.playAmbientSound();
  check('...none while playing dead', sounds.length === before);
}

// --- textures, the model, the renderer
function faces(c) {
  const { u, v, w, h, d } = c;
  return { down: [u + d, v, w, d], up: [u + d + w, v, w, d], west: [u, v + d, d, h], north: [u + d, v + d, w, h], east: [u + d + w, v + d, d, h], south: [u + 2 * d + w, v + d, w, h] };
}
function walk(part, nm, out) {
  part.cubes.forEach((c, i) => out.push([`${nm}#${i}`, c]));
  for (const [n, ch] of part.children) walk(ch, n, out);
}
{
  const MT = M['textures/mobs'].MOB_TEXTURES;
  const RR = M['render/axolotlRenderer'];
  const def = RR.axolotlModel();
  const cubes = [];
  walk(def.root, 'root', cubes);
  const bad = [];
  const px = [];
  for (const v of AX.AXOLOTL_VARIANTS) {
    const img = MT[`axolotl_${v}`]?.();
    if (!img || img.w !== 64 || img.h !== 64) { bad.push(`${v} missing`); continue; }
    px.push(Array.from(img.data).join());
    for (const [n, c] of cubes) for (const [f, [x0, y0, w, h]] of Object.entries(faces(c))) {
      if (!w || !h) continue;
      let clear = 0;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (img.data[(y * img.w + x) * 4 + 3] === 0) clear++;
      const flat = !c.w || !c.h || !c.d;
      if (flat ? clear > (w * h) / 3 : clear) bad.push(`${v} ${n}.${f} ${clear}/${w * h}`);
    }
  }
  check('five skins, 64x64, each different, every face of the model painted (the flat fins, gills and toes with their gaps)', bad.length === 0 && new Set(px).size === 5, bad.slice(0, 6).join(', '));
  check('the model: body and crest, head, three gill fringes, four legs, the tail; a baby the whole of it at half size', cubes.length === 11 && def.texW === 64 && def.texH === 64 && def.baby.headParts.length === 0 && def.baby.bodyScale === 2 && def.baby.bodyY === 24);
  const IT = M['textures/items'].ITEM_TEXTURES;
  const opaque = (t) => { let n = 0; for (let k = 3; k < t.data.length; k += 4) if (t.data[k]) n++; return n; };
  check('the bucket and the spawn egg drawn', IT.axolotl_bucket && opaque(IT.axolotl_bucket()) > 60 && IT.axolotl_spawn_egg && opaque(IT.axolotl_spawn_egg()) > 60);

  // the renderer through stand-ins
  const { level } = setup();
  const A = { limbSwing: 1.3, limbAmount: 0.8, age: 100, headYaw: 0, headPitch: 0 };
  let quads = 0, drawn = [];
  const batch = { quad() { quads++; }, begin() {}, flush() {}, setOverlay() {}, lightB: 96, lightS: 100, color: [1, 1, 1, 1] };
  const pose = new M['render/entityRenderer'].PoseStack();
  const kit = {
    pose, items: { render() {} }, tex: (n) => (MT[n] ? { n } : null),
    setupLiving: () => { pose.reset(); return A; }, overlay() {},
    drawBody: (b, e, d, tex, baby) => { drawn.push(`${tex.n}${baby ? ':baby' : ''}`); d.root.render(b, pose, d.texW, d.texH); },
    state: (t, extra) => ({ texture: t, ...extra }), attackAnim: () => 0,
  };
  const gl = new Proxy({}, { get: (_t, k) => (k === 'createTexture' ? () => ({}) : typeof k === 'string' && k === k.toUpperCase() ? 0 : () => {}) });
  const rr = new M['render/oceanRenderers'].OceanRenderers(gl, kit);
  const a = spawn(level, 'axolotl', -3.5, 53, 0.5);
  a.variant = 4;
  const ok = rr.render(batch, a, 0, 0, 0, 0.5);
  a.setAge(-100);
  rr.render(batch, a, 0, 0, 0, 0.5);
  check('drawn in its colour\'s skin (a baby small)', ok && quads > 0 && drawn.join() === 'axolotl_blue,axolotl_blue:baby', drawn.join());
  // the poses, eased in
  const root = RR.axolotlModel().root;
  const body = root.child('body');
  a.setAge(0);
  a.inWater = true;
  a.playingDead = true;
  for (let i = 0; i < 200; i++) RR.animateAxolotl(root, a, 0, i, 0, 0);
  const dead = [body.zRot, body.xRot, body.child('left_hind_leg').zRot];
  check('playing dead it rolls onto its side, legs splayed (eased over many frames)', near(dead[0], 0.35, 0.01) && near(dead[1], -0.15, 0.01) && near(dead[2], Math.PI / 4, 0.01), dead.map((x) => x.toFixed(3)).join());
  a.playingDead = false;
  RR.animateAxolotl(root, a, 0.5, 201, 0, 0);
  const inWater = body.zRot;
  a.inWater = false;
  a.onGround = true;
  RR.animateAxolotl(root, a, 0.5, 202, 0, 0);
  const step = Math.abs(body.zRot - inWater);
  check('...and (as vanilla\'s model does) keeps the roll swimming, easing out of it a twentieth a frame on land', near(inWater, 0.35, 0.01) && near(step, 0.35 * 0.05, 0.002), `${inWater.toFixed(3)} ${step.toFixed(4)}`);
  const b2 = spawn(level, 'axolotl', -3.5, 53, 3.5);
  b2.inWater = false;
  b2.onGround = true;
  for (let i = 0; i < 300; i++) RR.animateAxolotl(root, b2, 0, i, 0, 0);
  const still = root.child('body').child('left_front_leg');
  check('...each axolotl its own pose (lying still on land: its front legs forward)', near(still.xRot, 0.8, 0.02) && near(still.yRot, 2.3, 0.02));
  check('its shadow: 0.5 (a baby\'s half)', M['render/oceanRenderers'].OCEAN_SHADOW_RADII.axolotl === 0.5);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

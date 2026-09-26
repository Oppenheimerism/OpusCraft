// Headless checks for M9 (node tests/frog/frog.mjs): frogs and tadpoles — their attributes, the three kinds by biome,
// spawning in swamps and mangrove swamps, the tongue (a small slime a slime ball, a small magma cube a froglight of the
// frog's colour, nothing bigger, nothing out of reach), slime balls (tempting, breeding, spawn laid on the water by
// the shore), frogspawn (where it lasts, its hatching, falling blocks and pistons, no drops), tadpoles (growing up into
// the biome's frog, slime balls hurrying it, the bucket both ways, axolotls hunting them), the long jump, croaking,
// swimming to land, the fall, saving, placing lily pads and frogspawn on water, the advancements, and the sounds,
// textures, model and renderer (through stand-ins).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();
const P = [
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/player.ts',
  '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/entity/frog.ts', '/src/entity/tadpole.ts', '/src/game/frogspawn.ts',
  '/src/game/blockBehavior.ts', '/src/game/itemBehavior.ts', '/src/game/interaction.ts', '/src/game/redstone/piston.ts', '/src/game/advancements.ts',
  '/src/render/frogRenderer.ts', '/src/render/entityRenderer.ts', '/src/render/model.ts', '/src/textures/mobs.ts', '/src/textures/items.ts',
  '/src/textures/blocks.ts', '/src/audio/synth.ts', '/src/core/rng.ts', '/src/entity/fallingBlock.ts', '/src/entity/fish.ts',
];
const { mods, close } = await loadModules(P);
const M = Object.fromEntries(P.map((p, i) => [p.replace(/^\/src\//, '').replace(/\.ts$/, ''), mods[i]]));
const { S, BLOCKS, STATE_BLOCK, BLOCK_BY_NAME } = M['world/block'];
const { ITEMS, ITEM_LIST, ItemStack } = M['item/item'];
const { B } = M['world/gen/biomes'];
const F = M['entity/frog'], T = M['entity/tadpole'];
const { Frog } = F, { Tadpole } = T;
const spawner = M['game/spawner'];
const { behaviorOf } = M['game/blockBehavior'];
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const nameAt = (world, x, y, z) => BLOCKS[STATE_BLOCK[world.getState(x, y, z)]].name;

/** flat grass at y 63 on stone (they stand at 64), for x, z in [-48, 48); a pond (`pond`: [x0, z0, x1, z1]) two deep */
function setup({ biome = B.swamp, pond = null } = {}) {
  const world = new M['world/world'].World();
  for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) { const c = new M['world/chunk'].Chunk(cx, cz); c.biomes.fill(biome); world.chunks.set(c.key, c); }
  const st = S('stone'), top = S('grass_block'), water = S('water');
  for (let x = -48; x < 48; x++) for (let z = -48; z < 48; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 58; y < 63; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, top);
  }
  if (pond) {
    const [x0, z0, x1, z1] = pond;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = 62; y <= 63; y++) world.getChunk(x >> 4, z >> 4).setState(x & 15, y, z & 15, water);
  }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new M['game/level'].Level(world, 'frogs');
  const sounds = [], parts = [], triggers = [], bred = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p, t: level.gameTime }); }, playUI() {} };
  level.particles = { blockBreak() {}, blockHit() {}, spawn(k, x, y, z) { parts.push({ k, x, y, z, t: level.gameTime }); }, entityEffect() {} };
  level.onPlayerTrigger = (p, type, payload) => triggers.push({ type, payload });
  level.onBred = (child, cause) => bred.push({ child, cause });
  level.difficulty = 'normal';
  level.doDaylightCycle = false;
  level.dayTime = 6000;
  level.simulationDistance = 4;
  const player = new M['entity/player'].Player(level);
  player.moveTo(30.5, 64, 30.5, 0, 0);
  player.gameMode = 'creative';
  level.player = player;
  level.addEntity(player);
  return { level, world, player, sounds, parts, triggers, bred };
}
const put = (world, x, y, z, n) => world.getChunk(x >> 4, z >> 4).setState(x & 15, y, z & 15, S(n));
/** a frog (or `type`), its long jump far off unless `ready` */
const spawn = (level, x, y, z, { type = 'frog', ready = false, variant } = {}) => {
  const m = spawner.createMob(type, level);
  m.moveTo(x, y, z, 0, 0);
  m.finalizeSpawn('command');
  if (m instanceof Frog) {
    if (!ready) m.longJumpCooldown = 1e6;
    if (variant) m.variant = variant;
  }
  level.addEntity(m);
  return m;
};
/** ticks the level, the player held where it is; stops early when `until` holds */
const tickPinned = (level, player, n, until) => {
  const [x, y, z] = [player.x, player.y, player.z];
  for (let i = 0; i < n; i++) {
    level.tick();
    player.moveTo(x, y, z, player.yaw, player.pitch);
    player.dx = player.dy = player.dz = 0;
    player.fallDistance = 0;
    player.air = 300;
    player.health = player.maxHealth;
    if (until?.(i)) return i + 1;
  }
  return n;
};
const hold = (player, id, count = 1) => player.inventory.setSelectedItem(id ? ItemStack.of(id, count) : null);
const itemsOnGround = (level, id) => level.entities.filter((e) => e.type === 'item' && !e.removed && e.stack.item.id === id).reduce((n, e) => n + e.stack.count, 0);
const slime = (level, x, y, z, size = 1, type = 'slime') => {
  const s = spawner.createMob(type, level);
  s.moveTo(x, y, z, 0, 0);
  s.setSlimeSize(size, true);
  // (never despawning, the player being far off)
  s.persistenceRequired = true;
  level.addEntity(s);
  return s;
};

// --- the frog and the tadpole themselves
{
  const { level } = setup();
  const f = spawn(level, 0.5, 64, 0.5, { ready: true });
  check('a frog: 10 health, speed 1, 10 attack damage, 0.5 x 0.5, steps a block, a creature', f instanceof Frog && f.maxHealth === 10 && f.health === 10 && near(f.moveSpeedAttr, 1) && f.attackDamage === 10 && near(f.width, 0.5) && near(f.height, 0.5) && f.stepHeight === 1 && f.category === 'creature');
  check('...eats slime balls, breathes under water, isn\'t pushed by it, is never young; its falls 5 less', f.isFood(ItemStack.of('slime_ball')) && !f.isFood(ItemStack.of('wheat')) && f.canBreatheUnderwater() && !f.isPushedByFluid() && !f.isBaby() && f.fallDamageReduction() === 5);
  check('...a long jump 5 to 7 seconds off from its spawning', f.longJumpCooldown >= 100 && f.longJumpCooldown <= 140, `${f.longJumpCooldown}`);
  f.setAge(-24000);
  check('...never young, whatever its age', !f.isBaby());
  const t = spawner.createMob('tadpole', level);
  check('a tadpole: 6 health, 0.4 x 0.3, a creature that never despawns, no experience', t instanceof Tadpole && t.maxHealth === 6 && near(t.width, 0.4) && near(t.height, 0.3) && t.category === 'creature' && t.fromBucket === true && t.experienceReward() === 0);
  check('their names, both summonable', spawner.entityDisplayName('frog') === 'Frog' && spawner.entityDisplayName('tadpole') === 'Tadpole' && ['frog', 'tadpole'].every((n) => spawner.summonableTypes().includes(n)));
}

// --- the three kinds, by biome
{
  const want = [['swamp', 'temperate'], ['plains', 'temperate'], ['mangrove_swamp', 'warm'], ['desert', 'warm'], ['jungle', 'warm'], ['badlands', 'warm'], ['snowy_plains', 'cold'], ['frozen_peaks', 'cold']];
  const got = [];
  for (const [b, v] of want) {
    if (B[b] === undefined) { got.push(`${b}?`); continue; }
    const { level } = setup({ biome: B[b] });
    const f = spawn(level, 0.5, 64, 0.5);
    if (f.variant !== v) got.push(`${b}:${f.variant}`);
  }
  check('temperate in the swamp and the plains, warm in mangroves, deserts, jungles and badlands, cold in the snow and the peaks', got.length === 0, got.join());
  check('...the Nether warm, the End cold', F.frogVariantFor('nether_wastes') === 'warm' && F.frogVariantFor('the_end') === 'cold' && F.frogVariantFor('forest') === 'temperate');
}

// --- spawning
{
  const sw = spawner.biomeSettings(B.swamp), mg = spawner.biomeSettings(B.mangrove_swamp);
  const frogOf = (s) => s.creature.find((d) => d.type === 'frog');
  const slimeOf = (s) => s.monster.find((d) => d.type === 'slime' && d.weight === 1);
  check('swamps and mangrove swamps: frogs, weight 10, two to five, and one more slime (1, alone) among the monsters', [sw, mg].every((s) => frogOf(s)?.weight === 10 && frogOf(s).min === 2 && frogOf(s).max === 5 && slimeOf(s)?.min === 1 && slimeOf(s).max === 1));
  check('...the swamp its farm animals too, the mangroves none; the mangroves\' monsters as anywhere else\'s', sw.creature.some((d) => d.type === 'sheep') && !mg.creature.some((d) => ['sheep', 'pig', 'cow', 'chicken'].includes(d.type)) && mg.monster.some((d) => d.type === 'zombie'));
  check('...no frogs elsewhere', !spawner.biomeSettings(B.plains).creature.some((d) => d.type === 'frog') && !spawner.biomeSettings(B.forest).creature.some((d) => d.type === 'frog'));
  const { level, world } = setup();
  const rule = (x, y, z) => Frog.checkFrogSpawnRules(level, x, y, z);
  put(world, 2, 63, 0, 'sand');
  const mud = BLOCK_BY_NAME.has('mud');
  if (mud) put(world, 3, 63, 0, 'mud');
  check('it spawns on grass (and mud), not sand', rule(0, 64, 0) && (!mud || rule(3, 64, 0)) && !rule(2, 64, 0));
  const sp = new spawner.NaturalSpawner(level, 1);
  world.getChunk(1, 1).setLight(4, 64, 4, 0);
  check('...through the spawner, in the light only', sp.checkSpawnRules('frog', 0, 64, 0) && !sp.checkSpawnRules('frog', 2, 64, 0) && !rule(20, 64, 20));
}

// --- the tongue
{
  const eat = (variant, type) => {
    const { level, sounds } = setup();
    const f = spawn(level, 0.5, 64, 0.5, { variant });
    const s = slime(level, 4.5, 64, 0.5, 1, type);
    let tongueT = -1, poses = new Set();
    const n = tickPinned(level, level.player, 600, () => { poses.add(f.pose); if (tongueT < 0 && f.pose === 'using_tongue') tongueT = level.gameTime; return s.removed; });
    return { level, f, s, n, sounds, tongueT, poses };
  };
  const r = eat('temperate', 'slime');
  const tongue = r.sounds.find((x) => x.n === 'entity.frog.tongue'), gulp = r.sounds.find((x) => x.n === 'entity.frog.eat');
  check('a small slime nearby: the frog goes for it, shoots its tongue (and the sound) and eats it, gone at once', r.s.removed && !!tongue && !!gulp && tongue.v === 2 && gulp.v === 2 && gulp.t - tongue.t >= 6 && gulp.t - tongue.t <= 8 && r.poses.has('using_tongue'), `${r.n} ticks ${tongue?.t} ${gulp?.t}`);
  check('...exactly one slime ball of it (no more for looting), no magma cream', itemsOnGround(r.level, 'slime_ball') === 1 && itemsOnGround(r.level, 'magma_cream') === 0, `${itemsOnGround(r.level, 'slime_ball')}`);
  tickPinned(r.level, r.level.player, 20, () => r.f.pose !== 'using_tongue');
  check('...then it\'s done: its tongue in, no target', r.f.pose !== 'using_tongue' && r.f.attackTarget === null && r.f.tongueTarget === null && r.f.tongueAnimStart < 0, `${r.f.pose} ${r.f.attackTarget?.type} ${r.f.tongueTarget?.type} ${r.f.tongueAnimStart} ${r.f.activity()}`);
  const got = {};
  for (const v of ['temperate', 'warm', 'cold']) {
    const m = eat(v, 'magma_cube');
    got[v] = ['ochre_froglight', 'pearlescent_froglight', 'verdant_froglight', 'magma_cream'].filter((id) => itemsOnGround(m.level, id) > 0).join('+') + (m.s.removed ? '' : ' (not eaten)');
  }
  check('a small magma cube: an ochre froglight of a temperate frog, pearlescent of a warm one, verdant of a cold one (and no magma cream)', got.temperate === 'ochre_froglight' && got.warm === 'pearlescent_froglight' && got.cold === 'verdant_froglight', JSON.stringify(got));
  // a slime killed otherwise drops as it did
  {
    const { level } = setup();
    let balls = 0;
    for (let i = 0; i < 40; i++) {
      const s = slime(level, 10.5, 64, 10.5);
      s.hurt(100, 'generic', null);
      balls += itemsOnGround(level, 'slime_ball');
      for (const e of level.entities) if (e.type === 'item') e.remove();
      level.tick();
    }
    check('...a small slime killed some other way: none to two slime balls, as before', balls > 20 && balls < 60, `${balls}/40`);
  }
  // nothing bigger than the smallest
  {
    const { level } = setup();
    const f = spawn(level, 0.5, 64, 0.5);
    const big = slime(level, 4.5, 64, 0.5, 2);
    const bigM = slime(level, 0.5, 64, 4.5, 2, 'magma_cube');
    let targeted = false;
    tickPinned(level, level.player, 200, () => { targeted ||= f.attackTarget !== null || f.nearestAttackable !== null; return false; });
    check('a bigger slime or magma cube: never a target', !targeted && big.isAlive && bigM.isAlive && F.canEat(slime(level, 20.5, 64, 20.5)) && !F.canEat(big));
  }
  // out of reach
  {
    const { level, world } = setup();
    put(world, 0, 64, 0, 'stone');
    put(world, 0, 65, 0, 'stone');
    const f = spawn(level, -5.5, 64, 0.5);
    const s = slime(level, 0.5, 66, 0.5);
    let gaveUp = -1;
    tickPinned(level, level.player, 300, (i) => {
      s.moveTo(0.5, 66, 0.5, 0, 0);
      if (gaveUp < 0 && f.unreachableTongueTargets.includes(s.uuid)) gaveUp = i;
      return false;
    });
    check('a small slime up where it can\'t get within 1.75 of it: given up on (its tongue never out), and not eaten', gaveUp >= 0 && s.isAlive && !s.removed && f.tongueAnimStart < 0, `${gaveUp} ${s.isAlive} ${s.removed} ${f.tongueAnimStart} ${f.x.toFixed(2)},${f.y.toFixed(2)},${f.z.toFixed(2)} ${f.pose}`);
    const g = spawn(level, 10.5, 64, 10.5);
    for (let i = 0; i < 6; i++) g.addUnreachableTongueTarget({ uuid: `u${i}` });
    check('...five at most kept in mind (the oldest let go), all forgotten five seconds on', g.unreachableTongueTargets.join() === 'u1,u2,u3,u4,u5' && g.unreachableTtl === 100);
    g.unreachableTtl = 1;
    g.sense();
    g.sense();
    check('...', g.unreachableTongueTargets.length === 0);
  }
}

// --- slime balls: tempting, breeding, the spawn laid on the water
{
  const { level, world, player, sounds, bred, triggers } = setup({ pond: [5, -4, 9, 4] });
  // (a pen round them and the pond, two high, so that they don't wander off)
  for (let i = -7; i <= 12; i++) for (let y = 64; y <= 65; y++) {
    put(world, -7, y, Math.max(-7, Math.min(7, i)), 'stone');
    put(world, 12, y, Math.max(-7, Math.min(7, i)), 'stone');
    put(world, i, y, -7, 'stone');
    put(world, i, y, 7, 'stone');
  }
  player.gameMode = 'survival';
  player.moveTo(-5.5, 64, 0.5, -90, 0);
  const a = spawn(level, -1.5, 64, 0.5), b = spawn(level, 1.5, 64, 1.5);
  hold(player, 'slime_ball', 5);
  tickPinned(level, player, 60);
  check('a slime ball held out tempts it', a.temptingPlayer === player && a.isTempted, `${a.temptingPlayer?.type}`);
  const fed = a.interact(player, player.inventory.selectedItem) && b.interact(player, player.inventory.selectedItem);
  check('...fed one, in love (a slime ball used from the stack each)', fed && a.isInLove() && b.isInLove() && player.inventory.selectedItem?.count === 3);
  hold(player, null);
  const frogs0 = level.entities.filter((e) => e instanceof Frog).length;
  tickPinned(level, player, 600, () => a.isPregnant || b.isPregnant);
  const mum = a.isPregnant ? a : b, dad = mum === a ? b : a;
  check('the pair breed: no young, one of them carrying spawn, both resting five minutes; the breeding theirs (the player\'s)', mum.isPregnant && !dad.isPregnant && level.entities.filter((e) => e instanceof Frog).length === frogs0 && mum.age >= 5990 && dad.age >= 5990 && bred.length === 1 && bred[0].child.type === 'frog' && bred[0].cause === player, `${mum.isPregnant} ${dad.isPregnant} ${mum.age} ${dad.age} ${bred.length} ${a.isInLove()} ${b.isInLove()} ${a.breedTarget?.type}`);
  check('...off to lay it', mum.activity() === 'lay_spawn' || mum.isPregnant);
  let laid = null;
  tickPinned(level, player, 8000, () => {
    for (let x = 4; x <= 10 && !laid; x++) for (let z = -5; z <= 5 && !laid; z++) if (nameAt(world, x, 64, z) === 'frogspawn') laid = [x, 64, z];
    return !!laid;
  });
  const lay = sounds.find((s) => s.n === 'entity.frog.lay_spawn');
  check('...it lays it on still water by the shore, and has none left (with its sound)', !!laid && nameAt(world, laid[0], 63, laid[2]) === 'water' && !mum.isPregnant && !!lay, `${laid} ${mum.x.toFixed(1)},${mum.y.toFixed(1)},${mum.z.toFixed(1)} ${mum.inWater} ${mum.activity()} ${JSON.stringify(mum.walkTarget?.t)} ${mum.isPregnant}`);
  const want = M['game/advancements'].ADVANCEMENTS.get('husbandry/bred_all_animals');
  check('...a frog\'s pair counts for Two by Two', !!want && Object.values(want.criteria).some((c) => c.t === 'breed' && c.type === 'frog'));
  void triggers;
}

// --- frogspawn
{
  const { level, world, sounds } = setup({ pond: [5, -4, 9, 4] });
  const FS = BLOCK_BY_NAME.get('frogspawn');
  const { frogspawnCanSurvive } = M['game/frogspawn'];
  check('frogspawn lasts on still water only, with nothing liquid where it lies', frogspawnCanSurvive(world, 6, 64, 0) && !frogspawnCanSurvive(world, 0, 64, 0) && !frogspawnCanSurvive(world, 6, 63, 0));
  const t0 = level.gameTime;
  level.setBlock(6, 64, 0, S('frogspawn'));
  const tick = level.blockTicks.heap.find((t) => t.x === 6 && t.y === 64 && t.z === 0 && t.type === FS.id);
  check('...placed, it\'s to hatch three to ten minutes on', !!tick && tick.time - t0 >= 3600 && tick.time - t0 < 12000, `${tick && tick.time - t0}`);
  const counts = new Set();
  let inside = true, below = true, kept = true;
  for (let i = 0; i < 40; i++) {
    const x = 5 + (i % 5), z = -4 + Math.floor(i / 5) % 9;
    world.setState(x, 64, z, S('frogspawn'));
    const before = level.entities.filter((e) => e instanceof Tadpole).length;
    behaviorOf(world.getState(x, 64, z)).tick(level, x, 64, z, world.getState(x, 64, z));
    const born = level.entities.filter((e) => e instanceof Tadpole).slice(before);
    counts.add(born.length);
    for (const t of born) {
      if (t.x < x + 0.2 - 1e-9 || t.x > x + 0.8 + 1e-9 || t.z < z + 0.2 - 1e-9 || t.z > z + 0.8 + 1e-9) inside = false;
      if (!near(t.y, 63.5)) below = false;
      if (!t.persistenceRequired) kept = false;
    }
    if (nameAt(world, x, 64, z) !== 'air') kept = false;
    for (const e of born) e.remove();
    level.tick();
  }
  check('...hatching: gone, and two to five tadpoles in the water below, inside the block, never to despawn', [2, 3, 4, 5].every((n) => counts.has(n)) && [...counts].every((n) => n >= 2 && n <= 5) && inside && below && kept, [...counts].join());
  check('...with the squelch of it', sounds.some((s) => s.n === 'block.frogspawn.hatch'));
  // its water gone: it just breaks
  world.setState(6, 64, 2, S('frogspawn'));
  world.setState(6, 63, 2, S('stone'));
  const n0 = level.entities.filter((e) => e instanceof Tadpole).length;
  behaviorOf(world.getState(6, 64, 2)).tick(level, 6, 64, 2, world.getState(6, 64, 2));
  check('...without its water it breaks and nothing hatches', nameAt(world, 6, 64, 2) === 'air' && level.entities.filter((e) => e instanceof Tadpole).length === n0);
  // broken, no drops; the item placed natural
  world.setState(7, 64, 0, S('frogspawn'));
  level.destroyBlock(7, 64, 0, true);
  check('...broken, nothing drops', itemsOnGround(level, 'frogspawn') === 0);
  // a falling block
  world.setState(8, 64, 1, S('frogspawn'));
  const fb = M['entity/fallingBlock'].FallingBlockEntity.fall(level, 8, 70, 1, S('sand'));
  for (let i = 0; i < 60 && nameAt(world, 8, 64, 1) === 'frogspawn'; i++) level.tick();
  check('...a falling block breaks it (nothing dropped)', nameAt(world, 8, 64, 1) !== 'frogspawn' && itemsOnGround(level, 'frogspawn') === 0, `${nameAt(world, 8, 64, 1)} ${fb.removed}`);
  check('...a piston breaks it', M['game/redstone/piston'].pushReaction(S('frogspawn')) === 'destroy');
  // (its hatching found again with a random tick, if it was lost with an unloaded chunk)
  world.setState(9, 64, -2, S('frogspawn'));
  const had = level.hasScheduledTick(9, 64, -2, FS.id);
  behaviorOf(S('frogspawn')).randomTick(level, 9, 64, -2, S('frogspawn'));
  check('...one with no hatching due has it set again by a random tick', !had && level.hasScheduledTick(9, 64, -2, FS.id));
  const it = ITEMS.get('frogspawn');
  check('the item: drawn flat, with the natural blocks after the turtle egg', it?.texture === 'block:frogspawn' && it.creativeTab === 'natural' && ITEM_LIST.indexOf(it) === ITEM_LIST.findIndex((x) => x.id === 'turtle_egg') + 1);
  const lights = ['ochre_froglight', 'verdant_froglight', 'pearlescent_froglight'].map((n) => BLOCK_BY_NAME.get(n));
  check('the froglights: light 15, 0.3 hardness, any axis; with the functional blocks', lights.every((b) => b && b.s.light === 15 && b.s.hardness === 0.3 && b.propIndex('axis') >= 0) && ['ochre_froglight', 'verdant_froglight', 'pearlescent_froglight'].every((n) => ITEMS.get(n)?.creativeTab === 'functional'));
}

// --- tadpoles
{
  const { level, world, player, sounds, parts, triggers } = setup({ biome: B.snowy_plains, pond: [5, -4, 9, 4] });
  const t = spawn(level, 6.5, 62.2, 0.5, { type: 'tadpole' });
  t.setCustomName('Hoppy');
  t.age = T.TICKS_TO_BE_FROG - 1;
  level.tick();
  const f = level.entities.find((e) => e instanceof Frog && !e.removed);
  check('a tadpole twenty minutes old: a frog where it was, of its biome\'s kind, keeping its name, never to despawn', t.removed && !!f && f.variant === 'cold' && f.customName === 'Hoppy' && f.persistenceRequired && Math.abs(f.x - t.x) < 0.5 && sounds.some((s) => s.n === 'entity.tadpole.grow_up' && near(s.v, 0.15)));
  f?.remove();
  const u = spawn(level, 7.5, 62.2, 0.5, { type: 'tadpole' });
  player.gameMode = 'survival';
  player.moveTo(4.5, 64, 0.5, -90, 0);
  hold(player, 'slime_ball', 3);
  const ok = u.interact(player, player.inventory.selectedItem);
  check('a slime ball fed to one: a tenth of its time left off (two minutes, at first), one from the stack, a green sparkle', ok && u.age === 2400 && player.inventory.selectedItem?.count === 2 && parts.some((p) => p.k === 'happy_villager'), `${u.age}`);
  player.gameMode = 'creative';
  u.interact(player, player.inventory.selectedItem);
  check('...in creative, none used', player.inventory.selectedItem?.count === 2 && u.age === 2400 + Math.floor(((T.TICKS_TO_BE_FROG - 2400) / 20) * 0.1) * 20);
  tickPinned(level, player, 60);
  check('...one held out tempts it', u.temptingPlayer === player, `${u.temptingPlayer?.type}`);
  // the bucket
  player.gameMode = 'survival';
  hold(player, 'water_bucket');
  const age = u.age;
  const got = u.interact(player, player.inventory.selectedItem);
  const bucket = player.inventory.selectedItem;
  check('a water bucket scoops it up: a bucket of tadpole, its age in it (with its sound)', got && u.removed && bucket?.item.id === 'tadpole_bucket' && bucket.tag?.bucketEntity?.Age === age && sounds.some((s) => s.n === 'item.bucket.fill_tadpole'));
  const ADV = M['game/advancements'];
  const pa = new ADV.PlayerAdvancements();
  for (const x of triggers) pa.trigger(x.type, x.payload);
  check('...Bukkit Bukkit', pa.isDone(ADV.ADVANCEMENTS.get('husbandry/tadpole_in_a_bucket')));
  const before = level.entities.filter((e) => e instanceof Tadpole && !e.removed).length;
  player.moveTo(6.5, 64, 0.5, 0, 90);
  const used = M['game/itemBehavior'].itemBehaviorOf('tadpole_bucket')?.use(level, player, player.inventory.selectedItem);
  const out = level.entities.filter((e) => e instanceof Tadpole && !e.removed);
  check('...poured out, it swims off as old as it was (with its sound), an empty bucket left', used === 'success' && out.length === before + 1 && out.at(-1).age === age && player.inventory.selectedItem?.item.id === 'bucket' && sounds.some((s) => s.n === 'item.bucket.empty_tadpole'), `${used} ${out.at(-1)?.age}`);
  check('...a dispenser pours one out too, and the bucket\'s item is one to a stack, after the axolotl\'s', ITEMS.get('tadpole_bucket')?.maxStack === 1 && ITEM_LIST.indexOf(ITEMS.get('tadpole_bucket')) === ITEM_LIST.findIndex((x) => x.id === 'axolotl_bucket') + 1 && M['entity/fish'].bucketEmptySound('tadpole_bucket') === 'item.bucket.empty_tadpole');
  // out of the water
  const dry = spawn(level, -10.5, 64, -10.5, { type: 'tadpole' });
  tickPinned(level, player, 400);
  check('out of the water it flops about and suffocates', sounds.some((s) => s.n === 'entity.tadpole.flop') && dry.health < 6, `${dry.health}`);
  // an axolotl hunts them
  const { level: l2, world: w2, player: p2 } = setup({ pond: [0, -6, 12, 6] });
  for (let x = 0; x <= 12; x++) for (let z = -6; z <= 6; z++) for (let y = 59; y <= 61; y++) put(w2, x, y, z, 'water');
  const ax = spawn(l2, 3.5, 60.5, 0.5, { type: 'axolotl' });
  const tp = spawn(l2, 7.5, 60.5, 0.5, { type: 'tadpole' });
  ax.huntingCooldownUntil = -1;
  let hunted = false;
  // (it gives up on one it can't catch within ten seconds, as vanilla's does: so hunting, not the kill, is what's asked)
  tickPinned(l2, p2, 1500, () => { hunted ||= ax.attackTarget === tp && ax.activity() === 'fight'; return !tp.isAlive || tp.health < 6; });
  check('an axolotl hunts a tadpole', hunted, `${hunted} ${tp.health}`);
}

// --- the long jump, croaking, swimming to land, the fall
{
  const { level, world, sounds } = setup();
  // (in a pit two deep: vanilla leaps only where it can't walk)
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) for (let y = 64; y <= 65; y++) if (x || z) put(world, x, y, z, 'stone');
  const f = spawn(level, 0.5, 64, 0.5, { ready: true });
  f.longJumpCooldown = 0;
  let jumped = -1, landed = -1, pose = false;
  tickPinned(level, level.player, 1600, (i) => {
    if (jumped < 0 && sounds.some((s) => s.n === 'entity.frog.long_jump')) jumped = i;
    pose ||= f.pose === 'long_jumping' && f.jumpAnimStart >= 0;
    if (jumped >= 0 && landed < 0 && !f.longJumpMidJump && f.onGround) landed = i;
    return landed >= 0;
  });
  check('its long jump: a leap up where it can\'t walk (its sound, its pose), and on landing the next one five to seven seconds off', jumped >= 0 && landed >= 0 && pose && f.pose === 'standing' && f.y >= 66 && f.longJumpCooldown >= 90 && f.longJumpCooldown <= 140, `${jumped} ${landed} ${f.y.toFixed(2)} ${f.longJumpCooldown}`);
  const g = spawn(level, -10.5, 64, -10.5);
  const poses = [];
  const sp0 = g.setPose.bind(g);
  g.setPose = (p) => { poses.push([p, level.gameTime]); sp0(p); };
  tickPinned(level, level.player, 1200, () => { const c = poses.findIndex(([p]) => p === 'croaking'); return c >= 0 && c + 1 < poses.length; });
  const c = poses.findIndex(([p]) => p === 'croaking');
  const len = c >= 0 && poses[c + 1] ? poses[c + 1][1] - poses[c][1] : -1;
  check('standing about, it croaks now and then, for three seconds (its throat swelling)', c >= 0 && len >= 59 && len <= 62, `${len}`);
  // swimming to land
  const { level: l2, world: w2 } = setup({ pond: [-4, -4, 4, 4] });
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) put(w2, x, 61, z, 'water');
  const s = spawn(l2, 0.5, 62, 0.5);
  let swam = false;
  tickPinned(l2, l2.player, 1200, () => { swam ||= s.activity() === 'swim'; return swam && !s.inWater && s.onGround; });
  check('in the water it swims, and makes for land', swam && !s.inWater && s.onGround, `${s.x.toFixed(1)} ${s.z.toFixed(1)}`);
  // the fall
  const drop = (type, h) => {
    const { level: l3 } = setup();
    const m = spawn(l3, 0.5, 64 + h, 0.5, { type });
    for (let i = 0; i < 80; i++) l3.tick();
    return m.maxHealth - m.health;
  };
  const f8 = drop('frog', 8), f12 = drop('frog', 12), p12 = drop('pig', 12);
  check('a fall of eight doesn\'t hurt it; any fall hurts it five less than another mob', f8 === 0 && f12 > 0 && p12 - f12 === 5, `${f8} ${f12} ${p12}`);
}

// --- saving
{
  const { level } = setup();
  const f = spawn(level, 0.5, 64, 0.5, { variant: 'cold' });
  f.isPregnant = true;
  f.longJumpCooldown = 77;
  const d = f.saveData();
  const g = new Frog(level);
  g.loadData(d);
  check('saved: its kind (minecraft:cold), its spawn, its long jump\'s wait', d.variant === 'minecraft:cold' && g.variant === 'cold' && g.isPregnant && g.longJumpCooldown === 77);
  const t = spawner.createMob('tadpole', level);
  t.age = 1234;
  const u = new Tadpole(level);
  u.loadData(t.saveData());
  check('...a tadpole its age', u.age === 1234 && u.fromBucket);
}

// --- placing on water, the advancements
{
  const { level, world, player, triggers } = setup({ pond: [5, -4, 9, 4] });
  const IA = M['game/interaction'].Interaction;
  const ia = new IA(level, player);
  player.gameMode = 'survival';
  const use = (id, x, z, pitch = 60) => {
    hold(player, id, 4);
    player.moveTo(x, 64, z, -90, pitch);
    ia.rightClickDelay = 0;
    ia.pick(player.x, player.y + player.eyeHeight, player.z, player.yaw, player.pitch);
    ia.use(true, true);
    return player.inventory.selectedItem?.count;
  };
  // looking down at the pond from its edge
  const left = use('lily_pad', 4.5, 0.5, 45);
  let pad = null;
  for (let x = 5; x <= 9 && !pad; x++) if (nameAt(world, x, 64, 0) === 'lily_pad') pad = x;
  check('a lily pad goes on the water looked at', pad !== null && left === 3, `${pad} ${left}`);
  const left2 = use('frogspawn', 4.5, 2.5, 45);
  let fs = null;
  for (let x = 5; x <= 9 && fs === null; x++) if (nameAt(world, x, 64, 2) === 'frogspawn') fs = x;
  check('...frogspawn too (and it\'s to hatch)', fs !== null && left2 === 3 && level.hasScheduledTick(fs, 64, 2, BLOCK_BY_NAME.get('frogspawn').id), `${fs} ${left2}`);
  const left2b = use('frogspawn', 4.5, 0.5, 45);
  check('...not over the lily pad in the way', left2b === 4 && nameAt(world, pad, 65, 0) === 'air');
  const left3 = use('lily_pad', -10.5, -10.5, 60);
  check('...but not on the ground (nor against a block\'s side)', left3 === 4 && nameAt(world, -10, 64, -10) !== 'lily_pad' && nameAt(world, -11, 64, -10) !== 'lily_pad');
  // leading each kind
  const ADV = M['game/advancements'];
  const leash = ADV.ADVANCEMENTS.get('husbandry/leash_all_frog_variants');
  const inter = [];
  ia.onInteractedWithEntity = (stack, e) => {
    const v = e.variant;
    inter.push({ type: 'player_interacted_with_entity', payload: { interacted: { item: stack?.item.id ?? null, entity: e.type, variant: typeof v === 'string' ? v : undefined } } });
  };
  const pa = new ADV.PlayerAdvancements();
  for (const v of ['temperate', 'warm', 'cold']) {
    const f = spawn(level, -5.5, 64, -5.5, { variant: v });
    hold(player, 'lead');
    player.moveTo(-5.5, 64, -3.5, 180, 0);
    ia.entityHit = f;
    ia.hit = null;
    ia.rightClickDelay = 0;
    ia.use(true, true);
    for (const t of inter.splice(0)) pa.trigger(t.type, t.payload);
    if (v !== 'cold') check(`...leading a ${v} frog: not yet`, !pa.isDone(leash) && f.leashHolder === player);
  }
  check('a lead on each kind of frog: When the Squad Hops into Town', pa.isDone(leash));
  const lights = ADV.ADVANCEMENTS.get('husbandry/froglights');
  const pb = new ADV.PlayerAdvancements();
  pb.trigger('inventory', { inventory: new Set(['ochre_froglight', 'verdant_froglight']) });
  const two = pb.isDone(lights);
  pb.trigger('inventory', { inventory: new Set(['ochre_froglight', 'verdant_froglight', 'pearlescent_froglight']) });
  check('all three froglights at once: With Our Powers Combined! (two aren\'t enough)', !two && pb.isDone(lights));
  const suit = ADV.ADVANCEMENTS.get('story/obtain_armor');
  const pc = new ADV.PlayerAdvancements();
  pc.trigger('inventory', { inventory: new Set(['iron_helmet']) });
  check('...(any-of inventory criteria as before)', !suit || pc.isDone(suit));
  void triggers;
}

// --- sounds
{
  const SND = M['audio/synth'].SOUNDS;
  const want = [
    ...['ambient', 'death', 'eat', 'hurt', 'lay_spawn', 'long_jump', 'step', 'tongue'].map((n) => 'entity.frog.' + n),
    ...['death', 'flop', 'grow_up', 'hurt'].map((n) => 'entity.tadpole.' + n),
    'item.bucket.fill_tadpole', 'item.bucket.empty_tadpole',
    ...['break', 'fall', 'hit', 'place', 'step', 'hatch'].map((n) => 'block.frogspawn.' + n),
    ...['break', 'fall', 'hit', 'place', 'step'].map((n) => 'block.froglight.' + n),
  ];
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
      if (!finite || peak < 0.05 || buf.length < 500) bad.push(`${n}#${i} peak ${peak.toFixed(3)} len ${buf.length}`);
    }
  }
  check(`the frog's, the tadpole's, the bucket's, frogspawn's and the froglights' sounds (${takes} takes)`, bad.length === 0, bad.join(', '));
  const { level } = setup();
  const f = spawn(level, 0.5, 64, 0.5), t = spawner.createMob('tadpole', level);
  check('...theirs', [f.ambientSound(), f.hurtSound(), f.deathSound(), f.stepSound(), t.hurtSound(), t.deathSound(), t.pickupSound()].join() === 'entity.frog.ambient,entity.frog.hurt,entity.frog.death,entity.frog.step,entity.tadpole.hurt,entity.tadpole.death,item.bucket.fill_tadpole');
}

// --- textures, the model, the renderer
function faces(c) {
  const { u, v, w, h, d } = c;
  return { top: [u + d, v, w, d], bottom: [u + d + w, v, w, d], right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h], back: [u + 2 * d + w, v + d, w, h] };
}
function walk(part, nm, out) {
  part.cubes.forEach((c, i) => out.push([`${nm}#${i}`, c]));
  for (const [n, ch] of part.children) walk(ch, n, out);
}
{
  const MT = M['textures/mobs'].MOB_TEXTURES;
  const RR = M['render/frogRenderer'];
  const opaqueIn = (img, [x0, y0, w, h]) => { let n = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (img.data[(y * img.w + x) * 4 + 3]) n++; return n; };
  const def = RR.frogModel();
  const cubes = [];
  walk(def.root, 'root', cubes);
  // the faces meant to be clear: the body's top and the top row of its sides, the head's underside, the eyes' undersides
  const clearOk = (n, f) => (n === 'body#0' && f === 'top') || (n === 'head#1' && f === 'bottom') || (/_eye#0/.test(n) && f === 'bottom');
  const bad = [];
  for (const v of ['temperate', 'warm', 'cold']) {
    const img = MT[`frog_${v}`]?.();
    if (!img || img.w !== 48 || img.h !== 48) { bad.push(`${v} missing`); continue; }
    for (const [n, c] of cubes) for (const [f, r] of Object.entries(faces(c))) {
      if (!r[2] || !r[3]) continue;
      const flat = !c.w || !c.h || !c.d;
      const o = opaqueIn(img, r), all = r[2] * r[3];
      if (clearOk(n, f)) { if (o) bad.push(`${v} ${n}.${f} not clear`); continue; }
      if (n === 'body#0' && f !== 'bottom') { if (o !== all - r[2]) bad.push(`${v} ${n}.${f} ${o}/${all}`); continue; }
      // (the hands and feet are their toes' shapes)
      if (/_(hand|foot)#/.test(n)) { if (o < 10 || o > all * 0.6) bad.push(`${v} ${n}.${f} ${o}`); continue; }
      if (flat ? o < all * 0.8 : o !== all) bad.push(`${v} ${n}.${f} ${o}/${all}`);
    }
  }
  check('the three frog skins: 48x48, each face painted but those left clear where the head meets the body', bad.length === 0, bad.slice(0, 8).join(', '));
  const col = (img, x, y) => [img.data[(y * 48 + x) * 4], img.data[(y * 48 + x) * 4 + 1], img.data[(y * 48 + x) * 4 + 2]];
  const [tr, tg] = col(MT.frog_temperate(), 13, 16), [wr, wg, wb] = col(MT.frog_warm(), 13, 16), [cr, cg] = col(MT.frog_cold(), 13, 16);
  check('...orange, cream-white, green', tr > tg + 40 && wr > 190 && wg > 180 && wb > 150 && cg > cr);
  const tad = MT.tadpole?.();
  const tcubes = [];
  walk(RR.tadpoleModel().root, 'root', tcubes);
  const tbad = [];
  if (!tad || tad.w !== 16) tbad.push('missing');
  else for (const [n, c] of tcubes) for (const [f, r] of Object.entries(faces(c))) if (r[2] && r[3] && opaqueIn(tad, r) !== r[2] * r[3]) tbad.push(`${n}.${f}`);
  check('the tadpole\'s skin: 16x16, its body and both sides of its tail painted', tbad.length === 0, tbad.join());
  const names = [];
  const collect = (p, nm) => { names.push(nm); for (const [n, ch] of p.children) collect(ch, n); };
  collect(def.root, 'top');
  check('the model: a body with the head (and eyes) on it, the throat, the tongue, arms with hands, legs with feet', ['root', 'body', 'head', 'eyes', 'right_eye', 'left_eye', 'croaking_body', 'tongue', 'left_arm', 'left_hand', 'right_arm', 'right_hand', 'left_leg', 'left_foot', 'right_leg', 'right_foot'].every((n) => names.includes(n)) && cubes.length === 16 && def.texW === 48 && def.texH === 48);
  const BT = M['textures/blocks'].BLOCK_TEXTURES;
  const IT = M['textures/items'].ITEM_TEXTURES;
  const opaque = (t) => { let n = 0; for (let k = 3; k < t.data.length; k += 4) if (t.data[k]) n++; return n; };
  check('frogspawn\'s texture (partly clear), the ochre and pearlescent froglights\', the eggs and the bucket', BT.frogspawn && opaque(BT.frogspawn()) > 40 && opaque(BT.frogspawn()) < 256 && ['ochre_froglight_side', 'ochre_froglight_top', 'pearlescent_froglight_side', 'pearlescent_froglight_top', 'verdant_froglight_side'].every((n) => BT[n] && opaque(BT[n]()) === 256) && IT.frog_spawn_egg && IT.tadpole_spawn_egg && IT.tadpole_bucket);

  // the renderer through stand-ins
  const { level } = setup();
  let quads = 0;
  const drawn = [];
  const batch = { quad() { quads++; }, begin() {}, flush() {}, setOverlay() {}, lightB: 96, lightS: 100, color: [1, 1, 1, 1] };
  const pose = new M['render/entityRenderer'].PoseStack();
  const A = { limbSwing: 1.3, limbAmount: 0.8, age: 100, headYaw: 10, headPitch: 20 };
  const kit = {
    pose, items: { render() {} }, tex: (n) => (MT[n] ? { n } : null),
    setupLiving: () => { pose.reset(); return A; }, overlay() {},
    drawBody: (b, e, d, tex) => { drawn.push(tex.n); d.root.render(b, pose, d.texW, d.texH); },
    state: (t, extra) => ({ texture: t, ...extra }), attackAnim: () => 0,
  };
  const rr = new RR.FrogRenderers(kit);
  const f = spawn(level, 0.5, 64, 0.5, { variant: 'warm' });
  const t = spawn(level, 2.5, 64, 0.5, { type: 'tadpole' });
  const pig = spawn(level, 4.5, 64, 0.5, { type: 'pig' });
  const ok = rr.render(batch, f, 0, 0, 0, 0.5) && rr.render(batch, t, 0, 0, 0, 0.5) && !rr.render(batch, pig, 0, 0, 0, 0.5);
  check('each drawn in its skin (a warm frog\'s), not a pig', ok && quads > 0 && drawn.join() === 'frog_warm,tadpole', drawn.join());
  // the animations
  const root = def.root;
  f.tickCount = 100;
  const at = (fn) => { fn(); return root; };
  f.croakAnimStart = -1;
  RR.animateFrog(root, f, 0, 0, 0);
  const still = root.find('croaking_body').visible;
  f.croakAnimStart = f.tickCount - 16;
  RR.animateFrog(root, f, 0, 0, 0);
  const puffed = root.find('croaking_body').yScale;
  check('the throat drawn only while it croaks, swelling', !still && root.find('croaking_body').visible && puffed > 1.3, `${puffed}`);
  f.croakAnimStart = -1;
  f.tongueAnimStart = f.tickCount - 4;
  at(() => RR.animateFrog(root, f, 0, 0, 0));
  check('...its head thrown back and its tongue shot out long', root.find('head').xRot < -0.9 && root.find('tongue').zScale > 4, `${root.find('head').xRot.toFixed(2)} ${root.find('tongue').zScale}`);
  f.tongueAnimStart = -1;
  f.jumpAnimStart = f.tickCount - 10;
  RR.animateFrog(root, f, 0, 0, 0);
  check('...leaping, stretched out, nose up, legs back', root.find('body').xRot < -0.3 && root.find('left_leg').xRot > 1.5);
  f.jumpAnimStart = -1;
  RR.animateFrog(root, f, 5, 1, 0);
  const walking = root.find('left_arm').xRot, rleg = root.find('right_leg').xRot;
  RR.animateFrog(root, f, 5, 0, 0);
  check('...walking, its limbs swing (not while standing still)', Math.abs(walking) > 0.05 && Math.abs(rleg) > 0.01 && root.find('left_arm').xRot === 0);
  const troot = RR.tadpoleModel().root;
  RR.animateTadpole(troot, t, 5);
  check('the tadpole\'s tail wags', Math.abs(troot.child('tail').yRot) > 0.05);
  check('their shadows: 0.3 and 0.14', RR.FROG_SHADOW_RADII.frog === 0.3 && RR.FROG_SHADOW_RADII.tadpole === 0.14);
}

close?.();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);

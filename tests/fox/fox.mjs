// Headless checks for foxes (node tests/fox/fox.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/textures/mobs.ts',
  '/src/entity/fox.ts', '/src/entity/itemEntity.ts', '/src/audio/synth.ts', '/src/render/foxRenderer.ts', '/src/render/entityRenderer.ts',
  '/src/render/particles.ts', '/src/textures/items.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, biomes, mobs, F, IE, A, FR, ER, PT, TI] = mods;
const T = mobs;
const { ItemStack } = itemMod;
const { S, BLOCKS, STATE_BLOCK } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

function makeLevel(biome = 'plains') {
  const world = new worldMod.World();
  for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) {
    const c = new chunkMod.Chunk(cx, cz);
    c.biomes.fill(biomes.BIOME_ID[biome]);
    world.chunks.set(c.key, c);
  }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  const parts = [];
  level.sound = { play: (n, x, y, z, v, p) => sounds.push({ n, v, p, x, y, z }), playUI() {} };
  level.particles = { spawn: (k, x, y, z, dx, dy, dz) => parts.push({ k, x, y, z, dx, dy, dz }), blockBreak: (x, y, z, st) => parts.push({ k: 'break', x, y, z, st }), spell() {}, poof() {}, entityEffect() {}, blockParticle() {} };
  const st = S('stone'), gs = S('grass_block');
  for (let x = -60; x <= 60; x++) for (let z = -60; z <= 60; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 58; y <= 62; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, gs);
    c.heightmap[((z & 15) << 4) | (x & 15)] = 64;
  }
  level.dayTime = 6000;
  level.difficulty = 'normal';
  return { world, level, sounds, parts };
}
function playerAt(level, x, y, z, mode = 'survival') {
  const p = new playerMod.Player(level);
  p.setGameMode(mode);
  p.moveTo(x + 0.5, y, z + 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  return p;
}
const mobAt = (level, type, x, y, z) => { const m = spawner.createMob(type, level); m.moveTo(x + 0.5, y, z + 0.5, 0, 0); m.finalizeSpawn('egg'); level.addEntity(m); return m; };
const settle = (level, n) => { for (let i = 0; i < n; i++) level.tick(); };
const running = (m, name) => m.goalSelector.goals.some((g) => g.running && g.goal.constructor.name === name);
// (a mob's goals go in on its first tick: they're put in now, to take one out)
const dropGoal = (m, name) => { m.ensureGoals(); for (const w of [...m.goalSelector.goals]) if (w.goal.constructor.name === name) m.goalSelector.removeGoal(w.goal); };
const targetGoals = (m) => m.targetSelector.goals.map((w) => `${w.priority}:${w.goal.constructor.name}`);
const stack = (id, n = 1) => ItemStack.of(id, n);
/** a roof of leaves over x0..x1, z0..z1 at height y (placed ones: with no logs, the rest would rot away) */
const roof = (world, x0, x1, z0, z1, y) => { for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) world.setState(x, y, z, blockMod.getBlock('oak_leaves').state({ persistent: true })); };

// --- registered, and its build
{
  check('registered, with a name', !!spawner.MOB_TYPES.fox && spawner.entityDisplayName('fox') === 'Fox');
  const { level } = makeLevel();
  const f = spawner.createMob('fox', level);
  check('0.6 x 0.7, eyes at 0.4; 10 health, speed 0.3, bites for 2, follows 32', near(f.width, 0.6) && near(f.height, 0.7) && near(f.eyeHeight, 0.4) && f.maxHealth === 10 && near(f.moveSpeedAttr, 0.3) && f.attackDamage === 2 && f.followRange === 32);
  f.setAge(-24000);
  check('a cub half the size, eyes at 0.2975', near(f.width, 0.3) && near(f.height, 0.35) && near(f.eyeHeight, 0.2975));
  check('bred with sweet berries and glow berries (not wheat)', f.isFood(stack('sweet_berries')) && f.isFood(stack('glow_berries')) && !f.isFood(stack('wheat')));
  check('falls 5 blocks unhurt (safe fall 5)', f.safeFallDistance() === 5);
}

// --- red or snow, by where it is
{
  const tally = (biome, n) => {
    const { level } = makeLevel(biome);
    const c = [0, 0];
    for (let i = 0; i < n; i++) { const m = spawner.createMob('fox', level); m.moveTo(0.5, 64, 0.5, 0, 0); m.finalizeSpawn('egg'); c[m.variant]++; }
    return c;
  };
  const t = tally('taiga', 50), s = tally('snowy_taiga', 50), g = tally('grove', 20), sl = tally('snowy_slopes', 20), p = tally('old_growth_spruce_taiga', 20);
  check('red in the taiga, snow in the snowy taiga, the grove and the snowy slopes', t[0] === 50 && s[1] === 50 && g[1] === 20 && sl[1] === 20 && p[0] === 20);
  const { level } = makeLevel('snowy_taiga');
  const group = {};
  const pack = [0, 1, 2, 3].map(() => { const m = spawner.createMob('fox', level); m.moveTo(0.5, 64, 0.5, 0, 0); m.finalizeSpawn('natural', group); return m; });
  check('a group shares its type; the first two grown, the rest cubs', pack.every((m) => m.variant === 1) && !pack[0].isBaby() && !pack[1].isBaby() && pack[2].isBaby() && pack[3].isBaby());
  const f = spawner.createMob('fox', level);
  f.readSummonData({ Type: 'red' });
  check('/summon fox ~ ~ ~ {Type:"red"} in the snow', f.variant === 0 && f.variantId() === 'red');
  f.readSummonData({ type: 'snow' });
  check('...and {Type:"snow"}', f.variant === 1);
}

// --- its goals, as vanilla lists them
{
  const { level } = makeLevel('taiga');
  playerAt(level, 30, 64, 30, 'creative');
  const f = mobAt(level, 'fox', 0, 64, 0);
  settle(level, 2);
  const names = f.goalSelector.goals.map((w) => `${w.priority}:${w.goal.constructor.name}`).join(',');
  const want = '0:FoxFloatGoal,0:ClimbOnTopOfPowderSnowGoal,1:FaceplantGoal,2:FoxPanicGoal,3:FoxBreedGoal,4:AvoidEntityGoal,4:AvoidEntityGoal,4:AvoidEntityGoal,5:StalkPreyGoal,6:FoxPounceGoal,6:SeekShelterGoal,7:FoxMeleeAttackGoal,7:SleepGoal,8:FoxFollowParentGoal,9:FoxStrollThroughVillageGoal,10:FoxEatBerriesGoal,10:LeapAtTargetGoal,11:WaterAvoidingRandomStrollGoal,11:FoxSearchForItemsGoal,12:FoxLookAtPlayerGoal,13:PerchAndSearchGoal';
  check('its goals and their priorities', names === want, names);
  check('a red fox hunts on land first, fish after', targetGoals(f).join(',') === '3:DefendTrustedTargetGoal,4:NearestAttackableMobGoal,4:NearestAttackableMobGoal,6:NearestAttackableMobGoal');
  const { level: l2 } = makeLevel('grove');
  playerAt(l2, 30, 64, 30, 'creative');
  const s = mobAt(l2, 'fox', 0, 64, 0);
  settle(l2, 2);
  const fishFirst = s.targetSelector.goals.find((w) => w.priority === 4)?.goal;
  check('a snow fox fish first, the rest after', targetGoals(s).join(',') === '3:DefendTrustedTargetGoal,4:NearestAttackableMobGoal,6:NearestAttackableMobGoal,6:NearestAttackableMobGoal' && s.targetSelector.goals.filter((w) => w.priority === 6).length === 2 && !!fishFirst);
  // a cub just born doesn't hunt till it's loaded again (vanilla: setTargetGoals isn't called for it)
  const cub = f.makeBaby(f);
  cub.moveTo(2.5, 64, 0.5, 0, 0);
  level.addEntity(cub);
  settle(level, 2);
  check('a cub just born has no hunting (as vanilla), till it\'s reloaded', targetGoals(cub).join(',') === '3:DefendTrustedTargetGoal');
}

// --- keeping away
{
  const flee = (mode, setup) => {
    const { level } = makeLevel('taiga');
    const pl = playerAt(level, 0, 64, 0, mode);
    const f = mobAt(level, 'fox', 5, 64, 0);
    setup?.(pl, f, level);
    let fled = false, far = 0;
    for (let i = 0; i < 300; i++) {
      level.tick();
      if (running(f, 'AvoidEntityGoal')) fled = true;
      far = Math.max(far, Math.hypot(f.x - pl.x, f.z - pl.z));
    }
    return [fled, far];
  };
  const [a, far] = flee('survival');
  check('it keeps away from a player', a && far > 12, far.toFixed(1));
  check('...not one in creative', !flee('creative')[0]);
  check('...nor one sneaking up', !flee('survival', (pl) => { pl.input.sneak = true; })[0]);
  check('...nor one it trusts', !flee('survival', (pl, f) => f.addTrustedUUID(pl.uuid))[0]);
  const { level } = makeLevel('taiga');
  playerAt(level, 30, 64, 30, 'creative');
  const f = mobAt(level, 'fox', 0, 64, 0), w = mobAt(level, 'wolf', 5, 64, 0), b = mobAt(level, 'polar_bear', 0, 64, -6);
  w.moveSpeedAttr = 0; b.moveSpeedAttr = 0;
  dropGoal(w, 'NonTameRandomTargetGoal');
  b.targetSelector.goals.length = 0;
  let fled = false;
  for (let i = 0; i < 100; i++) { level.tick(); if (running(f, 'AvoidEntityGoal')) fled = true; }
  check('...and from wolves and polar bears', fled);
}

// --- asleep by day, under cover
{
  const { world, level } = makeLevel('taiga');
  playerAt(level, 40, 64, 40, 'creative');
  roof(world, -4, 4, -4, 4, 67);
  const f = mobAt(level, 'fox', 0, 64, 0);
  // (not wandering out from under them, nor sitting up to look about)
  dropGoal(f, 'WaterAvoidingRandomStrollGoal'); dropGoal(f, 'PerchAndSearchGoal');
  let slept = -1;
  for (let i = 0; i < 400 && slept < 0; i++) { level.tick(); if (f.isSleeping()) slept = i; }
  check('by day under the trees, with no one about, it falls asleep', slept >= 0, String(slept));
  // (once it's done sliding from where it was going)
  settle(level, 20);
  const x = f.x, z = f.z;
  settle(level, 100);
  check('...and sleeps on, still', f.isSleeping() && near(f.x, x, 1e-3) && near(f.z, z, 1e-3), `${f.isSleeping()} ${(f.x - x).toFixed(4)} ${(f.z - z).toFixed(4)}`);
  const saved = f.save();
  level.dayTime = 14000;
  settle(level, 40);
  check('come nightfall it wakes', !f.isSleeping());
  // out in the open, or with a chicken about, it doesn't
  const { level: l2 } = makeLevel('taiga');
  playerAt(l2, 40, 64, 40, 'creative');
  const g = mobAt(l2, 'fox', 0, 64, 0);
  dropGoal(g, 'WaterAvoidingRandomStrollGoal'); dropGoal(g, 'SeekShelterGoal'); dropGoal(g, 'PerchAndSearchGoal');
  let never = true;
  for (let i = 0; i < 400; i++) { l2.tick(); if (g.isSleeping()) never = false; }
  check('not out under the open sky', never);
  const { world: w3, level: l3 } = makeLevel('taiga');
  playerAt(l3, 40, 64, 40, 'creative');
  roof(w3, -4, 4, -4, 4, 67);
  const h = mobAt(l3, 'fox', 0, 64, 0);
  // (a chicken standing still within 12 blocks of anywhere under the roof)
  const c = mobAt(l3, 'chicken', 5, 64, 0);
  c.moveSpeedAttr = 0; c.ensureGoals(); c.goalSelector.goals.length = 0;
  // (its goals go in on its first tick: then it's made to hunt nothing)
  l3.tick();
  h.targetSelector.goals.length = 0;
  h.setTarget(null);
  let awake = true;
  for (let i = 0; i < 400; i++) { l3.tick(); if (h.isSleeping()) awake = false; }
  check('nor with a chicken about', awake);
  const { level: l4 } = makeLevel('taiga');
  playerAt(l4, 40, 64, 40, 'creative');
  const back = spawner.createMob('fox', l4);
  back.load(saved);
  check('asleep when saved, asleep when loaded', back.isSleeping());
}

// --- the hunt: stalking, crouching, pouncing
{
  const hunt = (prey) => {
    const { level } = makeLevel('taiga');
    playerAt(level, 40, 64, 40, 'creative');
    const f = mobAt(level, 'fox', 0, 64, 0);
    const c = mobAt(level, prey, 14, 64, 0);
    c.moveSpeedAttr = 0;
    c.goalSelector.goals.length = 0;
    let stalked = false, crouched = false, cocked = false, pounced = false, high = 0, died = -1;
    for (let i = 0; i < 1200 && died < 0; i++) {
      level.tick();
      if (running(f, 'StalkPreyGoal')) stalked = true;
      if (f.isCrouching()) crouched = true;
      if (f.isInterested()) cocked = true;
      if (f.isPouncing()) { pounced = true; high = Math.max(high, f.y - 64); }
      if (!c.isAlive) died = i;
    }
    return { stalked, crouched, cocked, pounced, high, died, f };
  };
  const h = hunt('chicken');
  check('it stalks a chicken, crouches with its head cocked, and pounces', h.stalked && h.crouched && h.cocked && h.pounced, JSON.stringify(h, (k, v) => (k === 'f' ? undefined : v)));
  check('...a high leap (0.9 up)', h.high > 2.5, h.high.toFixed(2));
  check('...and kills it', h.died >= 0, String(h.died));
  const r = hunt('rabbit');
  check('rabbits too', r.pounced && r.died >= 0, String(r.died));
  // fully crouched, it's at 3 in fifteen ticks
  const { level } = makeLevel('taiga');
  const f = spawner.createMob('fox', level);
  f.setIsCrouching(true);
  let n = 0;
  while (!f.isFullyCrouched() && n < 40) { f.crouchAmount = f.isCrouching() ? Math.min(3, Math.fround(f.crouchAmount + Math.fround(0.2))) : 0; n++; }
  check('fully crouched after fifteen ticks', n === 15, String(n));
}

// --- nose in the snow
{
  // it leaps at a chicken too far off (8 blocks; stalking, it would have got within 6) and lands short, in the snow
  const { world, level } = makeLevel('snowy_taiga');
  playerAt(level, 40, 64, 40, 'creative');
  for (let x = -3; x <= 14; x++) for (let z = -3; z <= 3; z++) world.setState(x, 64, z, S('snow'));
  const f = mobAt(level, 'fox', 0, 64, 0);
  const c = mobAt(level, 'chicken', 8, 64, 0);
  c.moveSpeedAttr = 0; c.goalSelector.goals.length = 0; c.maxHealth = c.health = 1000;
  settle(level, 2);
  f.setTarget(c);
  f.setIsCrouching(true);
  f.setIsInterested(true);
  f.crouchAmount = 3;
  let planted = false, lostPrey = false, leapt = false;
  for (let i = 0; i < 200 && !planted; i++) {
    level.tick();
    if (f.isPouncing()) leapt = true;
    if (f.isFaceplanted()) { planted = true; lostPrey = f.target === null; }
  }
  check('leaping into snow and falling short, it ends nose-first in it, its prey forgotten', leapt && planted && lostPrey && f.pitch > 0, `pitch ${f.pitch.toFixed(1)}`);
  const x = f.x;
  let moved = 0, freed = -1;
  for (let i = 0; i < 80 && freed < 0; i++) { level.tick(); moved = Math.max(moved, Math.abs(f.x - x)); if (!f.isFaceplanted()) freed = i; }
  check('...stuck there two seconds', moved < 0.3 && freed >= 36 && freed <= 42, `${freed}, slid ${moved.toFixed(3)}`);
}

// --- bred: the cub trusts whoever fed its parents
{
  const { level } = makeLevel('taiga');
  const pl = playerAt(level, 0, 64, 0, 'creative');
  const a = mobAt(level, 'fox', 2, 64, 0), b = mobAt(level, 'fox', 3, 64, 1);
  a.setVariant(0); b.setVariant(1);
  pl.inventory.setSelectedItem(stack('sweet_berries', 4));
  a.interact(pl, pl.inventory.selectedItem);
  b.interact(pl, pl.inventory.selectedItem);
  let baby = null;
  for (let i = 0; i < 600 && !baby; i++) { level.tick(); baby = level.entities.find((e) => e.type === 'fox' && e.isBaby()) ?? null; }
  check('fed sweet berries, two foxes have a cub', !!baby && a.age > 0 && b.age > 0);
  check('...that trusts the one who fed them', !!baby && baby.trusts(pl.uuid) && baby.trustedUUIDs()[0] === pl.uuid);
  check('...and takes after one parent', !!baby && (baby.variant === 0 || baby.variant === 1));
  let reds = 0;
  for (let i = 0; i < 400; i++) if (a.makeBaby(b).variant === 0) reds++;
  check('...either, half the time', reds > 160 && reds < 240, String(reds));
  // a cub from a spawn egg trusts the one who used it
  const f = spawner.createMob('fox', level);
  const c2 = f.makeBaby(f);
  f.onOffspringSpawnedFromEgg(pl, c2);
  check('a cub made with a spawn egg on a fox trusts whoever used it', c2.trusts(pl.uuid));
}

// --- defending the one it trusts
{
  const { level } = makeLevel('taiga');
  const pl = playerAt(level, 0, 64, 0);
  const f = mobAt(level, 'fox', 3, 64, 0);
  f.addTrustedUUID(pl.uuid);
  const z = mobAt(level, 'zombie', -3, 64, 0);
  z.moveSpeedAttr = 0;
  settle(level, 5);
  z.doHurtTarget(pl);
  let defending = false, growled = false;
  const { sounds } = { sounds: [] };
  for (let i = 0; i < 100 && !defending; i++) { level.tick(); if (f.target === z && f.isDefending()) defending = true; }
  check('something hurts the one it trusts: it goes for it, defending', defending);
  z.kill?.() ?? z.hurt(1000, 'generic');
  settle(level, 30);
  check('...and stops defending once that\'s gone', !f.isDefending());
  void growled; void sounds;
}

// --- where they spawn
{
  const pick = (biome) => spawner.biomeSettings(biomes.BIOME_ID[biome]).creature.find((d) => d.type === 'fox');
  const is = (d, w, a, b) => !!d && d.weight === w && d.min === a && d.max === b;
  check('the taigas and the snowy taiga 8 (2-4), the grove 4 (2-4)', is(pick('taiga'), 8, 2, 4) && is(pick('snowy_taiga'), 8, 2, 4) && is(pick('old_growth_pine_taiga'), 8, 2, 4) && is(pick('old_growth_spruce_taiga'), 8, 2, 4) && is(pick('grove'), 4, 2, 4));
  check('none on the plains, in the forest, the snowy plains or the snowy slopes', !pick('plains') && !pick('forest') && !pick('snowy_plains') && !pick('snowy_slopes') && !pick('meadow') && !pick('desert'));
  const { world, level } = makeLevel('taiga');
  world.setState(2, 63, 0, S('podzol'));
  world.setState(4, 63, 0, S('coarse_dirt'));
  world.setState(6, 63, 0, S('snow_block'));
  world.setState(8, 63, 0, S('stone'));
  world.setState(10, 63, 0, S('sand'));
  world.setState(12, 64, 0, S('snow'));
  const ns = new spawner.NaturalSpawner(level, 1);
  const rule = (x, y = 64) => ns.checkSpawnRules('fox', x, y, 0);
  check('on grass, podzol, coarse dirt, snow or a snow layer; not on stone or sand', rule(0) && rule(2) && rule(4) && rule(6) && rule(12, 65) && !rule(8) && !rule(10));
  world.getChunk(0, 0).setLight(14, 64, 0, 0x80);
  world.getChunk(0, 0).setLight(15, 64, 0, 0x90);
  check('...in the light (above 8), not in the dark', rule(15) && !rule(14));
  // new taiga chunks: now and then a group of two to four, all one type, the third and fourth cubs
  const { level: l2 } = makeLevel('snowy_taiga');
  // (over the chunks of a dozen worlds' seeds; each lot taken away again before the next)
  const foxes = [];
  for (let seed = 1; seed <= 12; seed++) {
    const ns2 = new spawner.NaturalSpawner(l2, seed);
    for (let cx = -4; cx <= 3; cx++) for (let cz = -4; cz <= 3; cz++) for (const e of ns2.spawnForNewChunk(cx, cz)) { if (e.type === 'fox') foxes.push(e); e.remove(); }
  }
  const cubs = foxes.filter((e) => e.isBaby()).length;
  check('new chunks of snowy taiga bring snow foxes, a group\'s third and fourth cubs', foxes.length >= 2 && foxes.every((e) => e.variant === 1) && cubs < foxes.length && cubs > 0, `${foxes.length} foxes, ${cubs} cubs`);
}

// --- saving
{
  const { level } = makeLevel('taiga');
  playerAt(level, 30, 64, 30, 'creative');
  const f = mobAt(level, 'fox', 0, 64, 0);
  f.setVariant(1);
  f.addTrustedUUID('11111111-2222-3333-4444-555555555555');
  f.addTrustedUUID('66666666-7777-8888-9999-000000000000');
  f.setSitting(true);
  const d = JSON.parse(JSON.stringify(f.save()));
  check('saved: Type, Trusted, Sleeping, Sitting, Crouching', d.data.Type === 'snow' && d.data.Trusted.split(',').length === 2 && d.data.Sleeping === false && d.data.Sitting === true && d.data.Crouching === false, JSON.stringify(d.data));
  const g = spawner.createMob('fox', level);
  g.load(d);
  level.addEntity(g);
  settle(level, 2);
  check('...and loaded again, hunting as a snow fox', g.variant === 1 && g.trusts('66666666-7777-8888-9999-000000000000') && g.trusts('11111111-2222-3333-4444-555555555555') && targetGoals(g).length === 4);
}

// --- in its mouth
{
  const items = (level, id) => level.entities.filter((e) => e.type === 'item' && !e.removed && e.stack.item.id === id);
  const { level, sounds } = makeLevel('taiga');
  playerAt(level, 40, 64, 40, 'creative');
  const f = mobAt(level, 'fox', 0, 64, 0);
  f.setItemSlot('mainhand', null);
  // (not wandering off out of reach of it, nor sitting down to look about)
  dropGoal(f, 'WaterAvoidingRandomStrollGoal'); dropGoal(f, 'PerchAndSearchGoal');
  // (lying still just over into the next block but one: its path ends a block short of the item's block, and from
  // there it reaches it)
  const it = new IE.ItemEntity(level, stack('feather'));
  it.moveTo(4.1, 64, 0.5, 0, 0);
  level.addEntity(it);
  let took = -1;
  for (let i = 0; i < 400 && took < 0; i++) { level.tick(); if (f.mainHand?.item.id === 'feather') took = i; }
  check('it goes for a feather lying about and takes it in its mouth, to keep', took >= 0 && it.removed && f.handDropChance > 1, String(took));
  check('...no armour goes on it from a dispenser, only into an empty mouth', !f.canTakeItem('head') && !f.canTakeItem('mainhand'));
  const g = mobAt(level, 'fox', 10, 64, 10);
  g.setItemSlot('mainhand', null);
  check('...(an empty one)', g.canTakeItem('mainhand'));
  const pile = IE.ItemEntity.drop(level, 10, 64, 10, stack('leather', 5));
  pile.pickupDelay = 0;
  settle(level, 8);
  const rest = items(level, 'leather');
  check('one of a stack of five, the rest left lying', g.mainHand?.item.id === 'leather' && g.mainHand.count === 1 && rest.length === 1 && rest[0].stack.count === 4, `${g.mainHand?.count} ${rest.map((e) => e.stack.count)}`);
  const h = mobAt(level, 'fox', -10, 64, -10);
  h.setItemSlot('mainhand', stack('feather'));
  h.ticksSinceEaten = 5;
  sounds.length = 0;
  const apple = IE.ItemEntity.drop(level, -10, 64, -10, stack('apple'));
  apple.pickupDelay = 0;
  settle(level, 8);
  const spat = items(level, 'feather').find((e) => e.thrower === h);
  check('food over a feather: it takes the apple and spits the feather out', h.mainHand?.item.id === 'apple' && !!spat && spat.pickupDelay > 25 && sounds.some((x) => x.n === 'entity.fox.spit'), String(spat?.pickupDelay));
  const fe = IE.ItemEntity.drop(level, Math.floor(h.x), Math.floor(h.y), Math.floor(h.z), stack('feather'));
  fe.pickupDelay = 0;
  settle(level, 8);
  check('...but not food for a feather', h.mainHand?.item.id === 'apple' && !fe.removed);
  level.gameRules.mobGriefing = false;
  const mg = mobAt(level, 'fox', 20, 64, -20);
  mg.setItemSlot('mainhand', null);
  const fe2 = IE.ItemEntity.drop(level, 20, 64, -20, stack('feather'));
  fe2.pickupDelay = 0;
  settle(level, 10);
  check('with mobGriefing off it takes nothing', !mg.mainHand && !fe2.removed);
}
{
  // eating what it has
  const { level, sounds, parts } = makeLevel('taiga');
  playerAt(level, 40, 64, 40, 'creative');
  const eaters = [0, 1, 2].map((i) => { const e = mobAt(level, 'fox', i * 6, 64, 0); e.setItemSlot('mainhand', stack('sweet_berries')); e.ticksSinceEaten = 0; return e; });
  const ate = [-1, -1, -1];
  for (let i = 0; i < 700 && ate.includes(-1); i++) { level.tick(); eaters.forEach((e, k) => { if (ate[k] < 0 && !e.mainHand) ate[k] = i; }); }
  const crumbs = parts.filter((p) => p.k === 'item_sweet_berries').length;
  check('food in its mouth it eats after 600 ticks', ate.every((t) => t >= 597 && t <= 610), ate.join(','));
  check('...munching over the last 40, with crumbs', crumbs >= 8 && crumbs % 8 === 0 && sounds.filter((x) => x.n === 'entity.fox.eat').length > 3, String(crumbs));
  const eat = (id, x, setup) => { const e = mobAt(level, 'fox', x, 64, 8); const s = stack(id); setup?.(s); e.setItemSlot('mainhand', s); e.ticksSinceEaten = 600; return e; };
  const ga = eat('golden_apple', 0);
  const stew = eat('suspicious_stew', 6, (s) => { s.tag = { stewEffects: [{ id: 'night_vision', duration: 100 }] }; });
  const cf = eat('chorus_fruit', 12);
  const x0 = cf.x, z0 = cf.z;
  sounds.length = 0;
  settle(level, 3);
  check('a golden apple does it good', !ga.mainHand && ga.activeEffects.has('regeneration') && ga.activeEffects.has('absorption'));
  check('a suspicious stew gives what it holds, and it keeps no bowl', !stew.mainHand && stew.activeEffects.has('night_vision'));
  check('a chorus fruit sends it off, with a sound of its own', !cf.mainHand && Math.hypot(cf.x - x0, cf.z - z0) > 0.01 && sounds.some((x) => x.n === 'entity.fox.teleport') && !sounds.some((x) => x.n === 'item.chorus_fruit.teleport'), `${cf.mainHand?.item.id} ${Math.hypot(cf.x - x0, cf.z - z0).toFixed(2)} ${cf.y.toFixed(2)} ${cf.onGround} ${sounds.map((x) => x.n).join(',')}`);
  const busy = eat('cooked_chicken', 18);
  busy.setTarget(eaters[0]);
  settle(level, 3);
  check('...but not while it has something to go for', busy.mainHand?.item.id === 'cooked_chicken');
}
{
  // turning up with something
  const { level } = makeLevel('taiga');
  let held = 0;
  const kinds = new Set();
  for (let i = 0; i < 1000; i++) {
    const m = spawner.createMob('fox', level);
    m.moveTo(0.5, 64, 0.5, 0, 0);
    m.finalizeSpawn('natural', {});
    if (m.mainHand) { held++; kinds.add(`${m.mainHand.item.id}${m.mainHand.count > 1 ? '!' : ''}`); }
  }
  const allowed = ['emerald', 'egg', 'rabbit_foot', 'rabbit_hide', 'wheat', 'leather', 'feather'];
  check('one in five turns up with something in its mouth', held > 150 && held < 250 && kinds.size === 7 && [...kinds].every((k) => allowed.includes(k)), `${held} ${[...kinds]}`);
}
{
  // dropped when it dies; saved
  const { level } = makeLevel('taiga');
  playerAt(level, 40, 64, 40, 'creative');
  level.gameRules.doMobLoot = false;
  const d = mobAt(level, 'fox', 0, 64, 0);
  d.setItemSlot('mainhand', stack('emerald'));
  d.hurt(100, 'generic');
  settle(level, 2);
  let drops = level.entities.filter((e) => e.type === 'item');
  check('killed, it drops what it had in its mouth (whatever doMobLoot says)', drops.length === 1 && drops[0].stack.item.id === 'emerald' && !d.mainHand);
  level.gameRules.doMobLoot = true;
  const e = mobAt(level, 'fox', 6, 64, 6);
  e.setItemSlot('mainhand', null);
  e.hurt(100, 'generic');
  settle(level, 2);
  drops = level.entities.filter((x) => x.type === 'item');
  check('...and nothing else', drops.length === 1);
  const sv = mobAt(level, 'fox', 8, 64, -8);
  sv.setItemSlot('mainhand', stack('rabbit_foot'));
  const back = spawner.createMob('fox', level);
  back.load(JSON.parse(JSON.stringify(sv.save())));
  check('what it has in its mouth is saved', back.mainHand?.item.id === 'rabbit_foot' && back.canPickUpLoot);
}
{
  // berries
  const { world, level, sounds } = makeLevel('taiga');
  playerAt(level, 40, 64, 40, 'creative');
  level.dayTime = 14000;
  world.setState(3, 64, 0, blockMod.getBlock('sweet_berry_bush').state({ age: 3 }));
  const b = mobAt(level, 'fox', 0, 64, 0);
  b.setItemSlot('mainhand', null);
  let got = -1;
  for (let i = 0; i < 1500 && got < 0; i++) { level.tick(); if (b.mainHand?.item.id === 'sweet_berries') got = i; }
  const st = world.getState(3, 64, 0);
  const loose = level.entities.filter((e) => e.type === 'item' && e.stack.item.id === 'sweet_berries').reduce((n, e) => n + e.stack.count, 0);
  check('it picks a ripe sweet berry bush: a berry in its mouth, one or two more left lying, the bush back to age 1', got >= 0 && BLOCKS[STATE_BLOCK[st]].get(st, 'age') === 1 && loose >= 1 && loose <= 2 && sounds.some((x) => x.n === 'block.sweet_berry_bush.pick_berries'), `${got} ${loose}`);
  const { world: w2, level: l2 } = makeLevel('taiga');
  playerAt(l2, 40, 64, 40, 'creative');
  l2.dayTime = 14000;
  w2.setState(3, 65, 3, S('stone'));
  w2.setState(3, 64, 3, blockMod.getBlock('cave_vines').state({ berries: true }));
  const v = mobAt(l2, 'fox', 0, 64, 0);
  v.setItemSlot('mainhand', null);
  got = -1;
  for (let i = 0; i < 2500 && got < 0; i++) { l2.tick(); if (v.mainHand?.item.id === 'glow_berries') got = i; }
  const vs = w2.getState(3, 64, 3);
  check('...and glow berries off the vines, taking up the berry that falls', got >= 0 && BLOCKS[STATE_BLOCK[vs]].get(vs, 'berries') === false, String(got));
}

// --- looks and sounds
{
  const def = FR.foxModel();
  const parts = [...def.root.children.keys()].sort().join(',');
  const kids = (k) => [...def.root.child(k).children.keys()].sort().join(',');
  check('the model: FoxModel\'s head (ears and snout on it), body (the tail on it) and four legs, 48x32', parts === 'body,head,left_front_leg,left_hind_leg,right_front_leg,right_hind_leg' && kids('head') === 'left_ear,nose,right_ear' && kids('body') === 'tail' && def.texW === 48 && def.texH === 32, parts);
  // drawn as the dispatcher's drawModel does it: where its top and its feet are, in blocks (y down)
  const extent = (baby) => {
    const pose = new ER.PoseStack();
    let lo = Infinity, hi = -Infinity, n = 0;
    const batch = { quad(ps, p) { const m = ps.m; for (let i = 0; i < 12; i += 3) { const y = m[1] * p[i] + m[5] * p[i + 1] + m[9] * p[i + 2] + m[13]; lo = Math.min(lo, y); hi = Math.max(hi, y); } n++; } };
    if (!baby) def.root.render(batch, pose, def.texW, def.texH);
    else {
      const bd = def.baby;
      pose.push(); pose.scale(0.75, 0.75, 0.75); pose.translate(0, bd.yHead / 16, bd.zHead / 16); def.root.child('head').render(batch, pose, def.texW, def.texH); pose.pop();
      pose.push(); pose.scale(0.5, 0.5, 0.5); pose.translate(0, bd.bodyY / 16, 0);
      for (const [k, c] of def.root.children) if (k !== 'head') c.render(batch, pose, def.texW, def.texH);
      pose.pop();
    }
    return [lo, hi, n];
  };
  const { level } = makeLevel('taiga');
  const f = spawner.createMob('fox', level);
  const still = { limbSwing: 0, limbAmount: 0, age: 0, headYaw: 0, headPitch: 0 };
  FR.animateFox(def.root, f, still, 0, 0);
  const [top, feet, quads] = extent(false);
  check('standing on the ground, its ears a little under half a block up', near(feet, 1.5, 0.01) && near(top, 0.78125, 0.01) && quads === 10 * 6, `${top.toFixed(3)}..${feet.toFixed(3)} ${quads}`);
  const [btop, bfeet] = extent(true);
  check('a cub: its head big on a small body, on the ground too', near(bfeet, 1.5, 0.01) && 1.5 - btop < 1.5 - top && 1.5 - btop > (1.5 - top) / 2, `${btop.toFixed(3)}..${bfeet.toFixed(3)}`);
  const P = (k) => def.root.find(k);
  const deg = (x) => x / (Math.PI / 180);
  FR.animateFox(def.root, f, { limbSwing: 0, limbAmount: 1, age: 0, headYaw: 20, headPitch: -10 }, 0, 0);
  check('trotting, its legs swing in pairs; its head follows its gaze', near(P('right_hind_leg').xRot, 1.4, 1e-6) && near(P('left_hind_leg').xRot, -1.4, 1e-6) && near(P('right_front_leg').xRot, -1.4, 1e-6) && near(P('left_front_leg').xRot, 1.4, 1e-6) && near(deg(P('head').yRot), 20, 1e-6) && near(deg(P('head').xRot), -10, 1e-6));
  f.setIsCrouching(true); f.crouchAmount = f.crouchAmountO = 3; f.setIsInterested(true); f.interestedAngle = f.interestedAngleO = 1;
  FR.animateFox(def.root, f, { ...still, headYaw: 30 }, 1, 0);
  check('crouched: its body tipped forward and down, its head lowered and cocked, not turned', near(P('body').xRot, 1.6755161, 1e-6) && near(P('body').y, 19, 1e-6) && near(P('head').y, 19.5, 1e-6) && near(P('head').zRot, 0.11 * Math.PI, 1e-6) && P('head').yRot === 0);
  f.setIsCrouching(false); f.setIsInterested(false); f.interestedAngle = f.interestedAngleO = 0;
  f.setSleeping(true);
  FR.animateFox(def.root, f, still, 0, 0);
  check('asleep: on its side, legs tucked away, its head turned back, the tail curled over', near(P('body').zRot, -Math.PI / 2, 1e-6) && near(P('body').y, 21, 1e-6) && !P('right_hind_leg').visible && !P('left_front_leg').visible && near(P('head').yRot, -Math.PI * 2 / 3, 1e-6) && near(P('tail').xRot, -Math.PI * 5 / 6, 1e-6) && FR.foxTexture(f) === 'fox_sleep');
  f.setSleeping(false);
  f.setSitting(true);
  FR.animateFox(def.root, f, still, 0, 0);
  check('sitting: propped up, its hind legs folded, its legs back out after sleeping', near(P('body').xRot, Math.PI / 6, 1e-6) && near(P('body').y, 9, 1e-6) && near(P('right_hind_leg').xRot, -Math.PI * 5 / 12, 1e-6) && near(P('left_front_leg').xRot, -Math.PI / 12, 1e-6) && P('right_hind_leg').visible && P('left_front_leg').visible && near(P('tail').z, -2, 1e-6));
  f.setSitting(false);
  f.setFaceplanted(true);
  FR.animateFox(def.root, f, { ...still, headYaw: 30 }, 0, 0);
  const kick0 = P('right_hind_leg').xRot;
  FR.animateFox(def.root, f, { ...still, headYaw: 30 }, 0, 0.67 * 5);
  check('nose in the snow, its legs kick', near(kick0, 0.1, 1e-6) && !near(P('right_hind_leg').xRot, kick0, 1e-3) && P('head').yRot === 0);
  f.setFaceplanted(false);
  FR.animateFox(def.root, f, still, 0, 0);
  check('...and it all comes back as it was', near(P('body').xRot, Math.PI / 2, 1e-6) && near(P('body').zRot, 0, 1e-9) && near(P('tail').z, -1, 1e-6) && near(P('head').y, 16.5, 1e-6) && near(P('tail').xRot, -0.05235988, 1e-7));
  f.setVariant(1);
  check('the skins: red or snow, asleep or not', FR.foxTexture(f) === 'snow_fox' && (f.setSleeping(true), FR.foxTexture(f)) === 'snow_fox_sleep');
  f.setSleeping(false);
  check('its shadow', FR.FOX_SHADOW_RADII.fox === 0.4);
  // the skins: each part's faces painted; the sleeping skin the same but for the eyes
  const cubes = [];
  const walk = (p) => { for (const c of p.cubes) cubes.push(c); for (const k of p.children.values()) walk(k); };
  walk(def.root);
  const skins = {};
  for (const n of ['fox', 'fox_sleep', 'snow_fox', 'snow_fox_sleep']) skins[n] = T.MOB_TEXTURES[n]?.();
  let painted = 0;
  for (const t of Object.values(skins)) {
    if (!t || t.w !== 48 || t.h !== 32) continue;
    let holes = 0;
    for (const c of cubes) {
      const fs = [[c.u + c.d, c.v, c.w, c.d], [c.u + c.d + c.w, c.v, c.w, c.d], [c.u, c.v + c.d, c.d, c.h], [c.u + c.d, c.v + c.d, c.w, c.h], [c.u + c.d + c.w, c.v + c.d, c.d, c.h], [c.u + 2 * c.d + c.w, c.v + c.d, c.w, c.h]];
      for (const [x0, y0, w, h] of fs) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (t.data[(y * 48 + x) * 4 + 3] !== 255) holes++;
    }
    if (holes === 0) painted++;
  }
  check('four skins, 48x32, every face painted', painted === 4, String(painted));
  const diff = (a, b) => { const out = []; for (let i = 0; i < 48 * 32; i++) for (let k = 0; k < 4; k++) if (a.data[i * 4 + k] !== b.data[i * 4 + k]) { out.push(`${i % 48},${Math.floor(i / 48)}`); break; } return out; };
  const d1 = diff(skins.fox, skins.fox_sleep), d2 = diff(skins.snow_fox, skins.snow_fox_sleep);
  check('asleep, only its eyes differ: shut', d1.join(' ') === '8,13 9,13 12,13 13,13' && d2.join(' ') === d1.join(' '), d1.join(' '));
  check('the red fox and the snow fox differ', diff(skins.fox, skins.snow_fox).length > 500);
  // the sounds
  const own = { ambient: 4, aggro: 4, bite: 3, death: 2, eat: 3, hurt: 4, screech: 4, sleep: 4, sniff: 4, spit: 3, teleport: 3 };
  let good = 0;
  const bad = [];
  for (const [k, n] of Object.entries(own)) {
    const g = A.SOUNDS['entity.fox.' + k];
    if (!g || g.variants !== n) { bad.push(k); continue; }
    let ok = true;
    for (let i = 0; i < n; i++) {
      const b = g.generate(i, 44100);
      let peak = 0, finite = true;
      for (const x of b) { if (!Number.isFinite(x)) finite = false; peak = Math.max(peak, Math.abs(x)); }
      if (!finite || peak < 0.2 || b.length < 1000 || b.length > 44100 * 2) ok = false;
    }
    if (ok) good++; else bad.push(k);
  }
  check('its sounds, every take heard', good === 11, bad.join(','));
  // the spawn egg
  check('a spawn egg, its colours vanilla\'s', !!itemMod.ITEMS.get('fox_spawn_egg') && !!T.SPAWN_EGG_TEXTURES.fox_spawn_egg && !!spawner.MOB_TYPES['fox_spawn_egg'.slice(0, -10)]);
  // what it holds, and its leap: drawn through a stand-in for the dispatcher
  const drawn = [], turns = [];
  const kit = {
    pose: new ER.PoseStack(), items: { render: (_b, _p, st, ctx) => drawn.push(`${st.item.id}:${ctx}`) }, tex: () => ({}),
    setupLiving: (_e, _x, _y, _z, _p, _flip, scale) => { scale?.({ rotX: (d) => turns.push(d) }); return still; },
    overlay() {}, drawBody() {}, drawModel() {}, state() {}, attackAnim: () => 0,
  };
  const rend = new FR.FoxRenderers(kit);
  const b = { setOverlay() {} };
  const g = spawner.createMob('fox', level);
  g.setItemSlot('mainhand', null);
  rend.render(b, g, 0, 0, 0, 0);
  g.setItemSlot('mainhand', stack('rabbit_foot'));
  g.setSleeping(true);
  rend.render(b, g, 0, 0, 0, 0);
  g.setSleeping(false);
  g.setIsPouncing(true); g.pitch = g.pitchO = 40;
  rend.render(b, g, 0, 0, 0, 0);
  check('what it has in its mouth is drawn in its jaws, asleep or awake', drawn.join(' ') === 'rabbit_foot:ground rabbit_foot:ground', drawn.join(' '));
  check('pouncing, it\'s pitched along its leap', turns.join(' ') === '40', turns.join(' '));
  check('not a rabbit or anything else', rend.render(b, spawner.createMob('rabbit', level), 0, 0, 0, 0) === false);
  // the crumbs of what it eats
  const pe = new PT.ParticleEngine({ sprites: {} }, null, () => 0xffffff);
  pe.spawn('item_sweet_berries', 0, 64, 0, 0, 0.1, 0);
  check('crumbs of any food it eats', pe.sprites.length === 1 && pe.sprites[0].frames[0] === 'item_sweet_berries' && pe.sprites[0].gravity === 1);
  const foods = [...itemMod.ITEMS.values()].filter((it) => it.food);
  check('...each food with a sprite of its own', foods.length > 30 && foods.every((it) => !!TI.ITEM_TEXTURES[it.texture]), foods.filter((it) => !TI.ITEM_TEXTURES[it.texture]).map((it) => it.id).join(','));
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

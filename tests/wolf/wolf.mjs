// Headless checks for wolves (node tests/wolf/wolf.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/entity/wolf.ts', '/src/world/gen/biomes.ts',
  '/src/game/advancements.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, W, biomes, adv] = mods;
const { ItemStack } = itemMod;
const { S } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

/** flat grass at y=63 (standing at 64) over stone, a pond of water at [pond] */
function makeLevel({ biome = 'forest', dayTime = 6000, pond = null } = {}) {
  const world = new worldMod.World();
  for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) {
    const c = new chunkMod.Chunk(cx, cz);
    c.biomes.fill(biomes.BIOME_ID[biome]);
    world.chunks.set(c.key, c);
  }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  level.sound = { play: (n) => sounds.push(n), playUI() {} };
  level.particles = { spawn() {}, blockBreak() {}, spell() {}, poof() {}, entityEffect() {} };
  const st = S('stone'), gs = S('grass_block'), w = S('water');
  for (let x = -60; x <= 60; x++) for (let z = -60; z <= 60; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 55; y <= 62; y++) c.setState(x & 15, y, z & 15, st);
    const wet = pond && x >= pond[0] && x <= pond[1] && z >= pond[2] && z <= pond[3];
    c.setState(x & 15, 63, z & 15, wet ? w : gs);
    if (wet) c.setState(x & 15, 62, z & 15, w);
    c.heightmap[((z & 15) << 4) | (x & 15)] = 64;
  }
  level.dayTime = dayTime;
  level.difficulty = 'normal';
  return { world, level, sounds };
}
const mobAt = (level, type, x, y, z) => { const m = spawner.createMob(type, level); m.moveTo(x + 0.5, y, z + 0.5, 0, 0); m.finalizeSpawn('egg'); level.addEntity(m); return m; };
function playerAt(level, x, y, z, mode = 'survival') {
  const p = new playerMod.Player(level);
  p.gameMode = mode;
  p.moveTo(x + 0.5, y, z + 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  return p;
}
const hold = (p, id, n = 64) => p.inventory.setSelectedItem(id ? ItemStack.of(id, n) : null);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const tameTo = (w, p) => { w.tameBy(p); w.orderedToSit = false; };
/** let everything land and the goal selectors settle (they look every other tick) */
const settle = (level, n = 20) => { for (let i = 0; i < n; i++) level.tick(); };

// --- registered
{
  check('registered, with a spawn egg and a name', !!spawner.MOB_TYPES.wolf && !!itemMod.ITEMS.get('wolf_spawn_egg') && spawner.entityDisplayName('wolf') === 'Wolf');
  const { level } = makeLevel();
  const w = mobAt(level, 'wolf', 0, 64, 0);
  check('0.6 x 0.85, 8 health, speed 0.3, bites for 4', w instanceof W.Wolf && Math.abs(w.width - 0.6) < 1e-6 && Math.abs(w.height - 0.85) < 1e-6 && w.maxHealth === 8 && w.moveSpeedAttr === 0.3 && w.attackDamage === 4);
  check('a forest wolf is a woods wolf', w.variant.id === 'woods');
}

// --- coats by biome (vanilla WolfVariants), packs share one and have no pups
{
  const want = { taiga: 'pale', forest: 'woods', snowy_taiga: 'ashen', old_growth_pine_taiga: 'black', old_growth_spruce_taiga: 'chestnut', grove: 'snowy', sparse_jungle: 'rusty', savanna_plateau: 'spotted', wooded_badlands: 'striped', plains: 'pale' };
  const got = Object.fromEntries(Object.keys(want).map((b) => [b, W.wolfSpawnVariant(b).id]));
  check('each biome gives its coat (pale elsewhere)', Object.keys(want).every((b) => got[b] === want[b]), JSON.stringify(got));
  const { level } = makeLevel({ biome: 'savanna_plateau' });
  const group = {};
  const pack = [];
  for (let i = 0; i < 8; i++) { const w = spawner.createMob('wolf', level); w.moveTo(i, 64, 0, 0, 0); w.finalizeSpawn('natural', group); pack.push(w); }
  check('a pack of eight shares one coat, and none is a pup', pack.every((w) => w.variant.id === 'spotted' && !w.isBaby()));
  check('up to eight spawn in one go (vanilla getMaxSpawnClusterSize)', pack[0].maxSpawnClusterSize() === 8);
}

// --- where wolves spawn
{
  const { level } = makeLevel();
  check('on grass in daylight', W.wolfSpawnRulesOk(level, 5, 64, 5));
  level.world.getChunk(0, 0).setState(5, 63, 5, S('stone'));
  check('not on stone', !W.wolfSpawnRulesOk(level, 5, 64, 5));
  const lists = ['forest', 'taiga', 'grove', 'savanna_plateau', 'sparse_jungle', 'wooded_badlands', 'plains', 'birch_forest'].map((b) => {
    const { level } = makeLevel({ biome: b });
    const sp = new spawner.NaturalSpawner(level);
    const e = sp['mobsAt']('creature', 0, 64, 0).find((d) => d.type === 'wolf');
    return e ? `${b}:${e.weight}/${e.min}-${e.max}` : `${b}:-`;
  });
  check('the biomes that have wolves, weights and pack sizes', lists.join(' ') === 'forest:5/4-4 taiga:8/4-4 grove:1/1-1 savanna_plateau:8/4-8 sparse_jungle:8/2-4 wooded_badlands:2/4-8 plains:- birch_forest:-', lists.join(' '));
}

// --- taming with bones
{
  const { level } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  const tamed = [];
  level.onTamed = (a, by) => tamed.push([a.type, a.variantId(), by === p]);
  let wins = 0, bones = 0;
  const n = 600;
  for (let i = 0; i < n; i++) {
    const w = mobAt(level, 'wolf', 3, 64, 0);
    hold(p, 'bone', 64);
    while (!w.isTame()) { w.interact(p, p.inventory.selectedItem); bones++; if (bones > 100000) break; }
    wins++;
    w.remove();
  }
  const rate = n / bones;
  check('a bone wins one over one time in three', Math.abs(rate - 1 / 3) < 0.04, `rate=${rate.toFixed(3)}`);
  hold(p, 'bone', 5);
  const w = mobAt(level, 'wolf', 3, 64, 0);
  // (a bone wins it over one time in three, so all five can fail: hand over more rather than loop forever)
  for (let i = 0; !w.isTame() && i < 200; i++) {
    if (!p.inventory.selectedItem) hold(p, 'bone', 5);
    w.interact(p, p.inventory.selectedItem);
  }
  check('a tamed wolf is its owner\'s, sits down and has 40 health', w.ownerUUID === p.uuid && w.owner() === p && w.orderedToSit && w.maxHealth === 40 && w.health === 40);
  check('bones are used up', p.inventory.selectedItem === null || p.inventory.selectedItem.count < 5);
  check('the taming trigger says who and which coat', tamed.length > 0 && tamed.at(-1)[0] === 'wolf' && tamed.at(-1)[1] === 'woods' && tamed.at(-1)[2]);
  const a = new adv.PlayerAdvancements();
  const done = (id) => a.isDone(adv.ADVANCEMENTS.get(id));
  a.trigger('tame', { tame: { type: 'wolf', variant: 'woods' } });
  check('Best Friends Forever, and a step towards The Whole Pack', done('husbandry/tame_an_animal') && !done('husbandry/whole_pack'));
  for (const v of ['ashen', 'black', 'chestnut', 'pale', 'rusty', 'snowy', 'spotted', 'striped']) a.trigger('tame', { tame: { type: 'wolf', variant: v } });
  check('all nine coats: The Whole Pack', done('husbandry/whole_pack'));
  const angry = mobAt(level, 'wolf', 6, 64, 0);
  angry.setTarget(p);
  level.tick();
  hold(p, 'bone', 5);
  angry.interact(p, p.inventory.selectedItem);
  check('an angry wolf won\'t take a bone', !angry.isTame() && p.inventory.selectedItem.count === 5);
}

// --- a tame wolf: sitting, feeding, the collar, standing up when hurt
{
  const { level } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  const w = mobAt(level, 'wolf', 2, 64, 0);
  tameTo(w, p);
  settle(level);
  hold(p, null);
  w.interact(p, null);
  settle(level, 4);
  check('clicking it tells it to sit', w.orderedToSit && w.inSittingPose);
  w.interact(p, null);
  settle(level, 4);
  check('and to stand', !w.orderedToSit && !w.inSittingPose);
  w.health = 20;
  hold(p, 'cooked_beef', 2);
  w.interact(p, p.inventory.selectedItem);
  check('meat heals it by twice its food (steak: 16)', w.health === 36 && p.inventory.selectedItem.count === 1);
  hold(p, 'blue_dye', 2);
  w.interact(p, p.inventory.selectedItem);
  check('dye colours its collar', w.collarColor === 11 && p.inventory.selectedItem.count === 1);
  w.orderedToSit = true;
  w.hurt(1, 'cactus');
  check('being hurt gets it up', !w.orderedToSit);
  check('a tame wolf looks tame (even angry), a wild one angry while it is', w.texture() === 'wolf_woods_tame');
  const wild = mobAt(level, 'wolf', 8, 64, 8);
  wild.angerTime = 100;
  check('a wild one looks angry while it is', wild.texture() === 'wolf_woods_angry');
  const saved = spawner.loadEntity(w.save(), level);
  check('saved and loaded: owner, collar, coat, health', saved.ownerUUID === p.uuid && saved.isTame() && saved.collarColor === 11 && saved.variant.id === 'woods' && saved.maxHealth === 40);
}

// --- following its owner, and turning up beside it
{
  const { level } = makeLevel();
  const p = playerAt(level, 0, 64, 0, 'creative');
  const w = mobAt(level, 'wolf', 0, 64, 2);
  tameTo(w, p);
  settle(level);
  p.moveTo(9.5, 64, 0.5, 0, 0);
  settle(level, 40);
  check('within ten blocks it stays put', dist(w, p) > 6);
  p.moveTo(12.5, 64, 0.5, 0, 0);
  let near = -1;
  for (let t = 0; t < 200 && near < 0; t++) { level.tick(); if (dist(w, p) < 4.5) near = t; }
  check('it comes after its owner', near > 0, `t=${near}`);
  p.moveTo(40.5, 64, 0.5, 0, 0);
  let tp = -1;
  for (let t = 0; t < 60 && tp < 0; t++) { level.tick(); if (dist(w, p) < 4.5) tp = t; }
  check('twelve blocks behind, it turns up beside its owner', tp >= 0 && tp < 30, `t=${tp} d=${dist(w, p).toFixed(1)}`);
  w.orderedToSit = true;
  p.moveTo(10.5, 64, 30.5, 0, 0);
  for (let t = 0; t < 60; t++) level.tick();
  check('told to sit, it stays', dist(w, p) > 20);
}

// --- fighting for its owner
{
  const { level } = makeLevel({ dayTime: 18000 });
  const p = playerAt(level, 0, 64, 0);
  const w = mobAt(level, 'wolf', 2, 64, 0);
  tameTo(w, p);
  const z = mobAt(level, 'zombie', 6, 64, 0);
  z.persistenceRequired = true;
  settle(level);
  p.hurt(2, 'mob', z);
  for (let t = 0; t < 5; t++) level.tick();
  check('it goes for whatever hurts its owner', w.target === z);
  z.remove();
  const cow = mobAt(level, 'cow', 0, 64, 5);
  p.lastHurtMob = cow;
  for (let t = 0; t < 5; t++) level.tick();
  check('and for whatever its owner hits', w.target === cow);
  w.setTarget(null);
  const creeper = mobAt(level, 'creeper', 0, 64, -5);
  p.lastHurtMob = creeper;
  for (let t = 0; t < 5; t++) level.tick();
  check('but never a creeper', w.target !== creeper);
  let bitten = false;
  w.setTarget(cow);
  for (let t = 0; t < 200 && cow.isAlive; t++) { level.tick(); if (cow.health < 10) bitten = true; }
  check('and bites it', bitten);
}

// --- wild wolves: hunting, and the pack turning on whoever hurts one
{
  const { level } = makeLevel();
  const p = playerAt(level, 30, 64, 30);
  const w = mobAt(level, 'wolf', 0, 64, 0);
  const sheep = mobAt(level, 'sheep', 5, 64, 0);
  let hunting = false;
  for (let t = 0; t < 400 && !hunting; t++) { level.tick(); hunting = w.target === sheep; }
  check('a wild wolf hunts sheep, angry while it does', hunting && w.isAngry());
  const tame = mobAt(level, 'wolf', 0, 64, 10);
  tameTo(tame, p);
  tame.orderedToSit = false;
  let tameHunts = false;
  for (let t = 0; t < 400; t++) { level.tick(); if (tame.target === sheep) tameHunts = true; }
  check('a tame one doesn\'t', !tameHunts);
  const skel = mobAt(level, 'skeleton', 0, 64, 20);
  const w2 = mobAt(level, 'wolf', 0, 64, 17);
  let chases = false;
  for (let t = 0; t < 100 && !chases; t++) { level.tick(); chases = w2.target === skel; }
  check('wolves go for skeletons', chases);

  const { level: l2 } = makeLevel();
  const p2 = playerAt(l2, 0, 64, 0);
  const pack = [0, 1, 2].map((i) => mobAt(l2, 'wolf', 3 + i, 64, 3));
  settle(l2);
  pack[0].hurt(1, 'player', p2);
  settle(l2, 4);
  check('hurt one and the pack turns on you', pack.every((w) => w.target === p2), pack.map((w) => w.target?.type).join());
  check('angry for 20 to 39 seconds', pack[0].angerTime > 380 && pack[0].angerTime <= 780, `t=${pack[0].angerTime}`);
  check('growling', pack[0].ambientSound() === 'entity.wolf.growl');
}

// --- getting wet and shaking dry
{
  const { level, sounds } = makeLevel({ pond: [4, 8, -2, 2] });
  const p = playerAt(level, 30, 64, 30);
  const w = mobAt(level, 'wolf', 6, 63, 0);
  for (let t = 0; t < 10; t++) level.tick();
  check('in water it gets wet', w.wet);
  w.moveTo(0.5, 64, 10.5, 0, 0);
  let started = -1, dry = -1;
  for (let t = 0; t < 200 && dry < 0; t++) { level.tick(); w.navigation.stop(); if (started < 0 && w.shaking) started = t; if (started >= 0 && !w.wet) dry = t; }
  check('out on the ground, standing still, it shakes itself dry in two seconds', started >= 0 && dry - started >= 38 && dry - started <= 43, `start=${started} dry=${dry}`);
  check('with the shake sound', sounds.includes('entity.wolf.shake'));
  check('a wet coat is darker, lighter as it shakes', w.wetShade(0) === 0.75);
}

// --- the tail tells how it is
{
  const { level } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  const w = mobAt(level, 'wolf', 2, 64, 0);
  const wild = w.tailAngle();
  tameTo(w, p);
  const full = w.tailAngle();
  w.health = 10;
  const hurt = w.tailAngle();
  w.angerTime = 5;
  check('tail: wild π/5, tame 0.55π, drooping when hurt, up when angry', Math.abs(wild - Math.PI / 5) < 1e-6 && Math.abs(full - 0.55 * Math.PI) < 1e-6 && hurt < full && Math.abs(w.tailAngle() - 1.5393804) < 1e-6);
  check('a hurt tame wolf whines now and then', (() => { w.angerTime = 0; const s = new Set(); for (let i = 0; i < 200; i++) s.add(w.ambientSound()); return s.has('entity.wolf.whine') && !s.has('entity.wolf.pant'); })());
}

// --- pups
{
  const { level } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  const a = mobAt(level, 'wolf', 2, 64, 0), b = mobAt(level, 'wolf', 3, 64, 0);
  a.variant = W.WOLF_VARIANTS[0];
  b.variant = W.WOLF_VARIANTS[3];
  tameTo(a, p);
  tameTo(b, p);
  a.collarColor = 1;
  b.collarColor = 5;
  hold(p, 'beef', 4);
  a.interact(p, p.inventory.selectedItem);
  b.interact(p, p.inventory.selectedItem);
  let pup = null;
  for (let t = 0; t < 300 && !pup; t++) { level.tick(); pup = level.entities.find((e) => e.type === 'wolf' && e.isBaby()) ?? null; }
  check('two tame wolves fed meat have a pup', !!pup);
  check('the pup is theirs: tame, the owner\'s, a parent\'s coat and collar', !!pup && pup.isTame() && pup.ownerUUID === p.uuid && ['pale', 'black'].includes(pup.variant.id) && [1, 5].includes(pup.collarColor));
  const c = mobAt(level, 'wolf', 6, 64, 6), d = mobAt(level, 'wolf', 7, 64, 6);
  c.setInLove(p);
  d.setInLove(p);
  check('wild wolves won\'t mate', !c.canMate(d));
}

// --- its owner hears how it died
{
  const { level } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  const w = mobAt(level, 'wolf', 2, 64, 0);
  tameTo(w, p);
  const told = [];
  level.onTamedDeath = (a, src) => told.push(src);
  w.hurt(100, 'lava');
  check('its owner is told', told.length === 1 && told[0] === 'lava');
}

await close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);

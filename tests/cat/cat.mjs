// Headless checks for cats (node tests/cat/cat.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 400000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/entity/cat.ts', '/src/world/gen/biomes.ts',
  '/src/game/advancements.ts', '/src/game/catSpawner.ts', '/src/inventory/recipes.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, C, biomes, adv, cs, recipes] = mods;
const { ItemStack } = itemMod;
const { S, BLOCKS } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

/** flat grass at y=63 (standing at 64) over stone; the third day by default (a half moon, not a full one) */
function makeLevel({ biome = 'plains', dayTime = 2 * 24000 + 6000 } = {}) {
  const world = new worldMod.World();
  for (let cx = -5; cx <= 5; cx++) for (let cz = -5; cz <= 5; cz++) {
    const c = new chunkMod.Chunk(cx, cz);
    c.biomes.fill(biomes.BIOME_ID[biome]);
    world.chunks.set(c.key, c);
  }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  level.sound = { play: (n) => sounds.push(n), playUI() {} };
  level.particles = { spawn() {}, blockBreak() {}, spell() {}, poof() {}, entityEffect() {}, blockParticle() {} };
  const st = S('stone'), gs = S('grass_block');
  for (let x = -80; x <= 80; x++) for (let z = -80; z <= 80; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 55; y <= 62; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, gs);
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
const settle = (level, n = 20) => { for (let i = 0; i < n; i++) level.tick(); };
const tameTo = (c, p) => { c.tameBy(p); c.orderedToSit = false; };
const block = (name, props = {}) => { const b = BLOCKS.find((x) => x.name === name); let st = S(name); for (const [k, v] of Object.entries(props)) st = b.with(st, k, v); return st; };
const nameAt = (w, x, y, z) => BLOCKS[blockMod.STATE_BLOCK[w.getState(x, y, z)]].name;
/** a bed with its foot at (x, y, z), the head one block towards `facing`; returns the head */
function bedAt(level, x, y, z, facing = 'south') {
  const [dx, dz] = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }[facing];
  level.world.setState(x, y, z, block('red_bed', { facing, part: 'foot' }));
  level.world.setState(x + dx, y, z + dz, block('red_bed', { facing, part: 'head' }));
  return [x + dx, y, z + dz];
}
const on = (c, x, z) => Math.floor(c.x) === x && Math.floor(c.z) === z;

// --- registered
{
  check('registered, with a spawn egg and a name', !!spawner.MOB_TYPES.cat && !!itemMod.ITEMS.get('cat_spawn_egg') && spawner.entityDisplayName('cat') === 'Cat');
  const { level } = makeLevel();
  const c = mobAt(level, 'cat', 0, 64, 0);
  check('0.6 x 0.7, 10 health, speed 0.3, claws for 3', c instanceof C.Cat && Math.abs(c.width - 0.6) < 1e-6 && Math.abs(c.height - 0.7) < 1e-6 && c.maxHealth === 10 && c.moveSpeedAttr === 0.3 && c.attackDamage === 3);
  const leather = recipes.findRecipe(Array(4).fill(null).map(() => ItemStack.of('rabbit_hide', 1)), 2, 2);
  check('rabbit hide is an item, and four make leather', !!itemMod.ITEMS.get('rabbit_hide') && leather?.result === 'leather', String(leather?.result));
}

// --- coats: any but the all-black; the all-black joins them under a full moon; the swamp hut's is always all-black
{
  const { level } = makeLevel();
  const seen = new Set();
  for (let i = 0; i < 400; i++) { const c = spawner.createMob('cat', level); c.moveTo(0.5, 64, 0.5, 0, 0); c.finalizeSpawn('natural'); seen.add(c.variant); }
  check('under a half moon, ten coats and never the all-black', seen.size === 10 && !seen.has('all_black'), [...seen].join(','));
  level.dayTime = 8 * 24000 + 18000;
  const full = new Set();
  for (let i = 0; i < 400; i++) { const c = spawner.createMob('cat', level); c.moveTo(0.5, 64, 0.5, 0, 0); c.finalizeSpawn('natural'); full.add(c.variant); }
  check('under a full moon, all eleven', full.size === 11 && full.has('all_black'));
  C.catHooks.inSwampHut = () => true;
  const hut = spawner.createMob('cat', level);
  hut.moveTo(0.5, 64, 0.5, 0, 0);
  hut.finalizeSpawn('structure');
  C.catHooks.inSwampHut = () => false;
  check('in a swamp hut: the all-black one, and it stays', hut.variant === 'all_black' && hut.persistenceRequired);
  const village = spawner.loadEntity({ id: 'cat', x: 0.5, y: 64, z: 0.5, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, health: 10, fire: 0, data: { variant: 'calico' } }, level);
  check('a village\'s cat keeps the coat its house gave it', village?.variant === 'calico');
  const old = spawner.loadEntity({ id: 'cat', x: 0.5, y: 64, z: 0.5, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, health: 10, fire: 0, data: { variant: 'minecraft:jellie' } }, level);
  check('(a namespaced coat id is read too)', old?.variant === 'jellie');
}

// --- taming: raw cod or salmon, one in three; it sits and it's yours
{
  const { level, sounds } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  const tamed = [];
  level.onTamed = (a, by) => tamed.push([a.type, a.variantId(), by === p]);
  let ok = 0;
  const n = 900;
  for (let i = 0; i < n; i++) {
    const c = mobAt(level, 'cat', 2, 64, 0);
    hold(p, 'cod', 10);
    c.interact(p, p.inventory.selectedItem);
    if (c.isTame()) ok++;
    c.remove();
  }
  check('one fish in three (vanilla nextInt(3) == 0)', Math.abs(ok / n - 1 / 3) < 0.05, (ok / n).toFixed(3));
  const c = mobAt(level, 'cat', 3, 64, 0);
  hold(p, 'salmon', 20);
  while (!c.isTame() && p.inventory.selectedItem) c.interact(p, p.inventory.selectedItem);
  check('a tamed cat is its owner\'s and sits down, still 10 health', c.owner() === p && c.orderedToSit && c.maxHealth === 10);
  check('the fish are eaten (with a crunch)', p.inventory.selectedItem.count < 20 && sounds.includes('entity.cat.eat'));
  check('the taming trigger says which coat', tamed.at(-1)?.[0] === 'cat' && tamed.at(-1)?.[1] === c.variant && tamed.at(-1)?.[2]);
  const other = mobAt(level, 'cat', 5, 64, 0);
  hold(p, 'bone', 5);
  other.interact(p, p.inventory.selectedItem);
  hold(p, 'cooked_cod', 5);
  other.interact(p, p.inventory.selectedItem);
  check('bones and cooked fish do nothing', !other.isTame() && p.inventory.selectedItem.count === 5);
  const a = new adv.PlayerAdvancements();
  const done = (id) => a.isDone(adv.ADVANCEMENTS.get(id));
  for (const v of C.CAT_VARIANTS.slice(0, 10)) a.trigger('tame', { tame: { type: 'cat', variant: v } });
  check('ten coats isn\'t A Complete Catalogue yet', done('husbandry/tame_an_animal') && !done('husbandry/complete_catalogue'));
  a.trigger('tame', { tame: { type: 'cat', variant: 'all_black' } });
  check('all eleven is', done('husbandry/complete_catalogue'));
}

// --- the owner's cat: sits and stands when told, heals on fish, takes dye
{
  const { level } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  const c = mobAt(level, 'cat', 3, 64, 0);
  tameTo(c, p);
  settle(level);
  hold(p, null);
  c.interact(p, null);
  settle(level, 6);
  check('clicking it tells it to sit', c.orderedToSit && c.inSittingPose);
  c.interact(p, null);
  settle(level, 6);
  check('and to get up', !c.orderedToSit && !c.inSittingPose);
  c.health = 4;
  hold(p, 'cod', 3);
  c.interact(p, p.inventory.selectedItem);
  check('a raw cod heals it by its food value (2)', c.health === 6 && p.inventory.selectedItem.count === 2, `${c.health}`);
  c.health = 10;
  c.interact(p, p.inventory.selectedItem);
  check('at full health, fish puts it in love (vanilla Animal.mobInteract)', p.inventory.selectedItem.count === 1 && c.isInLove());
  const sitting = c.orderedToSit;
  c.interact(p, p.inventory.selectedItem);
  check('in love already, more fish just toggles its sitting', p.inventory.selectedItem.count === 1 && c.orderedToSit !== sitting);
  c.inLove = 0;
  hold(p, 'blue_dye', 2);
  c.interact(p, p.inventory.selectedItem);
  check('dye colours its collar', c.collarColor === 11 && p.inventory.selectedItem.count === 1);
  const stranger = mobAt(level, 'cat', 6, 64, 0);
  check('a stray\'s collar is red (unseen)', stranger.collarColor === 14);
  const q = playerAt(level, 8, 64, 8);
  level.player = p;
  const before = c.orderedToSit;
  hold(q, null);
  c.interact(q, null);
  check('someone else can\'t tell it to sit', c.orderedToSit === before);
}

// --- a stray: shies away from players, creeps up on one standing still with fish
{
  const { level } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  const c = mobAt(level, 'cat', 6, 64, 0);
  settle(level, 5);
  let sprinted = false;
  for (let t = 0; t < 120; t++) { level.tick(); if (c.sprinting) sprinted = true; }
  check('it runs from a player (sprinting while near)', dist(c, p) > 9 && sprinted, dist(c, p).toFixed(1));
  const { level: l2 } = makeLevel();
  const cp = playerAt(l2, 0, 64, 0, 'creative');
  const c2 = mobAt(l2, 'cat', 6, 64, 0);
  let fled = false;
  for (let t = 0; t < 120; t++) { l2.tick(); if (c2.sprinting || c2.goalSelector.running().some((g) => g.constructor.name === 'CatAvoidPlayersGoal')) fled = true; }
  check('but not from one in creative', !fled, dist(c2, cp).toFixed(1));
  const { level: l3, sounds } = makeLevel();
  const p3 = playerAt(l3, 0, 64, 0, 'creative');
  hold(p3, 'cod', 5);
  const c3 = mobAt(l3, 'cat', 8, 64, 0);
  let crouched = false;
  for (let t = 0; t < 200; t++) { l3.tick(); if (c3.crouching) crouched = true; }
  check('a player with fish draws it in, creeping', dist(c3, p3) < 3.5 && crouched, dist(c3, p3).toFixed(1));
  check('and it begs for it', sounds.includes('entity.cat.beg_for_food'));
  // (a player who moves or turns within 6 blocks puts it off, mostly)
  let putOff = 0;
  for (let k = 0; k < 5; k++) {
    const { level: l4 } = makeLevel();
    const p4 = playerAt(l4, 0, 64, 0, 'creative');
    hold(p4, 'cod', 5);
    const c4 = mobAt(l4, 'cat', 5, 64, 0);
    settle(l4, 6);
    const tempt = c4.temptGoal;
    let was = tempt.isRunning, stopped = false;
    for (let i = 0; i < k * 5; i++) l4.random.nextFloat();
    for (let t = 0; t < 60; t++) {
      p4.yaw += 12;
      l4.tick();
      if (tempt.isRunning) was = true;
      else if (was) stopped = true;
    }
    if (stopped) putOff++;
  }
  check('a player turning about puts it off', putOff >= 4, `${putOff}/5`);
}

// --- a tame cat about the house: follows, lies on beds, sits on chests and lit furnaces
{
  const { level } = makeLevel();
  const p = playerAt(level, 0, 64, 0, 'creative');
  const c = mobAt(level, 'cat', 1, 64, 0);
  tameTo(c, p);
  settle(level);
  p.moveTo(14.5, 64, 0.5, 0, 0);
  let near = 99;
  for (let t = 0; t < 100; t++) { level.tick(); near = Math.min(near, dist(c, p)); }
  check('it follows its owner', near < 5, near.toFixed(1));

  const { level: lb } = makeLevel();
  const pb = playerAt(lb, -2, 64, -2, 'creative');
  const cb = mobAt(lb, 'cat', 0, 64, 0);
  tameTo(cb, pb);
  bedAt(lb, 4, 64, 2);
  let lay = false, sitBed = -1;
  for (let t = 0; t < 800; t++) { lb.tick(); if (cb.lying) lay = true; if (sitBed < 0 && cb.inSittingPose && on(cb, 4, 2)) sitBed = t; }
  check('by day it sits on the foot of a bed beside it, and doesn\'t lie on it', sitBed >= 0 && !lay, `t=${sitBed} ${lay}`);
  // (vanilla CatLieOnBedGoal looks from 3 below upwards, but its search order skips its own level: a bed 3 down it finds)
  const { level: lp } = makeLevel();
  const pp = playerAt(lp, -2, 64, -2, 'creative');
  const cp2 = mobAt(lp, 'cat', 0, 64, 0);
  tameTo(cp2, pp);
  for (let x = 3; x <= 5; x++) for (let z = 1; z <= 4; z++) for (let y = 61; y <= 63; y++) lp.world.setState(x, y, z, S('air'));
  bedAt(lp, 3, 61, 2, 'east');
  let lay3 = -1;
  // (it may land off the middle and try again 40 ticks on, as vanilla's MoveToBlockGoal does)
  let still = 0;
  for (let t = 0; t < 800 && lay3 < 0; t++) { lp.tick(); still = cp2.lying && cp2.onGround ? still + 1 : 0; if (still >= 20) lay3 = t; }
  check('a bed three blocks down, it goes and lies on', lay3 >= 0 && nameAt(lp.world, Math.floor(cp2.x), Math.floor(cp2.y), Math.floor(cp2.z)).endsWith('_bed'), `t=${lay3} ${cp2.x.toFixed(1)},${cp2.y.toFixed(2)},${cp2.z.toFixed(1)}`);
  check('curled up (the lie-down amount eases to 1)', cp2.lieDown(1) === 1 && cp2.lieDownTail(1) > 0.9);

  const { level: lc } = makeLevel();
  const pc = playerAt(lc, -2, 64, -2, 'creative');
  const cc = mobAt(lc, 'cat', 0, 64, 0);
  tameTo(cc, pc);
  lc.world.setState(3, 64, 3, block('chest', { facing: 'north' }));
  let sat = -1;
  for (let t = 0; t < 1200 && sat < 0; t++) { lc.tick(); if (cc.inSittingPose && on(cc, 3, 3)) sat = t; }
  check('a tame cat sits on a chest', sat >= 0, `t=${sat} ${cc.x.toFixed(1)},${cc.y.toFixed(2)},${cc.z.toFixed(1)}`);
  check('and the chest won\'t open under it', C.catSittingOn(lc, 3, 64, 3) && !C.catSittingOn(lc, 0, 64, 0));
  const be = lc.world.getBlockEntity(3, 64, 3);
  cc.orderedToSit = false;
  cc.inSittingPose = false;
  cc.moveTo(0.5, 64, 0.5, 0, 0);
  be.openCount = 1;
  let onOpen = false;
  for (let t = 0; t < 600; t++) { lc.tick(); if (cc.inSittingPose && on(cc, 3, 3)) onOpen = true; }
  check('but not on one someone has open', !onOpen);

  const { level: lf } = makeLevel();
  const pf = playerAt(lf, -2, 64, -2, 'creative');
  const cf = mobAt(lf, 'cat', 0, 64, 0);
  tameTo(cf, pf);
  lf.world.setState(-3, 64, 2, block('furnace', { lit: false }));
  lf.world.setState(3, 64, -2, block('furnace', { lit: true }));
  let onLit = false, onUnlit = false;
  for (let t = 0; t < 1200; t++) {
    lf.tick();
    if (cf.inSittingPose && on(cf, 3, -2)) onLit = true;
    if (cf.inSittingPose && on(cf, -3, 2)) onUnlit = true;
  }
  check('a lit furnace, never an unlit one', onLit && !onUnlit, `${onLit} ${onUnlit}`);
}

// --- bedtime: at its owner's feet, purring; a present in the morning
{
  let gifts = 0, nights = 0, curled = 0;
  const giftItems = new Set();
  const why = [];
  for (let n = 0; n < 30; n++) {
    const { level, sounds } = makeLevel({ dayTime: 2 * 24000 + 18000 });
    // (every level starts its random the same way: move each night's along)
    for (let i = 0; i < n * 7 + 3; i++) level.random.nextFloat();
    const p = playerAt(level, 0, 64, 0, 'survival');
    const head = bedAt(level, 0, 64, 3, 'south');
    const c = mobAt(level, 'cat', 3, 64, 0);
    tameTo(c, p);
    settle(level, 5);
    p.startSleeping(...head);
    let lay = false, relax = false;
    for (let t = 0; t < 99; t++) { level.tick(); if (c.lying) lay = true; if (c.relaxStateOne) relax = true; }
    if (lay && relax && sounds.includes('entity.cat.purr')) curled++;
    else why.push(`${lay}/${relax}/${c.x.toFixed(1)},${c.z.toFixed(1)}`);
    const before = level.entities.filter((e) => e.type === 'item').length;
    settle(level, 10);
    nights++;
    const items = level.entities.filter((e) => e.type === 'item');
    if (items.length > before) { gifts++; for (const i of items) giftItems.add(i.stack.item.id); }
  }
  check('it settles at its owner\'s feet, head up, then curled, purring', curled >= nights - 2, `${curled}/${nights} ${why.slice(0, 3).join(' ')}`);
  check('seven mornings in ten it leaves a present', gifts / nights > 0.45 && gifts / nights < 0.92, `${gifts}/${nights}`);
  check('the presents are from the morning gift table', giftItems.size > 0 && [...giftItems].every((i) => ['rabbit_hide', 'rabbit_foot', 'chicken', 'feather', 'rotten_flesh', 'string', 'phantom_membrane'].includes(i)), [...giftItems].join(','));
  // (only after a whole night: woken in the night, nothing)
  const { level } = makeLevel({ dayTime: 2 * 24000 + 18000 });
  const p = playerAt(level, 0, 64, 0, 'survival');
  const head = bedAt(level, 0, 64, 3, 'south');
  let early = 0;
  for (let k = 0; k < 10; k++) {
    const c = mobAt(level, 'cat', 3, 64, 0);
    tameTo(c, p);
    settle(level, 5);
    p.startSleeping(...head);
    settle(level, 60);
    const before = level.entities.filter((e) => e.type === 'item').length;
    p.stopSleepInBed(true);
    settle(level, 6);
    early += level.entities.filter((e) => e.type === 'item').length - before;
    c.remove();
  }
  check('woken in the night, no present', early === 0);
}

// --- creepers keep away; cats land on their feet; hunting; breeding; saving
{
  const { level } = makeLevel({ dayTime: 2 * 24000 + 18000 });
  const p = playerAt(level, -2, 64, -2, 'creative');
  const c = mobAt(level, 'cat', 0, 64, 0);
  tameTo(c, p);
  c.orderedToSit = true;
  const cr = mobAt(level, 'creeper', 4, 64, 0);
  let fled = 0;
  for (let t = 0; t < 80; t++) { level.tick(); fled = Math.max(fled, dist(cr, c)); }
  check('a creeper keeps away from a cat', fled > 6, fled.toFixed(1));
  cr.remove();
  const f = mobAt(level, 'cat', 10, 90, 10);
  settle(level, 60);
  check('it lands from 26 blocks unhurt', f.onGround && f.health === 10);
  const chick = mobAt(level, 'chicken', 20, 64, -10);
  const hunter = mobAt(level, 'cat', 18, 64, -10);
  hunter.setTarget(chick);
  let clawed = false;
  for (let t = 0; t < 200 && !clawed; t++) { level.tick(); if (chick.health < chick.maxHealth) clawed = true; }
  check('given prey, it stalks it and claws it', clawed);
  const a = mobAt(level, 'cat', 3, 64, 3), b = mobAt(level, 'cat', 4, 64, 3);
  tameTo(a, p);
  tameTo(b, p);
  a.collarColor = 5;
  b.collarColor = 5;
  a.variant = 'siamese';
  b.variant = 'siamese';
  hold(p, 'cod', 4);
  a.interact(p, p.inventory.selectedItem);
  b.interact(p, p.inventory.selectedItem);
  check('fish puts two tame cats in love', a.isInLove() && b.isInLove());
  let kitten = null;
  for (let t = 0; t < 300 && !kitten; t++) { level.tick(); kitten = level.entities.find((e) => e.type === 'cat' && e.isBaby()) ?? null; }
  check('and they have a kitten of their own, collared', !!kitten && kitten.isTame() && kitten.owner() === p && kitten.variant === 'siamese' && kitten.collarColor === 5);
  const w1 = mobAt(level, 'cat', 30, 64, 0), w2 = mobAt(level, 'cat', 31, 64, 0);
  w1.setInLove(p);
  w2.setInLove(p);
  check('strays don\'t breed', !w1.canMate(w2));
  const d = c.save();
  const back = spawner.loadEntity(d, level);
  check('saved and loaded: coat, collar, owner, sitting', back.variant === c.variant && back.collarColor === c.collarColor && back.ownerUUID === c.ownerUUID && back.orderedToSit);
  check('drops 0-2 string', c.lootTable().length === 1 && c.lootTable()[0].item === 'string' && c.lootTable()[0].max === 2);
  const s = mobAt(level, 'cat', 40, 64, 0);
  s.tickCount = 2401;
  const young = mobAt(level, 'cat', 42, 64, 0);
  check('a stray wanders off after two minutes, a pet never', s.removeWhenFarAway() && !young.removeWhenFarAway() && (c.tickCount = 99999) && !c.removeWhenFarAway());
  check('a stray\'s cry, a pet\'s meow', s.ambientSound() === 'entity.cat.stray_ambient' && ['entity.cat.ambient', 'entity.cat.purreow'].includes(c.ambientSound()));
  check('the cat texture follows the coat', c.texture() === 'cat_' + c.variant);
}

// --- the cat spawner: villages with more than four claimed beds get strays, up to five about
{
  const village = (claimed) => {
    const { level } = makeLevel();
    playerAt(level, 0, 64, 0, 'creative');
    const holder = { removed: false };
    for (let i = 0; i < 6; i++) {
      const head = bedAt(level, -12 + i * 4, 64, 20, 'south');
      if (i < claimed) level.poi.take(...head, holder);
    }
    return level;
  };
  const run = (level, minutes) => { const sp = new cs.CatSpawner(); let n = 0; for (let t = 0; t < 1200 * minutes; t++) n += sp.tick(level); return n; };
  const l1 = village(6);
  const n1 = run(l1, 40);
  check('a village gets its strays', n1 >= 3, `${n1} in 40 tries`);
  const kinds = new Set(l1.entities.filter((e) => e.type === 'cat').map((e) => e.variant));
  check('(of every coat but the all-black)', kinds.size >= 2 && !kinds.has('all_black'));
  const l2 = village(6);
  for (let i = 0; i < 5; i++) mobAt(l2, 'cat', 0, 64, i);
  check('but none when five are about already', run(l2, 30) === 0);
  check('nor where only four beds are claimed', run(village(4), 30) === 0);
  const { level: l3 } = makeLevel();
  playerAt(l3, 0, 64, 0, 'creative');
  check('and out in the wild, none', run(l3, 30) === 0);
}

console.log(fails ? `${fails} FAILED` : 'all passed');
await close();
process.exit(fails ? 1 : 0);

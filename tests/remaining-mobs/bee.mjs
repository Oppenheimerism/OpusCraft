// Headless checks for the bee (node tests/remaining-mobs/bee.mjs; remaining mobs, milestone 1): the bee itself (its
// numbers, its baby, its egg, its loot), flowers (pollinating, nectar, tempting, breeding), the hive (going in, the
// record it keeps, honey, coming out by day, out of the rain, with the way clear), harvesting (shears and bottles, the
// bees' anger, smoke from a campfire below), breaking (by hand, with silk touch, in creative, by a blast, fire by it),
// its sting (poison by difficulty, the stinger lost, dying after), growing crops, drowning, the honey block (sticky:
// slower, lower jumps, soft landings, slow slides, pistons), the recipes, world generation and saplings, saving,
// /summon, the advancements, the sounds, the textures, the model and the renderer (through stand-ins).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 900000).unref();
const P = [
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/player.ts',
  '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/entity/bee.ts', '/src/game/beehive.ts',
  '/src/game/blockBehavior.ts', '/src/game/interaction.ts', '/src/game/advancements.ts', '/src/game/commands.ts',
  '/src/render/beeRenderer.ts', '/src/render/entityRenderer.ts', '/src/render/model.ts', '/src/textures/mobs.ts', '/src/textures/items.ts',
  '/src/textures/blocks.ts', '/src/audio/synth.ts', '/src/core/rng.ts', '/src/inventory/recipes.ts', '/src/world/gen/context.ts',
  '/src/world/gen/beehiveDecorator.ts', '/src/game/randomTicks.ts', '/src/game/explosion.ts', '/src/game/redstone/piston.ts',
  '/src/world/constants.ts', '/src/item/hoverText.ts', '/src/world/blocksBees.ts', '/src/entity/effects.ts', '/src/world/gen/trees.ts',
  '/src/game/redstone/components.ts', '/src/game/redstone/signal.ts',
];
const { mods, close } = await loadModules(P);
const M = Object.fromEntries(P.map((p, i) => [p.replace(/^\/src\//, '').replace(/\.ts$/, ''), mods[i]]));
const { S, BLOCKS, STATE_BLOCK, getBlock, COLLISION } = M['world/block'];
const { ITEMS, ItemStack } = M['item/item'];
const { B } = M['world/gen/biomes'];
const { Bee } = M['entity/bee'];
const H = M['game/beehive'];
const spawner = M['game/spawner'];
const ADV = M['game/advancements'];
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const nameAt = (world, x, y, z) => BLOCKS[STATE_BLOCK[world.getState(x, y, z)]].name;

/** flat grass at y 63 on stone (they stand at 64), for x, z in [-48, 48), in `biome` */
function setup({ biome = B.plains } = {}) {
  const world = new M['world/world'].World();
  for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) { const c = new M['world/chunk'].Chunk(cx, cz); c.biomes.fill(biome); world.chunks.set(c.key, c); }
  const st = S('stone'), top = S('grass_block');
  for (let x = -48; x < 48; x++) for (let z = -48; z < 48; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 58; y < 63; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, top);
  }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new M['game/level'].Level(world, 'bees');
  const sounds = [], parts = [], triggers = [], bred = [], events = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p, t: level.gameTime }); }, playUI() {} };
  level.particles = { blockBreak() {}, blockHit() {}, blockParticle(x, y, z) { parts.push({ k: 'block', x, y, z }); }, spawn(k, x, y, z) { parts.push({ k, x, y, z, t: level.gameTime }); }, entityEffect() {}, poof() {}, dust() {}, emitAround() {}, spell() {}, fallingDust() {} };
  level.onPlayerTrigger = (p, type, payload) => triggers.push({ type, payload });
  level.onBred = (child, cause) => bred.push({ child, cause });
  const ge = level.gameEvent.bind(level);
  level.gameEvent = (e, x, y, z, ctx) => { events.push({ e, x, y, z }); ge(e, x, y, z, ctx); };
  level.difficulty = 'normal';
  level.doDaylightCycle = false;
  level.dayTime = 6000;
  level.simulationDistance = 4;
  const player = new M['entity/player'].Player(level);
  player.moveTo(30.5, 64, 30.5, 0, 0);
  player.gameMode = 'creative';
  level.player = player;
  level.addEntity(player);
  return { level, world, player, sounds, parts, triggers, bred, events };
}
const put = (world, x, y, z, n) => world.getChunk(x >> 4, z >> 4).setState(x & 15, y, z & 15, typeof n === 'number' ? n : S(n));
/** a bee (or `type`) made as /summon makes it */
const spawn = (level, x, y, z, { type = 'bee' } = {}) => {
  const m = spawner.createMob(type, level);
  m.moveTo(x, y, z, 0, 0);
  m.finalizeSpawn('command');
  level.addEntity(m);
  return m;
};
/** ticks the level, the player held where it is (and `pin`ned things where they are); stops early when `until` holds */
const tick = (level, n, until, pin = []) => {
  const p = level.player, [x, y, z] = [p.x, p.y, p.z];
  const at = pin.map((e) => [e, e.x, e.y, e.z]);
  for (let i = 0; i < n; i++) {
    level.tick();
    p.moveTo(x, y, z, p.yaw, p.pitch);
    p.dx = p.dy = p.dz = 0;
    p.fallDistance = 0;
    p.air = 300;
    for (const [e, ex, ey, ez] of at) { e.moveTo(ex, ey, ez, e.yaw, e.pitch); e.dx = e.dy = e.dz = 0; }
    if (until?.(i)) return i + 1;
  }
  return n;
};
/** ticks the level with nothing held */
const run = (level, n, until) => {
  for (let i = 0; i < n; i++) {
    level.tick();
    if (until?.(i)) return i + 1;
  }
  return n;
};
const hold = (player, id, count = 1, tag) => {
  const s = id ? ItemStack.of(id, count) : null;
  if (s && tag) s.tag = tag;
  player.inventory.setSelectedItem(s);
  return s;
};
const itemsOnGround = (level, id) => level.entities.filter((e) => e.type === 'item' && !e.removed && e.stack.item.id === id);
const countOnGround = (level, id) => itemsOnGround(level, id).reduce((n, e) => n + e.stack.count, 0);
const bees = (level) => level.entities.filter((e) => e instanceof Bee && !e.removed);
const honey = (level, x, y, z) => H.honeyLevel(level.getState(x, y, z));
/** a hive (`kind`) at (x, y, z) facing `facing`, with `n` bees in it (each `ticks` into its stay) and honey `h` */
function hive(level, x, y, z, { kind = 'bee_nest', facing = 'north', n = 0, h = 0, ticks = 0 } = {}) {
  level.setBlock(x, y, z, getBlock(kind).state({ facing, honey_level: h }));
  const be = H.hiveAt(level, x, y, z);
  for (let i = 0; i < n; i++) be.storeBee(H.newOccupant(ticks));
  return be;
}
/** an Interaction for `player`, and its hand: looking at (tx, ty, tz) from where it stands, a use or a hit */
function hands(level, player) {
  const ia = new M['game/interaction'].Interaction(level, player);
  const look = (tx, ty, tz) => {
    const dx = tx - player.x, dy = ty - (player.y + player.eyeHeight), dz = tz - player.z;
    const yaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90, pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
    player.moveTo(player.x, player.y, player.z, yaw, pitch);
    ia.pick(player.x, player.y + player.eyeHeight, player.z, yaw, pitch);
  };
  const use = (tx, ty, tz) => {
    look(tx, ty, tz);
    ia.rightClickDelay = 0;
    ia.use(true, true);
  };
  /** breaking the block looked at, mining it through till it's gone (at most 200 ticks) */
  const dig = (tx, ty, tz) => {
    const [bx, by, bz] = [Math.floor(tx), Math.floor(ty), Math.floor(tz)];
    look(tx, ty, tz);
    ia.missTime = 0;
    ia.startAttack();
    for (let i = 0; i < 200 && level.getState(bx, by, bz) !== 0; i++) {
      look(tx, ty, tz);
      ia.continueAttack(true);
    }
    ia.continueAttack(false);
  };
  return { ia, look, use, dig };
}

// ---------------------------------------------------------------------------
// the bee itself
{
  const { level, world } = setup();
  const b = spawn(level, 0.5, 66, 0.5);
  check('a bee: 10 health, flies at 0.6 and walks at 0.3, stings for 2, follows 48 blocks, 0.7 x 0.6, a creature', b instanceof Bee && b.maxHealth === 10 && b.health === 10 && near(b.flyingSpeedAttr, 0.6) && near(b.moveSpeedAttr, 0.3) && b.attackDamage === 2 && b.followRange === 48 && near(b.width, 0.7) && near(b.height, 0.6) && b.category === 'creature');
  check('...its eyes 0.3 up; flowers are its food (a poppy, a sunflower, a flowering azalea, a dandelion), not wheat', near(b.eyeHeight, 0.3) && ['poppy', 'sunflower', 'flowering_azalea', 'dandelion'].every((id) => b.isFood(ItemStack.of(id))) && !b.isFood(ItemStack.of('wheat')));
  const baby = spawn(level, 2.5, 66, 0.5);
  baby.setAge(-24000);
  check('a baby: half the size (0.35 x 0.3), its eyes 0.15 up', near(baby.width, 0.35) && near(baby.height, 0.3) && near(baby.eyeHeight, 0.15));
  check('its name, summonable; its spawn egg in the spawn eggs tab', spawner.entityDisplayName('bee') === 'Bee' && spawner.summonableTypes().includes('bee') && ITEMS.get('bee_spawn_egg')?.creativeTab === 'spawn_eggs');
  const xs = new Set();
  for (let i = 0; i < 80; i++) xs.add(b.experienceReward());
  check('killed by a player: 1 to 3 experience; its loot table is empty', [...xs].sort().join() === '1,2,3' && b.lootTable().length === 0);
  check('...it hurts 0.4 loud, entity.bee.hurt and death, no ambient sound (its hum is its loop)', b.soundVolume() === 0.4 && b.hurtSound() === 'entity.bee.hurt' && b.deathSound() === 'entity.bee.death' && b.ambientSound() === null);
  // falling from high with its wings still: no harm
  const f = spawn(level, 6.5, 90, 0.5);
  f.serverAiStep = () => {};
  f.noGravityFlag = false;
  run(level, 80, () => f.onGround);
  check('a bee that falls 26 blocks takes no harm', f.onGround && f.health === 10, `${f.onGround} ${f.health}`);
  run(level, 200);
  check('...once it flies about it hovers, gravity off (vanilla FlyingMoveControl)', b.noGravityFlag && !b.onGround, `${b.noGravityFlag} ${b.y.toFixed(2)}`);
  // the spawn egg on the ground
  const { use } = hands(level, level.player);
  level.player.moveTo(10.5, 64, 10.5, 0, 0);
  hold(level.player, 'bee_spawn_egg');
  const before = bees(level).length;
  use(10.5, 63.5, 12.5);
  check('its egg used on the ground: a bee', bees(level).length === before + 1);
  void world;
}

// ---------------------------------------------------------------------------
// flowers: pollinating, nectar
{
  const { level, world, sounds, parts } = setup();
  put(world, 4, 64, 0, 'poppy');
  const b = spawn(level, 0.5, 65, 0.5);
  b.clock.flowerCooldown = 0;
  const t = tick(level, 2000, () => b.hasNectar);
  check('a bee finds a poppy 4 blocks off, hovers over it and comes away with nectar, 20 seconds or more after', b.hasNectar && t > 400, `${t}`);
  check('...it knows that flower', b.savedFlowerPos?.join() === '4,64,0', `${b.savedFlowerPos}`);
  check('...buzzing over it now and then (entity.bee.pollinate)', sounds.some((s) => s.n === 'entity.bee.pollinate'));
  parts.length = 0;
  tick(level, 200);
  check('...with nectar, specks of it fall from it (falling_nectar)', parts.some((p) => p.k === 'falling_nectar'));
  // the rain keeps it from flowers
  const r = spawn(level, -20.5, 65, 0.5);
  put(world, -17, 64, 0, 'dandelion');
  r.clock.flowerCooldown = 0;
  level.raining = true;
  level.rain = level.rainO = 1;
  tick(level, 600);
  check('in the rain a bee leaves flowers be', !r.hasNectar && !r.pollinateGoal.isPollinating());
  level.raining = false;
  level.rain = level.rainO = 0;
  // a sunflower's top only, not a waterlogged flower
  const w = spawn(level, 20.5, 65, 20.5);
  put(world, 22, 64, 20, getBlock('sunflower').state({ half: 'lower' }));
  put(world, 22, 65, 20, getBlock('sunflower').state({ half: 'upper' }));
  w.clock.flowerCooldown = 0;
  tick(level, 30, () => w.pollinateGoal.isPollinating());
  check('...a sunflower\'s top half is the flower it goes to', w.savedFlowerPos?.join() === '22,65,20', `${w.savedFlowerPos}`);
}

// ---------------------------------------------------------------------------
// tempting and breeding
{
  const { level, player, bred } = setup();
  player.moveTo(6.5, 64, 0.5, 90, 0);
  const b = spawn(level, -2.5, 65, 0.5);
  hold(player, 'poppy', 8);
  const t = tick(level, 400, () => b.distanceToSqr(player.x, player.y, player.z) < 9);
  check('a player holding a flower within 10 blocks draws a bee to it', b.distanceToSqr(player.x, player.y, player.z) < 9, `${t} ${Math.sqrt(b.distanceToSqr(player.x, player.y, player.z)).toFixed(1)}`);
  const c = spawn(level, 5.5, 65.5, 2.5);
  const { ia } = hands(level, player);
  for (const e of [b, c]) {
    hold(player, 'poppy', 8);
    ia.entityHit = e;
    ia.hit = null;
    ia.rightClickDelay = 0;
    ia.use(true, true);
  }
  check('...fed a flower each, two bees are in love', b.inLove > 0 && c.inLove > 0);
  tick(level, 400, () => bred.length > 0);
  const kid = bred[0]?.child;
  check('...and have a baby bee', kid instanceof Bee && kid.isBaby() && near(kid.width, 0.35));
}

// ---------------------------------------------------------------------------
// the hive: going in, honey, coming out
{
  const { level, world, sounds, events } = setup();
  const be = hive(level, 0, 64, 5, { kind: 'beehive' });
  check('a beehive has a block entity, empty, its honey 0; a point bees look for', be instanceof H.BeehiveBlockEntity && be.isEmpty() && honey(level, 0, 64, 5) === 0 && level.poi.kindAt(0, 64, 5) === 'beehive');
  const b = spawn(level, 0.5, 64.2, 3.9);
  b.hivePos = [0, 64, 5];
  b.setHasNectar(true);
  b.savedFlowerPos = [4, 64, 0];
  const t = tick(level, 100, () => b.removed);
  check('a bee with nectar by its hive goes in (block.beehive.enter)', b.removed && be.occupantCount() === 1 && sounds.some((s) => s.n === 'block.beehive.enter'), `${t}`);
  const o = be.bees()[0];
  check('...its record kept (its nectar, at least 2 minutes inside), not where it was, its uuid or its hive', o?.minTicksInHive === 2400 && o.entityData.data.HasNectar === true && o.entityData.x === undefined && o.entityData.uuid === undefined && o.entityData.data.hive_pos === undefined, JSON.stringify(o));
  check('...the hive learns its flower; a block_change game event', be.savedFlowerPos?.join() === '4,64,0' && events.some((e) => e.e === 'block_change'));
  // near the end of its stay
  const d = be.save();
  const list = JSON.parse(d.data.bees);
  list[0].ticksInHive = 2395;
  d.data.bees = JSON.stringify(list);
  be.load(d);
  level.dayTime = 18000;
  tick(level, 20);
  check('by night it stays in', be.occupantCount() === 1);
  level.dayTime = 6000;
  level.raining = true;
  level.rain = level.rainO = 1;
  tick(level, 20);
  check('...in the rain too', be.occupantCount() === 1);
  level.raining = false;
  level.rain = level.rainO = 0;
  put(world, 0, 64, 4, 'stone');
  tick(level, 20);
  check('...and with its way out blocked', be.occupantCount() === 1);
  put(world, 0, 64, 4, 0);
  sounds.length = 0;
  tick(level, 20, () => be.isEmpty());
  const out = bees(level)[0];
  const h1 = honey(level, 0, 64, 5);
  check('by day, dry and with its way clear it comes out in front, its nectar left as honey (a level; block.beehive.exit)', be.isEmpty() && out && !out.hasNectar && (h1 === 1 || h1 === 2) && out.z < 5 && out.z > 4 && sounds.some((s) => s.n === 'block.beehive.exit'), `${h1} ${out?.z}`);
  check('...the hive its home; it still knows its flower', out?.hivePos?.join() === '0,64,5' && out.savedFlowerPos?.join() === '4,64,0');
  // honey up to 5, no further
  level.setBlock(0, 64, 5, getBlock('beehive').state({ facing: 'north', honey_level: 4 }));
  be.storeBee({ entityData: { id: 'bee', data: { HasNectar: true } }, ticksInHive: 2400, minTicksInHive: 2400 });
  tick(level, 5);
  const h5 = honey(level, 0, 64, 5);
  be.storeBee({ entityData: { id: 'bee', data: { HasNectar: true } }, ticksInHive: 2400, minTicksInHive: 2400 });
  tick(level, 5);
  check('...the honey rises to 5 and no further', h5 === 5 && honey(level, 0, 64, 5) === 5 && be.isEmpty());
  // a bee without a hive finds one within 20 blocks when it wants to go in (the others gone, so there's room)
  for (const e of bees(level)) e.remove();
  const lost = spawn(level, 12.5, 65, 5.5);
  level.dayTime = 18000;
  const t2 = tick(level, 600, () => lost.hivePos !== null);
  check('a homeless bee that wants in (at night) finds a hive with room within 20 blocks', lost.hivePos?.join() === '0,64,5', `${t2} ${lost.hivePos}`);
  const t3 = tick(level, 1200, () => lost.removed);
  check('...and goes in', lost.removed && be.occupantCount() >= 1, `${t3}`);
  // three at most
  const full = hive(level, -10, 64, -10, { n: 3 });
  const extra = spawn(level, -9.5, 64.5, -10.5);
  full.addOccupant(level, extra);
  check('a hive holds three bees at most', full.occupantCount() === 3 && !extra.removed && full.isFull());
}

// ---------------------------------------------------------------------------
// harvesting
{
  const { level, player, sounds, triggers, events } = setup();
  player.gameMode = 'survival';
  player.moveTo(0.5, 64, 3.2, 0, 0);
  const { use } = hands(level, player);
  const nest = hive(level, 0, 64, 5, { n: 2, h: 5 });
  const outside = spawn(level, 4.5, 65, 8.5);
  outside.serverAiStep = () => {};
  const shears = hold(player, 'shears');
  use(0.5, 64.5, 5);
  check('shears on a full nest: 3 honeycomb (block.beehive.shear), its honey gone, the shears worn a point', countOnGround(level, 'honeycomb') === 3 && honey(level, 0, 64, 5) === 0 && shears.damage === 1 && sounds.some((s) => s.n === 'block.beehive.shear') && events.some((e) => e.e === 'shear'));
  const angry = bees(level).filter((b) => b.target === player);
  check('...the bees inside come out after the player, and the bee nearby too (no campfire under it)', nest.isEmpty() && angry.length === 3 && angry.includes(outside), `${angry.length}`);
  check('...(the advancement\'s trigger: not smoked)', triggers.some((t) => t.type === 'item_used_on_block' && t.payload.usedOnBlock.item === 'shears' && t.payload.usedOnBlock.smokey === false));
  // not full: nothing
  const half = hive(level, 3, 64, 5, { n: 1, h: 4 });
  hold(player, 'shears');
  player.moveTo(3.5, 64, 3.2, 0, 0);
  use(3.5, 64.5, 5);
  check('...a nest not yet full: nothing', honey(level, 3, 64, 5) === 4 && half.occupantCount() === 1 && countOnGround(level, 'honeycomb') === 3);
  // bottles, smoked from below
  put(level.world, -3, 63, 5, getBlock('campfire').state({ lit: true }));
  const smoked = hive(level, -3, 64, 5, { n: 2, h: 5 });
  player.moveTo(-2.5, 64, 3.2, 0, 0);
  hold(player, 'glass_bottle', 2);
  triggers.length = 0;
  use(-2.5, 64.5, 5);
  const inv = player.inventory;
  check('a glass bottle on a full nest smoked by a campfire: a honey bottle, the bottle used; the bees stay in, calm', inv.selectedItem?.item.id === 'glass_bottle' && inv.selectedItem.count === 1 && inv.main.some((s) => s?.item.id === 'honey_bottle') && honey(level, -3, 64, 5) === 0 && smoked.occupantCount() === 2 && sounds.some((s) => s.n === 'item.bottle.fill') && events.some((e) => e.e === 'fluid_pickup'));
  const pa = new ADV.PlayerAdvancements();
  for (const t of triggers) pa.trigger(t.type, t.payload);
  check('...Bee Our Guest', pa.isDone(ADV.ADVANCEMENTS.get('husbandry/safely_harvest_honey')));
  // the last bottle becomes the honey bottle
  level.setBlock(-3, 64, 5, getBlock('bee_nest').state({ facing: 'north', honey_level: 5 }));
  hold(player, 'glass_bottle', 1);
  use(-2.5, 64.5, 5);
  check('...the last bottle in the hand turns into the honey bottle', inv.selectedItem?.item.id === 'honey_bottle');
  // a bottle with nothing to smoke it: the bees come out after the player
  const wild = hive(level, 6, 64, 5, { n: 1, h: 5 });
  player.moveTo(6.5, 64, 3.2, 0, 0);
  hold(player, 'glass_bottle', 4);
  use(6.5, 64.5, 5);
  check('...not smoked, the bee inside comes out after the player', wild.isEmpty() && bees(level).some((b) => b.target === player && Math.abs(b.x - 6.5) < 1.5));
  // the smoke's reach
  const w = level.world;
  const smokeAt = (setup2) => {
    for (let y = 58; y < 64; y++) put(w, 20, y, 20, y < 63 ? 'stone' : 'grass_block');
    setup2();
    return H.isSmokeyPos(level, 20, 70, 20);
  };
  const lit = getBlock('campfire').state({ lit: true }), unlit = getBlock('campfire').state({ lit: false }), soul = getBlock('soul_campfire').state({ lit: true });
  const clearCol = () => { for (let y = 64; y < 70; y++) put(w, 20, y, 20, 0); };
  const r5 = smokeAt(() => { clearCol(); put(w, 20, 65, 20, lit); });
  const r6 = smokeAt(() => { clearCol(); put(w, 20, 64, 20, lit); });
  const rUnlit = smokeAt(() => { clearCol(); put(w, 20, 69, 20, unlit); });
  const rSoul = smokeAt(() => { clearCol(); put(w, 20, 69, 20, soul); });
  const rOne = smokeAt(() => { clearCol(); put(w, 20, 68, 20, lit); put(w, 20, 69, 20, 'stone'); });
  const rTwo = smokeAt(() => { clearCol(); put(w, 20, 67, 20, lit); put(w, 20, 68, 20, 'stone'); put(w, 20, 69, 20, 'stone'); });
  const rCarpet = smokeAt(() => { clearCol(); put(w, 20, 66, 20, lit); put(w, 20, 68, 20, 'white_carpet'); });
  const rCarpetOn = smokeAt(() => { clearCol(); put(w, 20, 66, 20, lit); put(w, 20, 67, 20, 'white_carpet'); });
  check('smoke: a lit campfire (or soul campfire) up to 5 blocks below, not 6, not unlit', r5 && !r6 && !rUnlit && rSoul);
  check('...through the one block right on it, not two; a carpet a block above it stops it, one on it doesn\'t', rOne && !rTwo && !rCarpet && rCarpetOn);
}

// ---------------------------------------------------------------------------
// breaking
{
  const { level, player, triggers } = setup();
  player.gameMode = 'survival';
  const { use, dig } = hands(level, player);
  // a beehive by hand (an axe): the bees come out after the player; it drops itself
  hive(level, 0, 64, 5, { kind: 'beehive', n: 2, h: 3 });
  player.moveTo(0.5, 64, 3.2, 0, 0);
  hold(player, 'diamond_axe');
  dig(0.5, 64.5, 5);
  const plain = itemsOnGround(level, 'beehive');
  check('a beehive broken without silk touch drops itself (no bees, no honey in it); its 2 bees come out after the player', level.getState(0, 64, 5) === 0 && plain.length === 1 && !plain[0].stack.tag?.bees?.length && bees(level).filter((b) => b.target === player).length === 2);
  // (vanilla BeehiveBlock.playerDestroy counts the bees after they've come out)
  check('...(the advancement\'s trigger: no silk touch, the bees gone out)', triggers.some((t) => t.type === 'bee_nest_destroyed' && t.payload.beeNestDestroyed.block === 'beehive' && !t.payload.beeNestDestroyed.silkTouch && t.payload.beeNestDestroyed.bees === 0));
  // a bee nest by hand: nothing
  hive(level, 5, 64, 5, { n: 1 });
  player.moveTo(5.5, 64, 3.2, 0, 0);
  hold(player, 'diamond_axe');
  dig(5.5, 64.5, 5);
  check('a bee nest broken without silk touch drops nothing', level.getState(5, 64, 5) === 0 && itemsOnGround(level, 'bee_nest').length === 0);
  // silk touch
  hive(level, -5, 64, 5, { n: 3, h: 3 });
  player.moveTo(-4.5, 64, 3.2, 0, 0);
  triggers.length = 0;
  const angryBefore = bees(level).filter((b) => b.target === player).length;
  hold(player, 'diamond_axe', 1, { enchantments: { silk_touch: 1 } });
  dig(-4.5, 64.5, 5);
  const silk = itemsOnGround(level, 'bee_nest')[0];
  check('with silk touch the nest comes away with its 3 bees and its honey (level 3); no bee comes out', silk && silk.stack.tag?.bees?.length === 3 && silk.stack.tag.blockState?.honey_level === '3' && bees(level).filter((b) => b.target === player).length === angryBefore);
  const tip = M['item/hoverText'].hoverLines?.(silk.stack) ?? [];
  check('...its tooltip: Bees: 3 / 3, Honey: 3 / 5', !M['item/hoverText'].hoverLines || (tip.join('|').includes('Bees: 3 / 3') && tip.join('|').includes('Honey: 3 / 5')), tip.join('|'));
  const pa = new ADV.PlayerAdvancements();
  for (const t of triggers) pa.trigger(t.type, t.payload);
  check('...Total Beelocation', pa.isDone(ADV.ADVANCEMENTS.get('husbandry/silk_touch_nest')));
  // placed again
  player.moveTo(10.5, 64, 10.5, 0, 0);
  hold(player, 'bee_nest', 1, JSON.parse(JSON.stringify(silk.stack.tag)));
  use(10.5, 63.5, 12.5);
  const placed = H.hiveAt(level, 10, 64, 12);
  check('...placed, it has its bees and its honey, its front toward the player', placed?.occupantCount() === 3 && honey(level, 10, 64, 12) === 3 && getBlock('bee_nest').get(level.getState(10, 64, 12), 'facing') === 'north');
  // in creative: a hive with bees drops as an item with them
  player.gameMode = 'creative';
  hive(level, 15, 64, 5, { kind: 'beehive', n: 1 });
  player.moveTo(15.5, 64, 3.2, 0, 0);
  hold(player, null);
  dig(15.5, 64.5, 5);
  const cre = itemsOnGround(level, 'beehive').find((e) => Math.abs(e.x - 15) < 1.5);
  check('broken in creative, a hive with a bee in it drops with it; an empty one without honey drops nothing', cre?.stack.tag?.bees?.length === 1);
  hive(level, 18, 64, 5, { kind: 'beehive' });
  player.moveTo(18.5, 64, 3.2, 0, 0);
  const n0 = itemsOnGround(level, 'beehive').length;
  dig(18.5, 64.5, 5);
  check('...(the empty one)', level.getState(18, 64, 5) === 0 && itemsOnGround(level, 'beehive').length === n0);
  // a blast
  player.gameMode = 'survival';
  const blasted = hive(level, -20, 64, -20, { n: 2 });
  void blasted;
  const tnt = { type: 'tnt', x: -20.5, y: 64.5, z: -18.5 };
  M['game/explosion'].explode(level, tnt, -20.5, 64.5, -18.5, 4, false, 'tnt');
  const out = bees(level).filter((b) => Math.abs(b.x + 20) < 5 && Math.abs(b.z + 20) < 5);
  check('blown up by tnt, a nest lets its bees out', level.getState(-20, 64, -20) === 0 || nameAt(level.world, -20, 64, -20) !== 'bee_nest' ? out.length === 2 : false, `${out.length} ${nameAt(level.world, -20, 64, -20)}`);
  // fire by it
  const burning = hive(level, 25, 64, -20, { n: 2 });
  level.setBlock(26, 64, -20, S('fire'));
  check('fire set next to a nest drives its bees out', burning.isEmpty(), `${burning.occupantCount()}`);
  // pistons don't move it
  check('a hive isn\'t moved by a piston', !M['game/redstone/piston'].isPushable(level, level.getState(10, 64, 12), 10, 64, 12, 5, false, 5));
}

// ---------------------------------------------------------------------------
// the sting
{
  for (const [diff, secs] of [['normal', 10], ['hard', 18], ['easy', 0]]) {
    const { level, player, sounds } = setup();
    level.difficulty = diff;
    player.gameMode = 'survival';
    player.moveTo(0.5, 64, 0.5, 0, 0);
    const b = spawn(level, 0.5, 65, 3.5);
    const other = spawn(level, 3.5, 65, 3.5);
    player.hurts = [];
    const hurt = player.hurt.bind(player);
    player.hurt = (a, src, ...r) => { const ok = hurt(a, src, ...r); if (ok) player.hurts.push([a, src]); return ok; };
    // (a tick or two in: vanilla HurtByTargetGoal takes no notice of a hurt at the tick count it started from)
    tick(level, 5);
    b.hurt(1, 'player', player, player);
    tick(level, 3);
    if (diff === 'normal') {
      check('hit by a player, a bee is angry at it (20 to 39 seconds), and the bee by it that sees it', b.isAngry() && b.angerTime >= 380 && b.angerTime <= 780 && b.target === player && other.target === player, `${b.angerTime} ${!!other.target}`);
    }
    const t = tick(level, 400, () => b.hasStung);
    const poison = player.effects?.get?.('poison') ?? player.activeEffects?.get?.('poison') ?? [...(player.effects?.values?.() ?? [])].find((e) => e.effect?.id === 'poison' || e.id === 'poison');
    const dur = poison?.duration ?? 0;
    const stung = player.hurts.find((h) => h[1] === 'sting');
    check(`${diff}: it stings the player (2, 'sting'${secs ? `, ${secs} seconds of poison` : ', no poison'}), losing its stinger and its anger (entity.bee.sting)`, b.hasStung && stung?.[0] === 2 && (secs ? dur > (secs - 1) * 20 && dur <= secs * 20 : !poison) && !b.isAngry() && sounds.some((s) => s.n === 'entity.bee.sting'), `${t} ${dur} ${JSON.stringify(stung)}`);
    if (diff === 'normal') {
      const t2 = tick(level, 1400, () => b.health <= 0 || b.removed);
      check('...and dies within a minute and a bit after', b.health <= 0 || b.removed, `${t2}`);
    }
  }
  // rolling as it closes in
  const { level, player } = setup();
  player.gameMode = 'survival';
  player.moveTo(0.5, 64, 0.5, 0, 0);
  const b = spawn(level, 0.5, 65, 4.5);
  b.setTarget(player);
  let rolled = false, amount = 0;
  tick(level, 200, () => {
    if (b.rolling) { rolled = true; amount = Math.max(amount, b.roll.amount); }
    return b.hasStung;
  });
  check('an angry bee within 2 blocks of whom it goes for rolls over (its roll easing in)', rolled && amount >= 0.2 - 1e-9, `${amount}`);
}

// ---------------------------------------------------------------------------
// growing crops, drowning
{
  const { level, world } = setup();
  hive(level, 8, 64, 8, { kind: 'beehive' });
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) { put(world, x, 63, z, getBlock('farmland').state({ moisture: 7 })); put(world, x, 64, z, getBlock('wheat').state({ age: 0 })); }
  const b = spawn(level, 0.5, 65.2, 0.5);
  b.hivePos = [8, 64, 8];
  b.setHasNectar(true);
  b.clock.stayOutOfHive = 10000;
  tick(level, 600, () => b.clock.cropsGrown >= 2, [b]);
  check('a bee with nectar and a home over wheat grows it a stage at a time', b.clock.cropsGrown >= 2 && getBlock('wheat').get(level.getState(0, 64, 0), 'age') >= 2, `${b.clock.cropsGrown}`);
  b.clock.cropsGrown = 10;
  tick(level, 300, null, [b]);
  check('...ten crops at most till it next pollinates', b.clock.cropsGrown === 10);
  // under water
  for (let y = 64; y < 67; y++) put(world, -20, y, -20, 'water');
  const d = spawn(level, -19.5, 64.2, -19.5);
  tick(level, 25, null, [d]);
  const hp1 = d.health;
  tick(level, 10, null, [d]);
  check('a bee held under water drowns after a second, a point each tick', hp1 < 10 && d.health < hp1, `${hp1} ${d.health}`);
}

// ---------------------------------------------------------------------------
// the honey block
{
  const { level, world, player, sounds, triggers, parts } = setup();
  const hb = getBlock('honey_block');
  check('the honey block: breaks at once, slows to 0.4 and jumps to half; its box a pixel in at the sides and top', hb.hardness === 0 && hb.speedFactor === 0.4 && hb.jumpFactor === 0.5 && JSON.stringify(COLLISION[hb.defaultState]) === JSON.stringify([[1 / 16, 0, 1 / 16, 15 / 16, 15 / 16, 15 / 16]]));
  put(world, 0, 64, 0, 'honey_block');
  const pig = spawn(level, 0.5, 65, 0.5, { type: 'pig' });
  run(level, 5);
  check('...something standing on it moves at 0.4 and jumps half as high', pig.onGround && near(pig.blockSpeedFactor(), 0.4) && near(pig.blockJumpFactor(), 0.5) && near(pig.jumpPower(), 0.21), `${pig.y} ${pig.blockJumpFactor()}`);
  pig.remove();
  // landing on it
  player.gameMode = 'survival';
  put(world, 10, 64, 10, 'honey_block');
  player.moveTo(10.5, 84.9375, 10.5, 0, 0);
  player.dx = player.dy = player.dz = 0;
  player.fallDistance = 0;
  sounds.length = 0;
  parts.length = 0;
  run(level, 100, () => player.onGround);
  check('a player falling 20 blocks onto a honey block takes a fifth of the harm (4 rather than 17)', player.onGround && player.health === 16, `${player.health}`);
  check('...with the slide sound, the fall sound softer and lower, and specks of honey', sounds.some((s) => s.n === 'block.honey_block.slide') && sounds.some((s) => s.n === 'block.honey_block.fall' && near(s.v, 0.5) && near(s.p, 0.75)) && parts.filter((p) => p.k === 'block').length >= 10);
  // sliding down its side
  for (let y = 64; y < 80; y++) put(world, -10, y, -10, 'honey_block');
  player.health = 20;
  player.moveTo(-10 + 15 / 16 + 0.3, 78, -9.5, 90, 0);
  player.dx = player.dz = 0;
  player.dy = -0.5;
  player.fallDistance = 5;
  triggers.length = 0;
  const y0 = player.y;
  run(level, 40);
  const fell = y0 - player.y;
  check('against its side a player slides down slowly (5 blocks in 2 seconds, not a free fall), its fall forgotten', fell > 1 && fell < 6 && player.fallDistance < 1, `${fell.toFixed(2)} ${player.fallDistance}`);
  check('...Sticky Situation', triggers.some((t) => t.type === 'slide_down_block' && t.payload.slideDownBlock === 'honey_block'));
  const pa = new ADV.PlayerAdvancements();
  for (const t of triggers) pa.trigger(t.type, t.payload);
  check('...(the advancement done)', pa.isDone(ADV.ADVANCEMENTS.get('adventure/honey_block_slide')));
  // a sticky piston takes its neighbours along
  const PI = M['game/redstone/piston'];
  const sp = getBlock('sticky_piston').state({ facing: 'east' });
  // (up in the air: on the ground it would take the ground along, too much to push, as in vanilla)
  level.setBlock(-30, 67, -30, sp);
  level.setBlock(-29, 67, -30, S('honey_block'));
  level.setBlock(-29, 68, -30, S('stone'));
  M['game/blockBehavior'].behaviorOf(sp)?.setPlacedBy?.(level, -30, 67, -30, sp, player);
  level.setBlock(-31, 67, -30, S('redstone_block'));
  run(level, 10);
  check('a piston pushing a honey block takes the block stuck to it along', nameAt(world, -28, 67, -30) === 'honey_block' && nameAt(world, -28, 68, -30) === 'stone', `${nameAt(world, -28, 67, -30)} ${nameAt(world, -28, 68, -30)}`);
  level.setBlock(-31, 67, -30, 0);
  level.setBlock(-30, 66, -30, S('stone'));
  level.setBlock(-30, 66, -30, 0);
  run(level, 10);
  check('...and a sticky piston pulls it back, with it', nameAt(world, -29, 67, -30) === 'honey_block' && nameAt(world, -29, 68, -30) === 'stone', `${nameAt(world, -29, 67, -30)} ${nameAt(world, -29, 68, -30)}`);
  void PI;
}

// ---------------------------------------------------------------------------
// the recipes
{
  const R = M['inventory/recipes'];
  const st = (id) => (id ? ItemStack.of(id) : null);
  const grid = (ids) => ids.map(st);
  const r1 = R.findRecipe(grid(['oak_planks', 'birch_planks', 'oak_planks', 'honeycomb', 'honeycomb', 'honeycomb', 'spruce_planks', 'oak_planks', 'oak_planks']), 3, 3);
  const r2 = R.findRecipe(grid(['honey_bottle', 'honey_bottle', 'honey_bottle', 'honey_bottle']), 2, 2);
  const r3 = R.findRecipe(grid(['honey_block', 'glass_bottle', 'glass_bottle', 'glass_bottle', 'glass_bottle', null, null, null, null]), 3, 3);
  const r4 = R.findRecipe(grid(['honey_bottle', null, null, null]), 2, 2);
  const r5 = R.findRecipe(grid(['honeycomb', 'honeycomb', 'honeycomb', 'honeycomb']), 2, 2);
  check('recipes: a beehive (planks round honeycomb), a honey block (4 bottles), 4 bottles back, 3 sugar, the honeycomb block', r1?.result === 'beehive' && r1.count === 1 && r2?.result === 'honey_block' && r3?.result === 'honey_bottle' && r3.count === 4 && r4?.result === 'sugar' && r4.count === 3 && r5?.result === 'honeycomb_block');
  check('...the honey bottles leave their bottles in the grid', R.craftingRemainder(ItemStack.of('honey_bottle'))?.item.id === 'glass_bottle');
  check('the honey and honeycomb blocks in the natural blocks, the nest and the hive in the functional ones', ITEMS.get('honey_block').creativeTab === 'natural' && ITEMS.get('honeycomb_block').creativeTab === 'natural' && ITEMS.get('bee_nest').creativeTab === 'functional' && ITEMS.get('beehive').creativeTab === 'functional');
  const creative = (await import('node:fs')).readFileSync('src/gui/screens/creative.ts', 'utf8');
  check('...the nest in the natural blocks too (after the hay bale), the honey block in the redstone ones too (vanilla CreativeModeTabs)', /\['bee_nest', 'hay_block'\]/.test(creative) && /REDSTONE_ALSO\.add\('honey_block'\)/.test(creative));
}

// ---------------------------------------------------------------------------
// world generation and saplings
{
  const ctxOf = () => {
    const blocks = new Uint16Array(16 * 16 * 384);
    const CI = M['world/constants'].colIndex;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { for (let y = 58; y < 63; y++) blocks[CI(x, y, z)] = S('stone'); blocks[CI(x, 63, z)] = S('grass_block'); }
    const ctx = new M['world/gen/context'].GenContext(0, 0, blocks, new Uint8Array(256).fill(B.meadow));
    ctx.computeHeightmaps();
    return ctx;
  };
  const { Rand } = M['core/rng'];
  let nests = 0, placed = 0, beesIn = [], faces = new Set(), wrong = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const ctx = ctxOf();
    if (!M['world/gen/trees'].placeTree(ctx, 'fancy_oak', 8, 64, 8, new Rand(seed), { chance: 1, r: new Rand(seed + 1000) })) continue;
    placed++;
    for (const be of ctx.blockEntities) {
      if (be.id !== 'bee_nest') continue;
      nests++;
      const st = ctx.get(be.x, be.y, be.z);
      if (BLOCKS[STATE_BLOCK[st]].name !== 'bee_nest') wrong++;
      faces.add(getBlock('bee_nest').get(st, 'facing'));
      const list = JSON.parse(be.data.bees);
      beesIn.push(list.length);
      if (!list.every((o) => o.entityData.id === 'bee' && o.ticksInHive >= 0 && o.ticksInHive < 599 && o.minTicksInHive === 600)) wrong++;
      if (ctx.get(be.x, be.y, be.z + 1) !== 0) wrong++;
    }
  }
  check('a meadow\'s tree (bees 1.0) gets a bee nest on its trunk, facing south with air in front, 2 or 3 bees in it', placed > 20 && nests >= placed * 0.7 && wrong === 0 && [...faces].join() === 'south' && beesIn.every((n) => n === 2 || n === 3), `${placed} ${nests} ${wrong} ${[...faces]}`);
  let none = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const ctx = ctxOf();
    M['world/gen/trees'].placeTree(ctx, 'oak', 8, 64, 8, new Rand(seed), { chance: 0.05, r: new Rand(seed + 2000) });
    if (!ctx.blockEntities.length) none++;
  }
  check('...at 5% most trees have none', none >= 30, `${none}`);
  // a sapling by a flower: sometimes bees
  const { level, world } = setup();
  put(world, 1, 64, 0, 'poppy');
  let withBees = 0;
  for (let i = 0; i < 60; i++) {
    const x = -40 + (i % 10) * 8, z = -40 + Math.floor(i / 10) * 8;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let y = 64; y < 80; y++) put(world, x + dx, y, z + dz, 0);
    put(world, x + 1, 64, z, 'poppy');
    if (!M['game/randomTicks'].growTreeInWorld(level, 'oak', x, 64, z, 1)) continue;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let y = 64; y < 72; y++) if (H.hiveAt(level, x + dx, y, z + dz)?.occupantCount() >= 2) withBees++;
  }
  check('a sapling grown with bees (a flower near it) gets a nest with its bees', withBees > 30, `${withBees}`);
}

// ---------------------------------------------------------------------------
// saving, /summon
{
  const { level, player } = setup();
  const b = spawn(level, 0.5, 65, 0.5);
  b.hivePos = [1, 64, 2];
  b.savedFlowerPos = [3, 64, 4];
  b.setHasNectar(true);
  b.hasStung = true;
  b.clock.stayOutOfHive = 123;
  b.clock.cropsGrown = 4;
  b.setTarget(player);
  b.angerTime = 300;
  b.angerTarget = player;
  const s = JSON.parse(JSON.stringify(b.save()));
  const c = new Bee(level);
  c.load(s);
  check('saved: its hive, its flower, its nectar, its stinger, how long it keeps out, the crops grown, its anger', c.hivePos?.join() === '1,64,2' && c.savedFlowerPos?.join() === '3,64,4' && c.hasNectar && c.hasStung && c.clock.stayOutOfHive === 123 && c.clock.cropsGrown === 4 && c.angerTime === 300, JSON.stringify(s.data));
  const be = hive(level, 5, 64, 5, { n: 2, h: 2, ticks: 77 });
  be.savedFlowerPos = [9, 64, 9];
  const d = JSON.parse(JSON.stringify(be.save()));
  const again = new H.BeehiveBlockEntity(5, 64, 5, 'bee_nest');
  again.load(d);
  check('...a nest its bees (and how long they\'ve been in) and its flower', again.occupantCount() === 2 && again.bees()[0].ticksInHive === 77 && again.savedFlowerPos?.join() === '9,64,9');
  const cmd = M['game/commands'];
  const game = { meta: { allowCommands: true }, chat() {}, player, playerName: 'Tester', level, world: level.world, sound: { play() {} }, applyGameRules() {}, teleport() {}, changeDimension() {} };
  const n0 = bees(level).length;
  cmd.executeCommand(game, 'summon bee 2.5 66 2.5 {HasNectar:1b,HasStung:0b,hive_pos:[I;5,64,5],flower_pos:[I;9,64,9],Age:-24000,CannotEnterHiveTicks:200}');
  const sb = bees(level).find((e) => e !== b && Math.abs(e.x - 2.5) < 0.01);
  check('/summon bee with its entity data: nectar, its hive and flower, a baby, kept out of the hive', bees(level).length === n0 + 1 && sb?.hasNectar && sb.hivePos?.join() === '5,64,5' && sb.savedFlowerPos?.join() === '9,64,9' && sb.isBaby() && sb.clock.stayOutOfHive === 200, `${sb?.hivePos} ${sb?.hasNectar}`);
}

// ---------------------------------------------------------------------------
// sounds
{
  const SND = M['audio/synth'].SOUNDS;
  const want = [
    ...['loop', 'loop_aggressive', 'hurt', 'death', 'sting', 'pollinate'].map((n) => 'entity.bee.' + n),
    ...['enter', 'exit', 'work', 'shear', 'drip'].map((n) => 'block.beehive.' + n),
    ...['break', 'step', 'place', 'hit', 'fall', 'slide'].map((n) => 'block.honey_block.' + n),
    ...['break', 'step', 'place', 'hit', 'fall'].map((n) => 'block.coral_block.' + n),
  ];
  const bad = [];
  let takes = 0;
  for (const n of want) {
    const s = SND[n];
    if (!s) { bad.push(`${n} missing`); continue; }
    for (let i = 0; i < s.variants; i++) {
      const buf = s.generate(i, 22050);
      let pk = 0;
      for (const v of buf) if (!Number.isFinite(v)) { pk = NaN; break; } else pk = Math.max(pk, Math.abs(v));
      if (!(pk > 0.3 && pk <= 1)) bad.push(`${n}#${i} peak ${pk}`);
      takes++;
    }
  }
  check(`the bee's, the hive's, the honey block's and the coral block's sounds (${takes} takes)`, bad.length === 0, bad.join(', '));
  const loop = SND['entity.bee.loop'].generate(0, 22050);
  check('...the buzz loops (2 seconds or more)', loop.length > 44100);
  check('the honey block sounds as honey, the honeycomb block as coral', getBlock('honey_block').sound === 'honey_block' && getBlock('honeycomb_block').sound === 'coral_block' && getBlock('bee_nest').sound === 'wood');
}

// ---------------------------------------------------------------------------
// textures, the model, the renderer
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
  const RR = M['render/beeRenderer'];
  const opaqueIn = (img, [x0, y0, w, h]) => { let n = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (img.data[(y * img.w + x) * 4 + 3]) n++; return n; };
  const def = RR.beeModel();
  const cubes = [];
  walk(def.root, 'root', cubes);
  const bad = [];
  const imgs = {};
  for (const n of ['bee', 'bee_angry', 'bee_nectar', 'bee_angry_nectar']) {
    const img = MT[n]?.();
    imgs[n] = img;
    if (!img || img.w !== 64 || img.h !== 64) { bad.push(`${n} missing`); continue; }
    for (const [cn, c] of cubes) for (const [f, r] of Object.entries(faces(c))) {
      if (!r[2] || !r[3]) continue;
      const flat = !c.w || !c.h || !c.d;
      const o = opaqueIn(img, r), all = r[2] * r[3];
      // (the wings see-through, the legs and antennae as their shapes)
      if (/wing/.test(cn)) { if (o < all * 0.3) bad.push(`${n} ${cn}.${f} ${o}/${all}`); continue; }
      if (flat || /antenna|legs/.test(cn)) { if (o < 1) bad.push(`${n} ${cn}.${f} empty`); continue; }
      if (o !== all) bad.push(`${n} ${cn}.${f} ${o}/${all}`);
    }
  }
  check('the four bee skins (calm or angry, with nectar or not): 64x64, the body painted all round, wings and legs', bad.length === 0, bad.slice(0, 8).join(', '));
  const differ = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
  check('...angry, its eyes differ; with nectar, its fur', imgs.bee && differ(imgs.bee, imgs.bee_angry) > 0 && differ(imgs.bee, imgs.bee_nectar) > 0 && differ(imgs.bee_angry, imgs.bee_angry_nectar) > 0);
  const names = [];
  const collect = (p, nm) => { names.push(nm); for (const [n, ch] of p.children) collect(ch, n); };
  collect(def.root, 'top');
  check('the model: a bone with the body (stinger, antennae), two wings, three pairs of legs', ['bone', 'body', 'stinger', 'left_antenna', 'right_antenna', 'left_wing', 'right_wing', 'front_legs', 'middle_legs', 'back_legs'].every((n) => names.includes(n)) && def.texW === 64 && def.texH === 64);
  const BT = M['textures/blocks'].BLOCK_TEXTURES;
  const IT = M['textures/items'].ITEM_TEXTURES;
  const opaque = (t) => { let n = 0; for (let k = 3; k < t.data.length; k += 4) if (t.data[k]) n++; return n; };
  const btex = ['bee_nest_front_honey', 'bee_nest_bottom', 'beehive_end', 'beehive_side', 'beehive_front', 'beehive_front_honey', 'honeycomb_block', 'bee_nest_top', 'bee_nest_side', 'bee_nest_front'];
  const missing = btex.filter((n) => !BT[n] || opaque(BT[n]()) !== 256);
  check('the nest\'s and the hive\'s faces (with honey too), the honeycomb block\'s; the honey block\'s bottom (see-through), the egg', missing.length === 0 && BT.honey_block_bottom && opaque(BT.honey_block_bottom()) > 0 && IT.bee_spawn_egg, missing.join());

  const { level } = setup();
  let quads = 0;
  const drawn = [];
  const batch = { quad() { quads++; }, begin() {}, flush() {}, setOverlay() {}, lightB: 96, lightS: 100, color: [1, 1, 1, 1] };
  const pose = new M['render/entityRenderer'].PoseStack();
  const A = { limbSwing: 0, limbAmount: 0, age: 100, headYaw: 0, headPitch: 0 };
  const kit = {
    pose, items: { render() {} }, tex: (n) => (MT[n] ? { n } : null),
    setupLiving: () => { pose.reset(); return A; }, overlay() {},
    drawBody: (b, e, d, tex) => { drawn.push(tex.n); d.root.render(b, pose, d.texW, d.texH); },
    state: (t, extra) => ({ texture: t, ...extra }), attackAnim: () => 0,
  };
  const rr = new RR.BeeRenderers(kit);
  const b = spawn(level, 0.5, 66, 0.5);
  const pig = spawn(level, 4.5, 64, 0.5, { type: 'pig' });
  const ok1 = rr.render(batch, b, 0, 0, 0, 0.5) && !rr.render(batch, pig, 0, 0, 0, 0.5);
  b.angerTime = 100;
  b.hasNectar = true;
  rr.render(batch, b, 0, 0, 0, 0.5);
  check('drawn in its skin (angry with nectar: bee_angry_nectar), not a pig', ok1 && quads > 0 && drawn.join() === 'bee,bee_angry_nectar', drawn.join());
  const root = def.root;
  b.onGround = false;
  RR.animateBee(root, b, 3.3, 0);
  const wz = root.child('bone').child('right_wing').zRot;
  b.onGround = true;
  b.dx = b.dy = b.dz = 0;
  RR.animateBee(root, b, 3.3, 0);
  check('flying, its wings beat; at rest on the ground they lie folded', Math.abs(wz) > 0.05 && root.child('bone').child('right_wing').zRot === 0 && near(root.child('bone').child('right_wing').yRot, -0.2618));
  b.onGround = false;
  b.hasStung = true;
  RR.animateBee(root, b, 3.3, 1);
  check('...stung, no stinger; rolling, turned over on its back', !root.child('bone').child('body').child('stinger').visible && root.child('bone').xRot > 3);
  check('its shadow: 0.4', RR.BEE_SHADOW_RADII.bee === 0.4);
}

close?.();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);

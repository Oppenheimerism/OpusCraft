// M2c: dispensers and droppers on a flat stone world with a ticking Level — placement, the 9-slot block entity,
// triggering (4 ticks after a rising edge, quasi-connectivity), the random slot, what a dispenser does with each
// item it knows, the dropper into the containers in front, loot tables, the 3x3 menu, drops and recipes.

import { load, check, flatLevel, place, prop, ticks, blockName, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/inventory/recipes.ts', '/src/inventory/dispenserMenu.ts', '/src/game/redstone/dispenser.ts', '/src/game/redstone/dispenseItems.ts',
  '/src/entity/arrow.ts', '/src/entity/throwable.ts', '/src/entity/thrownPotion.ts', '/src/entity/thrownExperienceBottle.ts',
  '/src/entity/thrownTrident.ts', '/src/entity/fireball.ts', '/src/entity/boat.ts', '/src/entity/minecart.ts', '/src/entity/animals.ts',
  '/src/entity/xpOrb.ts', '/src/entity/ironGolem.ts', '/src/entity/player.ts', '/src/item/potions.ts', '/src/core/aabb.ts',
]);
const G = 64; // the floor: stone below, air from y 64
const [DOWN, UP, NORTH, SOUTH, WEST, EAST] = [0, 1, 2, 3, 4, 5];
const DIR = ['down', 'up', 'north', 'south', 'west', 'east'];
const STEP = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const count = (sounds, name) => sounds.filter((s) => s.name === name).length;
const live = (level, cls) => level.entities.filter((e) => !e.removed && (!cls || e instanceof cls));
const items = (level, id) => live(level, m.ItemEntity).filter((e) => !id || e.stack.item.id === id);

/** a dispenser (or dropper) facing `facing` at (x, y, z), its block entity */
function dispenser(level, x, y, z, facing, kind = 'dispenser') {
  place(m, level, kind, x, y, z, { props: { facing: DIR[facing] } });
  return level.world.getBlockEntity(x, y, z);
}

/** power it for `n` ticks from a redstone block at (px, py, pz), then take the power away */
function pulse(level, [px, py, pz], n = 6) {
  place(m, level, 'redstone_block', px, py, pz);
  ticks(level, n);
  level.setBlock(px, py, pz, 0);
  ticks(level, 1);
}

/** a dispense source as the block gives one (for a behaviour tried on its own) */
function source(level, x, y, z, facing) {
  return { level, x, y, z, facing, be: level.world.getBlockEntity(x, y, z), success: true };
}

/** the dispenser's own behaviour for `s`, as dispenseFrom runs it: what's left for the slot */
function dispense(src, s) {
  return m.dispenseBehaviorFor(s)(src, s);
}

// ---------------------------------------------------------------------------------------------------------------
// The block

{
  const { level, world } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'dispenser', 0, G, 0, { yaw: 0, pitch: 0 }); // looking south
  check('placement: it faces the player (looking south, it faces north)', prop(m, level, 0, G, 0, 'facing') === 'north', prop(m, level, 0, G, 0, 'facing'));
  place(m, level, 'dispenser', 2, G, 0, { yaw: 0, pitch: 80 }); // looking down
  check('placement: looking down at it, it faces up', prop(m, level, 2, G, 0, 'facing') === 'up', prop(m, level, 2, G, 0, 'facing'));
  place(m, level, 'dropper', 4, G + 3, 0, { yaw: 0, pitch: -80 }); // looking up
  check('placement: looking up at it, it faces down', prop(m, level, 4, G + 3, 0, 'facing') === 'down', prop(m, level, 4, G + 3, 0, 'facing'));
  check('placement: not triggered', prop(m, level, 0, G, 0, 'triggered') === false);
  const be = world.getBlockEntity(0, G, 0);
  const dbe = world.getBlockEntity(4, G + 3, 0);
  check('block entity: a dispenser has nine slots', be instanceof m.DispenserBlockEntity && be.container.size === 9 && be.id === 'dispenser');
  check('block entity: so does a dropper', dbe instanceof m.DispenserBlockEntity && dbe.container.size === 9 && dbe.id === 'dropper');
  const saved = (() => {
    be.container.set(4, stack('arrow', 12));
    be.lootTable = 'chests/desert_pyramid';
    be.lootSeed = 77;
    const d = be.save();
    const copy = m.loadBlockEntity(d);
    return copy instanceof m.DispenserBlockEntity && copy.id === 'dispenser' && copy.container.get(4)?.count === 12 && copy.lootTable === 'chests/desert_pyramid' && copy.lootSeed === 77;
  })();
  check('block entity: saved and loaded with its items and loot table', saved);
  be.lootTable = null;
  const b = m.getBlock('dispenser');
  check('block: 3.5 hard, a pickaxe to mine', b.hardness === 3.5 && m.getBlock('dropper').hardness === 3.5);
  const drop = (name, tool) => m.blockDrops(m.getBlock(name).defaultState, tool ? m.ITEMS.get(tool) : null, new m.Rand(1)).map((s) => `${s.item.id}x${s.count}`).join();
  check('drops: itself with a pickaxe, nothing by hand', drop('dispenser', 'stone_pickaxe') === 'dispenserx1' && drop('dropper', 'wooden_pickaxe') === 'dropperx1' && drop('dispenser') === '', `${drop('dispenser', 'stone_pickaxe')} ${drop('dispenser')}`);
  // broken, it spills what it holds
  be.container.set(0, stack('stone', 5));
  be.container.set(8, stack('egg', 3));
  level.destroyBlock(0, G, 0, true, m.ITEMS.get('stone_pickaxe'));
  // (vanilla Containers.dropItemStack drops a stack in parts of 10-30: the 12 arrows may come out as two)
  const spiltCounts = {};
  for (const e of items(level)) spiltCounts[e.stack.item.id] = (spiltCounts[e.stack.item.id] ?? 0) + e.stack.count;
  const spilt = Object.entries(spiltCounts).map(([id, n]) => `${id}x${n}`).sort().join();
  check('broken: its contents spill out with it', spilt === 'arrowx12,dispenserx1,eggx3,stonex5', spilt);
}

// ---------------------------------------------------------------------------------------------------------------
// Triggering

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  const be = dispenser(level, 0, G, 0, EAST);
  be.container.set(0, stack('arrow', 64));
  place(m, level, 'redstone_block', -1, G, 0); // behind it
  check('trigger: power marks it triggered at once', prop(m, level, 0, G, 0, 'triggered') === true);
  ticks(level, 3);
  const early = live(level, m.Arrow).length;
  ticks(level, 1);
  check('trigger: it fires 4 ticks later, not before', early === 0 && live(level, m.Arrow).length === 1, `${early} ${live(level, m.Arrow).length}`);
  check('trigger: one arrow used', be.container.get(0).count === 63);
  ticks(level, 20);
  check('trigger: held powered it fires once', live(level, m.Arrow).length === 1 && prop(m, level, 0, G, 0, 'triggered') === true);
  level.setBlock(-1, G, 0, 0);
  check('trigger: power gone, it\'s ready again', prop(m, level, 0, G, 0, 'triggered') === false);
  pulse(level, [-1, G, 0]);
  check('trigger: another pulse, another arrow', live(level, m.Arrow).length === 2 && be.container.get(0).count === 62);
  check('trigger: arrows go with the launch sound (pitch 1.2)', count(sounds, 'block.dispenser.launch') === 2 && sounds.filter((s) => s.name === 'block.dispenser.launch').every((s) => s.pitch === 1.2));
  // power from above: a redstone block over the block over it
  place(m, level, 'redstone_block', 0, G + 2, 0);
  ticks(level, 6);
  check('quasi-connectivity: power by the block above isn\'t news to it', prop(m, level, 0, G, 0, 'triggered') === false && live(level, m.Arrow).length === 2);
  place(m, level, 'stone', 0, G, 1); // anything changing beside it
  check('quasi-connectivity: an update beside it and it sees it', prop(m, level, 0, G, 0, 'triggered') === true);
  ticks(level, 4);
  check('quasi-connectivity: and fires', live(level, m.Arrow).length === 3);
  level.setBlock(0, G + 2, 0, 0);
  level.setBlock(0, G, 1, 0);
  // empty, it clicks
  const empty = dispenser(level, 0, G, 6, EAST);
  pulse(level, [-1, G, 6]);
  check('empty: it clicks the higher click (pitch 1.2) and gives nothing', count(sounds, 'block.dispenser.fail') === 1 && sounds.find((s) => s.name === 'block.dispenser.fail').pitch === 1.2 && empty.container.items.every((s) => !s));
  // lever, and a torch under it (powering the block it stands on) don't trigger what's beside that block from below
  const lamp = dispenser(level, 5, G, 0, UP);
  lamp.container.set(0, stack('snowball', 4));
  place(m, level, 'lever', 5, G, 1, { face: 3, props: { face: 'wall', facing: 'south', powered: false } });
  const lv = level.getState(5, G, 1);
  m.behaviorOf(lv).use(level, 5, G, 1, lv, { player: { gameMode: 'survival' }, face: 3, hx: 5.5, hy: G + 0.5, hz: 1.5 });
  ticks(level, 5);
  check('trigger: a lever on its side fires it', lamp.container.get(0).count === 3);
}

// ---------------------------------------------------------------------------------------------------------------
// The random slot

{
  const { level } = flatLevel(m, -1, -1, 0, 0);
  const be = dispenser(level, 0, G, 0, EAST);
  const r = new m.Rand(12345);
  check('random slot: empty, none', be.randomSlot(r) === -1);
  for (const i of [1, 4, 7]) be.container.set(i, stack('stone', 64));
  const hits = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let n = 0; n < 3000; n++) hits[be.randomSlot(r)]++;
  const share = [1, 4, 7].map((i) => hits[i] / 3000);
  check('random slot: only filled slots, each as likely', hits.reduce((a, b) => a + b) === hits[1] + hits[4] + hits[7] && share.every((f) => f > 0.3 && f < 0.37), share.join());
}

// ---------------------------------------------------------------------------------------------------------------
// Dropping: anything it has nothing else to do with

{
  const { level, sounds, particles } = flatLevel(m, -1, -1, 1, 1);
  dispenser(level, 0, G, 0, EAST);
  const src = source(level, 0, G, 0, EAST);
  const s = stack('stone', 10);
  const left = dispense(src, s);
  const [e] = items(level, 'stone');
  check('drop: one of it is thrown out', left === s && s.count === 9 && e && e.stack.count === 1);
  check('drop: from 0.7 out of its middle, a little low', e && near(e.x, 1.2) && near(e.y, G + 0.5 - 0.15625) && near(e.z, 0.5), e && `${e.x} ${e.y} ${e.z}`);
  check('drop: off out of the front and up', e && e.dx > 0.1 && e.dx < 0.4 && e.dy > 0.1 && e.dy < 0.3 && Math.abs(e.dz) < 0.11, e && `${e.dx} ${e.dy} ${e.dz}`);
  check('drop: with the click and ten puffs of smoke', count(sounds, 'block.dispenser.dispense') === 1 && sounds[0].pitch === 1 && particles.filter((p) => p.kind === 'smoke').length === 10);
  // down, from its middle less far down
  dispenser(level, 4, G + 2, 0, DOWN);
  dispense(source(level, 4, G + 2, 0, DOWN), stack('dirt'));
  const [d] = items(level, 'dirt');
  check('drop: facing down, it comes out under it', d && near(d.x, 4.5) && near(d.y, G + 2 + 0.5 - 0.7 - 0.125) && near(d.z, 0.5), d && `${d.x} ${d.y} ${d.z}`);
  const one = stack('stick', 1);
  check('drop: the last one leaves the slot empty', dispense(src, one) === null);
}

// ---------------------------------------------------------------------------------------------------------------
// Projectiles

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  dispenser(level, 0, G, 0, EAST);
  const src = source(level, 0, G, 0, EAST);
  const speed = (e) => Math.hypot(e.dx, e.dy, e.dz);
  const s = stack('arrow', 5);
  dispense(src, s);
  const [a] = live(level, m.Arrow);
  check('arrow: shot out of the front, 0.7 out and 0.1 up', a && near(a.x, 1.2) && near(a.y, G + 0.6) && near(a.z, 0.5), a && `${a.x} ${a.y} ${a.z}`);
  // (1.1, each axis off by up to 0.0172275 * 6 of it: 0.98-1.22)
  check('arrow: at about 1.1, eastward', a && speed(a) > 0.97 && speed(a) < 1.23 && a.dx > 0.97, a && `${speed(a)} ${a.dx}`);
  check('arrow: it can be picked up, one used', a?.pickup === 'allowed' && s.count === 4);
  check('arrow: with the launch sound', count(sounds, 'block.dispenser.launch') === 1);
  const tipped = m.potionStack('tipped_arrow', 'poison');
  dispense(src, tipped);
  const t = live(level, m.Arrow).find((e) => e !== a);
  check('tipped arrow: it keeps its potion', t?.pickupItem.item.id === 'tipped_arrow' && m.contentsOf(t.pickupItem)?.potion === 'poison');
  const tri = stack('trident');
  tri.damage = 17;
  const trLeft = dispense(src, tri);
  const [tr] = live(level, m.ThrownTrident);
  check('trident: thrown as it is (its wear kept), to be picked up', trLeft === null && tr && tr.pickup === 'allowed' && tr.pickupItem.damage === 17 && speed(tr) > 0.97);
  dispense(src, stack('snowball', 16));
  dispense(src, stack('egg', 16));
  const thrown = live(level, m.ThrownItem).map((e) => e.kind ?? e.type).sort().join();
  check('snowballs and eggs are thrown', /egg/.test(thrown) && /snowball/.test(thrown), thrown);
  dispense(src, m.potionStack('splash_potion', 'healing'));
  dispense(src, m.potionStack('lingering_potion', 'poison'));
  const pots = live(level, m.ThrownPotion).filter((e) => !(e instanceof m.ThrownExperienceBottle));
  check('potions: splash and lingering ones are thrown, faster (about 1.375)', pots.length === 2 && pots.every((p) => speed(p) > 1.25 && speed(p) < 1.5), pots.map(speed).join());
  check('potions: each its own potion', pots.map((p) => m.contentsOf(p.stack)?.potion).sort().join() === 'healing,poison');
  // a fire charge: a small fireball from the front face, with the blaze's sound
  const fc = stack('fire_charge', 2);
  dispense(src, fc);
  const [ball] = live(level, m.SmallFireball);
  check('fire charge: a small fireball out of the front face', ball && near(ball.x, 1.5) && near(ball.y, G + 0.5) && near(ball.z, 0.5) && ball.dx > 0.08 && fc.count === 1, ball && `${ball.x} ${ball.y} ${ball.dx}`);
  const blaze = sounds.find((x) => x.name === 'entity.blaze.shoot');
  check('fire charge: with the blaze\'s shot (volume 2)', blaze?.volume === 2);
}

{
  // a bottle o' enchanting breaks where it lands and leaves experience
  const { level } = flatLevel(m, -1, -1, 1, 1);
  dispenser(level, 0, G, 0, EAST);
  dispense(source(level, 0, G, 0, EAST), stack('experience_bottle'));
  const [b] = live(level, m.ThrownExperienceBottle);
  let t = 0;
  while (b && !b.removed && t < 100) {
    level.tick();
    t++;
  }
  const xp = live(level, m.ExperienceOrb).reduce((a, o) => a + o.value, 0);
  check('experience bottle: thrown, it breaks and leaves 3 to 11 experience', b && b.removed && xp >= 3 && xp <= 11, `${t} ticks, ${xp}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Things set down in front: spawn eggs, boats, minecarts, TNT

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  dispenser(level, 0, G, 0, EAST);
  const src = source(level, 0, G, 0, EAST);
  const egg = stack('pig_spawn_egg', 3);
  dispense(src, egg);
  const [pig] = live(level, m.Pig);
  check('spawn egg: the mob stands in the block in front', pig && near(pig.x, 1.5) && near(pig.y, G) && near(pig.z, 0.5) && egg.count === 2, pig && `${pig.x} ${pig.y} ${pig.z}`);
  place(m, level, 'stone_slab', 1, G, 2, { props: { type: 'bottom' } });
  dispenser(level, 0, G, 2, EAST);
  dispense(source(level, 0, G, 2, EAST), stack('sheep_spawn_egg'));
  const [sheep] = live(level, m.Sheep);
  check('spawn egg: on a slab it stands on the slab', sheep && near(sheep.y, G + 0.5), sheep && `${sheep.y}`);
  // TNT, primed where it would stand
  dispenser(level, 0, G, 4, EAST);
  const tnt = stack('tnt', 2);
  dispense(source(level, 0, G, 4, EAST), tnt);
  const [pt] = live(level, m.PrimedTnt);
  check('tnt: primed in front, hissing', pt && near(pt.x, 1.5) && near(pt.y, G) && near(pt.z, 4.5) && tnt.count === 1 && count(sounds, 'entity.tnt.primed') === 1);
}

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  // boats: onto water in front (1.25 out, raised a block), onto water under an empty front, else thrown out
  for (let x = 1; x <= 3; x++) level.setBlock(x, G - 1, 0, m.S('water'));
  level.setBlock(1, G, 0, m.S('water'));
  dispenser(level, 0, G, 0, EAST);
  const boat = stack('spruce_boat');
  check('boat: none left of it', dispense(source(level, 0, G, 0, EAST), boat) === null);
  const [b] = live(level, m.Boat);
  check('boat: on the water in front, turned its way', b && near(b.x, 1.75) && near(b.y, G + 1.5) && near(b.z, 0.5) && b.variant === 'spruce' && b.yaw === 270, b && `${b.x} ${b.y} ${b.yaw} ${b.variant}`);
  dispenser(level, 1, G + 1, 1, SOUTH);
  level.setBlock(1, G - 1, 2, m.S('water'));
  level.setBlock(1, G, 2, m.S('water'));
  dispenser(level, 2, G, 2, WEST);
  const cb = stack('birch_chest_boat');
  dispense(source(level, 2, G, 2, WEST), cb);
  check('chest boat: set down as a chest boat', live(level, m.ChestBoat).length === 1 && live(level, m.ChestBoat)[0].variant === 'birch');
  // over water with air in front
  level.setBlock(6, G - 1, 5, m.S('water'));
  dispenser(level, 5, G, 5, EAST);
  dispense(source(level, 5, G, 5, EAST), stack('oak_boat'));
  const over = live(level, m.Boat).find((e) => near(e.z, 5.5));
  check('boat: onto water under an empty front, at its own height', over && near(over.y, G + 0.5), over && `${over.y}`);
  // on stone it's just thrown out (with a second click: vanilla's)
  dispenser(level, 5, G, 8, EAST);
  const before = count(sounds, 'block.dispenser.dispense');
  const dry = stack('oak_boat');
  dispense(source(level, 5, G, 8, EAST), dry);
  check('boat: with no water it\'s thrown out as an item', items(level, 'oak_boat').length === 1 && count(sounds, 'block.dispenser.dispense') - before === 2);
}

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  // minecarts: onto a rail in front, or onto a rail under an empty front; else thrown out
  place(m, level, 'rail', 1, G, 0);
  dispenser(level, 0, G, 0, EAST);
  dispense(source(level, 0, G, 0, EAST), stack('minecart'));
  const [c] = live(level, m.Minecart);
  check('minecart: on the rail in front', c && near(c.x, 1.625) && near(c.y, G + 0.1) && near(c.z, 0.5), c && `${c.x} ${c.y} ${c.z}`);
  place(m, level, 'rail', 1, G, 3);
  dispenser(level, 0, G + 1, 3, EAST);
  dispense(source(level, 0, G + 1, 3, EAST), stack('chest_minecart'));
  const [cc] = live(level, m.MinecartChest);
  check('chest minecart: onto the rail under an empty front', cc && near(cc.y, G + 1 - 0.9), cc && `${cc.y}`);
  dispenser(level, 0, G, 6, EAST);
  dispense(source(level, 0, G, 6, EAST), stack('minecart'));
  check('minecart: no rail, thrown out', items(level, 'minecart').length === 1);
}

// ---------------------------------------------------------------------------------------------------------------
// Buckets and bottles

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  dispenser(level, 0, G, 0, EAST);
  const src = source(level, 0, G, 0, EAST);
  const wb = dispense(src, stack('water_bucket'));
  check('water bucket: water in front, an empty bucket back', blockName(m, level.getState(1, G, 0)) === 'water' && prop(m, level, 1, G, 0, 'level') === 0 && wb?.item.id === 'bucket');
  check('water bucket: with the emptying sound', count(sounds, 'item.bucket.empty') === 1);
  // back up again with the empty bucket
  const full = dispense(src, wb);
  check('bucket: takes the water back up (one bucket: it becomes the full one)', blockName(m, level.getState(1, G, 0)) === 'air' && full?.item.id === 'water_bucket');
  // lava onto short grass (broken first)
  place(m, level, 'short_grass', 1, G, 2);
  dispenser(level, 0, G, 2, EAST);
  const lb = dispense(source(level, 0, G, 2, EAST), stack('lava_bucket'));
  check('lava bucket: onto short grass, which goes', blockName(m, level.getState(1, G, 2)) === 'lava' && lb?.item.id === 'bucket' && count(sounds, 'item.bucket.empty_lava') === 1);
  // into a block that can hold water
  place(m, level, 'oak_stairs', 1, G, 4, { props: { facing: 'east' } });
  dispenser(level, 0, G, 4, EAST);
  dispense(source(level, 0, G, 4, EAST), stack('water_bucket'));
  check('water bucket: stairs in front are waterlogged', blockName(m, level.getState(1, G, 4)) === 'oak_stairs' && prop(m, level, 1, G, 4, 'waterlogged') === true);
  // several buckets: the full one goes into a free slot
  const be6 = dispenser(level, 0, G, 6, EAST);
  level.setBlock(1, G, 6, m.S('water'));
  const buckets = stack('bucket', 3);
  be6.container.set(0, buckets);
  const kept = dispense(source(level, 0, G, 6, EAST), buckets);
  check('bucket: of several, one fills and goes to a free slot', kept === buckets && buckets.count === 2 && be6.container.get(1)?.item.id === 'water_bucket');
  // no room: the full one is thrown out
  const be8 = dispenser(level, 0, G, 8, EAST);
  level.setBlock(1, G, 8, m.S('water'));
  for (let i = 0; i < 9; i++) be8.container.set(i, stack('bucket', 16));
  dispense(source(level, 0, G, 8, EAST), be8.container.get(0));
  check('bucket: with no free slot the full one is thrown out', items(level, 'water_bucket').length === 1 && be8.container.get(0).count === 15);
  // flowing water can't be taken up: the bucket is thrown out
  const be10 = dispenser(level, 5, G, 0, EAST);
  level.setBlock(6, G, 0, m.getBlock('water').state({ level: 3 }));
  const e1 = dispense(source(level, 5, G, 0, EAST), stack('bucket'));
  check('bucket: flowing water isn\'t taken, the bucket is thrown out', e1 === null && items(level, 'bucket').length === 1 && be10 && blockName(m, level.getState(6, G, 0)) === 'water');
  // a water bucket at stone is thrown out full
  dispenser(level, 5, G, 2, EAST);
  place(m, level, 'stone', 6, G, 2);
  dispense(source(level, 5, G, 2, EAST), stack('water_bucket'));
  check('water bucket: at stone it\'s thrown out full', items(level, 'water_bucket').length === 2);
}

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  // glass bottles: filled from water in front
  dispenser(level, 0, G, 0, EAST);
  level.setBlock(1, G, 0, m.S('water'));
  const one = dispense(source(level, 0, G, 0, EAST), stack('glass_bottle'));
  check('glass bottle: filled with water from in front', one?.item.id === 'potion' && m.contentsOf(one)?.potion === 'water' && blockName(m, level.getState(1, G, 0)) === 'water');
  dispenser(level, 0, G, 2, EAST);
  const before = count(sounds, 'block.dispenser.fail');
  dispense(source(level, 0, G, 2, EAST), stack('glass_bottle', 4));
  check('glass bottle: no water, thrown out with the failed click', items(level, 'glass_bottle').length === 1 && count(sounds, 'block.dispenser.fail') === before + 1);
  // water bottles make mud of dirt
  for (const [z, dirt] of [[4, 'dirt'], [6, 'coarse_dirt'], [8, 'rooted_dirt']]) {
    place(m, level, dirt, 1, G, z);
    dispenser(level, 0, G, z, EAST);
    const back = dispense(source(level, 0, G, z, EAST), m.potionStack('potion', 'water'));
    check(`water bottle: ${dirt} in front turns to mud, an empty bottle back`, blockName(m, level.getState(1, G, z)) === 'mud' && back?.item.id === 'glass_bottle');
  }
  check('water bottle: poured with its sound', count(sounds, 'item.bottle.empty') === 3);
  dispenser(level, 4, G, 0, EAST);
  place(m, level, 'stone', 5, G, 0);
  dispense(source(level, 4, G, 0, EAST), m.potionStack('potion', 'water'));
  dispense(source(level, 4, G, 0, EAST), m.potionStack('potion', 'healing'));
  check('potions: not onto dirt, or not water, they\'re thrown out', items(level, 'potion').length === 2);
}

// ---------------------------------------------------------------------------------------------------------------
// Tools: flint and steel, bone meal, shears

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  dispenser(level, 0, G, 0, EAST);
  const fs = stack('flint_and_steel');
  const left = dispense(source(level, 0, G, 0, EAST), fs);
  check('flint and steel: sets a fire in front, a point of wear', blockName(m, level.getState(1, G, 0)) === 'fire' && left === fs && fs.damage === 1);
  place(m, level, 'tnt', 1, G, 2);
  dispenser(level, 0, G, 2, EAST);
  dispense(source(level, 0, G, 2, EAST), stack('flint_and_steel'));
  check('flint and steel: lights TNT in front', blockName(m, level.getState(1, G, 2)) === 'air' && live(level, m.PrimedTnt).length === 1);
  place(m, level, 'campfire', 1, G, 4, { props: { lit: false } });
  dispenser(level, 0, G, 4, EAST);
  dispense(source(level, 0, G, 4, EAST), stack('flint_and_steel'));
  check('flint and steel: lights a campfire that\'s out', prop(m, level, 1, G, 4, 'lit') === true);
  place(m, level, 'stone', 1, G, 6);
  dispenser(level, 0, G, 6, EAST);
  const fail = count(sounds, 'block.dispenser.fail');
  const idle = stack('flint_and_steel');
  dispense(source(level, 0, G, 6, EAST), idle);
  check('flint and steel: nothing to light, the failed click and no wear', idle.damage === 0 && count(sounds, 'block.dispenser.fail') === fail + 1);
  const worn = stack('flint_and_steel');
  worn.damage = worn.item.maxDamage - 1;
  level.setBlock(1, G, 0, 0);
  check('flint and steel: worn out, it\'s gone', dispense(source(level, 0, G, 0, EAST), worn) === null && blockName(m, level.getState(1, G, 0)) === 'fire');
}

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  level.setBlock(1, G - 1, 0, m.S('farmland'));
  place(m, level, 'wheat', 1, G, 0, { props: { age: 0 } });
  dispenser(level, 0, G, 0, EAST);
  const bm = stack('bone_meal', 8);
  dispense(source(level, 0, G, 0, EAST), bm);
  check('bone meal: grows the crop in front, one used', prop(m, level, 1, G, 0, 'age') >= 2 && bm.count === 7);
  check('bone meal: with its sound, not the failed click', count(sounds, 'item.bone_meal.use') === 1 && count(sounds, 'block.dispenser.fail') === 0 && count(sounds, 'block.dispenser.dispense') === 1);
  place(m, level, 'stone', 1, G, 2);
  dispenser(level, 0, G, 2, EAST);
  dispense(source(level, 0, G, 2, EAST), bm);
  check('bone meal: on stone, nothing used and the failed click', bm.count === 7 && count(sounds, 'block.dispenser.fail') === 1);
}

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  const sheep = new m.Sheep(level);
  sheep.moveTo(1.5, G, 0.5, 0, 0);
  level.addEntity(sheep);
  dispenser(level, 0, G, 0, EAST);
  const sh = stack('shears');
  dispense(source(level, 0, G, 0, EAST), sh);
  check('shears: a sheep in front is shorn, a point of wear', sheep.sheared && items(level).some((e) => e.stack.item.id.endsWith('_wool')) && sh.damage === 1 && count(sounds, 'entity.sheep.shear') === 1);
  dispense(source(level, 0, G, 0, EAST), sh);
  check('shears: a shorn sheep isn\'t, the failed click', sh.damage === 1 && count(sounds, 'block.dispenser.fail') === 1);
}

// ---------------------------------------------------------------------------------------------------------------
// Things put on what stands in front: armour, shields, pumpkins, saddles

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  const z = new m.Zombie(level);
  z.moveTo(1.5, G, 0.5, 0, 0);
  z.canPickUpLoot = true;
  level.addEntity(z);
  z.tick();
  dispenser(level, 0, G, 0, EAST);
  const helm = stack('iron_helmet', 1);
  const left = dispense(source(level, 0, G, 0, EAST), helm);
  check('armour: a zombie in front puts on the helmet', left === null && z.getItemBySlot('head')?.item.id === 'iron_helmet');
  check('armour: it keeps it, drops it, and stays', z.persistenceRequired === true);
  const helm2 = stack('golden_helmet');
  dispense(source(level, 0, G, 0, EAST), helm2);
  check('armour: not over what it already wears (thrown out)', z.getItemBySlot('head')?.item.id === 'iron_helmet' && items(level, 'golden_helmet').length === 1);
  const p = new m.Player(level);
  p.moveTo(1.5, G, 3.5, 0, 0);
  level.addEntity(p);
  dispenser(level, 0, G, 3, EAST);
  dispense(source(level, 0, G, 3, EAST), stack('diamond_chestplate'));
  const chest = p.inventory.armor.find((s) => s?.item.id === 'diamond_chestplate');
  check('armour: a player in front is dressed', !!chest);
  // (shields come with another branch: when they're in, one goes into the off hand)
  if (m.ITEMS.get('shield')) {
    dispense(source(level, 0, G, 3, EAST), stack('shield'));
    check('armour: a shield goes into a player\'s off hand', p.inventory.offhand?.item.id === 'shield');
  }
  check('armour: with the equip sound', sounds.some((s) => s.name.startsWith('item.armor.equip')));
  // a pumpkin on a player's head; nobody there, the failed click and it stays
  dispense(source(level, 0, G, 3, EAST), stack('carved_pumpkin'));
  check('carved pumpkin: onto a player\'s head', p.inventory.armor.some((s) => s?.item.id === 'carved_pumpkin'));
  dispenser(level, 0, G, 6, EAST);
  const pk = stack('carved_pumpkin', 2);
  const fail = count(sounds, 'block.dispenser.fail');
  dispense(source(level, 0, G, 6, EAST), pk);
  check('carved pumpkin: nothing there, it stays with the failed click', pk.count === 2 && count(sounds, 'block.dispenser.fail') === fail + 1 && items(level, 'carved_pumpkin').length === 0);
}

{
  // the pumpkin finishes an iron golem in front
  const { level } = flatLevel(m, -1, -1, 1, 1);
  level.setBlock(3, G, 0, m.S('iron_block'));
  level.setBlock(3, G + 1, 0, m.S('iron_block'));
  level.setBlock(3, G + 1, -1, m.S('iron_block'));
  level.setBlock(3, G + 1, 1, m.S('iron_block'));
  dispenser(level, 2, G + 2, 0, EAST);
  dispenser(level, 3, G + 3, 0, DOWN);
  const pk = stack('carved_pumpkin', 2);
  dispense(source(level, 3, G + 3, 0, DOWN), pk);
  const golems = live(level, m.IronGolem);
  check('carved pumpkin: set on an iron T it makes a golem', golems.length === 1 && pk.count === 1 && blockName(m, level.getState(3, G + 1, 0)) === 'air', `${golems.length} ${pk.count}`);
}

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const pig = new m.Pig(level);
  pig.moveTo(1.5, G, 0.5, 0, 0);
  level.addEntity(pig);
  dispenser(level, 0, G, 0, EAST);
  const sd = stack('saddle');
  check('saddle: onto a pig in front', dispense(source(level, 0, G, 0, EAST), sd) === null && pig.saddled);
  dispense(source(level, 0, G, 0, EAST), stack('saddle'));
  check('saddle: a saddled pig won\'t take another (thrown out)', items(level, 'saddle').length === 1);
}

// ---------------------------------------------------------------------------------------------------------------
// The dropper

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  const d = dispenser(level, 0, G, 0, EAST, 'dropper');
  place(m, level, 'chest', 1, G, 0);
  const chest = level.world.getBlockEntity(1, G, 0);
  d.container.set(0, stack('arrow', 3));
  pulse(level, [-1, G, 0]);
  check('dropper: into the chest in front, one at a time', chest.container.items.filter(Boolean).map((s) => `${s.item.id}x${s.count}`).join() === 'arrowx1' && d.container.get(0).count === 2);
  check('dropper: an arrow is just an item to it (none shot), and no click into a chest', live(level, m.Arrow).length === 0 && count(sounds, 'block.dispenser.dispense') === 0 && count(sounds, 'block.dispenser.launch') === 0);
  pulse(level, [-1, G, 0]);
  check('dropper: merged with what\'s there', chest.container.get(0)?.count === 2);
  for (let i = 0; i < 27; i++) chest.container.set(i, stack('dirt', 64));
  pulse(level, [-1, G, 0]);
  check('dropper: the chest full, it keeps it (nothing dropped)', d.container.get(0)?.count === 1 && items(level).length === 0);
  // nothing in front: thrown out as a dispenser would
  const d2 = dispenser(level, 0, G, 4, EAST, 'dropper');
  d2.container.set(3, stack('arrow', 2));
  pulse(level, [-1, G, 4]);
  check('dropper: nothing in front, it throws the item out', items(level, 'arrow').length === 1 && d2.container.get(3).count === 1 && count(sounds, 'block.dispenser.dispense') === 1);
  // droppers pass things along
  const a = dispenser(level, 4, G, 0, EAST, 'dropper');
  const b = dispenser(level, 5, G, 0, EAST, 'dropper');
  a.container.set(0, stack('gold_ingot', 5));
  pulse(level, [3, G, 0]);
  check('dropper: into another dropper', b.container.items.some((s) => s?.item.id === 'gold_ingot') && a.container.get(0).count === 4);
}

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  // furnaces: from the side only fuel (into the fuel slot), from above anything (the input), from below nothing
  place(m, level, 'furnace', 1, G, 0, { props: { facing: 'north' } });
  const f = level.world.getBlockEntity(1, G, 0);
  const side = dispenser(level, 0, G, 0, EAST, 'dropper');
  side.container.set(0, stack('coal', 4));
  side.container.set(1, stack('cobblestone', 4));
  for (let i = 0; i < 6; i++) pulse(level, [-1, G, 0]);
  check('dropper into a furnace from the side: the coal as fuel, the stone refused', f.container.get(1)?.item.id === 'coal' && f.container.get(1).count === 4 && !f.container.get(0) && side.container.get(1)?.count === 4);
  const top = dispenser(level, 1, G + 1, 0, DOWN, 'dropper');
  top.container.set(0, stack('iron_ore', 2));
  pulse(level, [1, G + 2, 0]);
  check('dropper into a furnace from above: into its input', f.container.get(0)?.item.id === 'iron_ore' && f.container.get(0).count === 1);
  // brewing stands: the ingredient from above, bottles from the side
  place(m, level, 'brewing_stand', 4, G, 0);
  const bs = level.world.getBlockEntity(4, G, 0);
  const bTop = dispenser(level, 4, G + 1, 0, DOWN, 'dropper');
  bTop.container.set(0, stack('nether_wart', 2));
  pulse(level, [4, G + 2, 0]);
  const bSide = dispenser(level, 3, G, 0, EAST, 'dropper');
  bSide.container.set(0, m.potionStack('potion', 'water'));
  bSide.container.set(1, stack('blaze_powder', 1));
  for (let i = 0; i < 3; i++) pulse(level, [2, G, 0]);
  // (the stand takes the blaze powder straight in as fuel, and starts brewing)
  check('dropper into a brewing stand: the wart on top, bottle and blaze powder from the side', bs.container.get(3)?.item.id === 'nether_wart' && bs.container.get(0)?.item.id === 'potion' && (bs.container.get(4)?.item.id === 'blaze_powder' || bs.fuel > 0) && bSide.container.items.every((x) => !x), `${bs.container.items.map((x) => x?.item.id).join()} fuel ${bs.fuel}`);
  // composters: compostables from above, one at a time
  place(m, level, 'composter', 8, G, 0);
  const comp = dispenser(level, 8, G + 1, 0, DOWN, 'dropper');
  comp.container.set(0, stack('melon_slice', 64));
  comp.container.set(1, stack('stone', 64));
  for (let i = 0; i < 40; i++) pulse(level, [8, G + 2, 0], 5);
  const used = 64 - (comp.container.items.find((s) => s?.item.id === 'melon_slice')?.count ?? 0);
  check('dropper into a composter from above: melon slices go in and it fills', prop(m, level, 8, G, 0, 'level') > 0 && used > 5 && comp.container.items.find((s) => s?.item.id === 'stone')?.count === 64, `${used} level ${prop(m, level, 8, G, 0, 'level')}`);
  // a chest minecart in front
  place(m, level, 'rail', 1, G, 6);
  const cart = new m.MinecartChest(level);
  cart.moveTo(1.5, G, 6.5, 0, 0);
  level.addEntity(cart);
  const dm = dispenser(level, 0, G, 6, EAST, 'dropper');
  dm.container.set(0, stack('bread', 3));
  pulse(level, [-1, G, 6]);
  check('dropper into a chest minecart in front', cart.container.items.some((s) => s?.item.id === 'bread') && dm.container.get(0).count === 2);
}

// ---------------------------------------------------------------------------------------------------------------
// Loot tables, the menu

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const be = dispenser(level, 0, G, 0, EAST);
  be.lootTable = 'chests/desert_pyramid';
  be.lootSeed = 42;
  pulse(level, [-1, G, 0]);
  check('loot: a loot table is rolled when it first fires', be.lootTable === null && be.container.items.some(Boolean));
  const be2 = dispenser(level, 0, G, 3, EAST);
  be2.lootTable = 'chests/desert_pyramid';
  be2.lootSeed = 42;
  const opened = [];
  m.setDispenserMenuHook((b, p) => opened.push([b, p]));
  const st = level.getState(0, G, 3);
  const player = new m.Player(level);
  player.moveTo(0.5, G, 5.5, 0, 0);
  const used = m.behaviorOf(st).use(level, 0, G, 3, st, { player, face: 3, hx: 0.5, hy: G + 0.5, hz: 4 });
  check('use: it opens its inventory, loot rolled first', used === true && opened.length === 1 && opened[0][0] === be2 && opened[0][1] === player && be2.lootTable === null && be2.container.items.some(Boolean));
  m.setDispenserMenuHook(null);
  // the menu: a 3x3 grid in the middle, over the player's inventory
  const menu = new m.DispenserMenu(player, be2);
  check('menu: nine slots and the inventory', menu.slots.length === 45 && menu.slots[0].x === 62 && menu.slots[0].y === 17 && menu.slots[8].x === 98 && menu.slots[8].y === 53 && menu.slots[9].y === 84 && menu.slots[36].y === 142);
  for (let i = 0; i < 9; i++) be2.container.set(i, null);
  be2.container.set(4, stack('arrow', 20));
  menu.quickMoveStack(player, 4);
  check('menu: shift-click out goes to the end of the hotbar first', !be2.container.get(4) && player.inventory.main[8]?.item.id === 'arrow' && player.inventory.main[8].count === 20);
  player.inventory.main[12] = stack('tnt', 7);
  menu.quickMoveStack(player, 12);
  check('menu: shift-click in goes to its first free slot', be2.container.get(0)?.item.id === 'tnt' && be2.container.get(0).count === 7 && !player.inventory.main[12]);
  check('menu: valid within reach', menu.stillValid(player));
  player.moveTo(0.5, G, 20.5, 0, 0);
  check('menu: not from further than 8 blocks', !menu.stillValid(player));
  player.moveTo(0.5, G, 5.5, 0, 0);
  level.destroyBlock(0, G, 3, false);
  check('menu: not once it\'s broken', !menu.stillValid(player));
}

// ---------------------------------------------------------------------------------------------------------------
// Recipes

{
  const grid = (rows, key) => {
    const cells = [];
    for (const r of rows) for (const ch of r.padEnd(3)) cells.push(ch === ' ' ? null : new m.ItemStack(m.ITEMS.get(key[ch]), 1));
    return cells;
  };
  const d = m.findRecipe(grid(['###', '#X#', '#R#'], { '#': 'cobblestone', X: 'bow', R: 'redstone' }), 3, 3);
  check('recipe: cobblestone round a bow over redstone, a dispenser', d?.result === 'dispenser' && d.count === 1, JSON.stringify(d));
  const dr = m.findRecipe(grid(['###', '# #', '#R#'], { '#': 'cobblestone', R: 'redstone' }), 3, 3);
  check('recipe: and without the bow, a dropper', dr?.result === 'dropper' && dr.count === 1, JSON.stringify(dr));
  check('items: both are block items', m.blockForItem(m.ITEMS.get('dispenser'))?.name === 'dispenser' && m.blockForItem(m.ITEMS.get('dropper'))?.name === 'dropper');
}

await exitWithStatus(close);

// Hoppers on a flat stone world with a ticking Level: placement, the 5-slot block entity and its save, chains moving
// one item per 8 ticks between chests, a hopper switched off by a lever, picking up a dropped item, the furnace's,
// composter's and shulker box's rules, what breaking one spills, and the recipe.

import { load, check, flatLevel, place, prop, ticks, use, stack, countIn, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/inventory/hopperMenu.ts', '/src/world/shulkerBoxEntity.ts']);
const G = 64; // the floor: stone below, air from y 64
const [DOWN, UP, NORTH, SOUTH, WEST, EAST] = [0, 1, 2, 3, 4, 5];

const hopperAt = (level, x, y, z, facing) => {
  place(m, level, 'hopper', x, y, z, { props: { facing, enabled: true } });
  return level.world.getBlockEntity(x, y, z);
};
const chestAt = (level, x, y, z) => {
  place(m, level, 'chest', x, y, z, { props: { facing: 'north' } });
  return level.world.getBlockEntity(x, y, z);
};

// ---------------------------------------------------------------------------------------------------------------
// The block

{
  const { level, world } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'hopper', 0, G, 0, { face: UP });
  check('placement: on top of a block it points down', prop(m, level, 0, G, 0, 'facing') === 'down');
  place(m, level, 'hopper', 2, G + 2, 0, { face: DOWN });
  check('placement: under a block it points down too', prop(m, level, 2, G + 2, 0, 'facing') === 'down');
  place(m, level, 'hopper', 4, G, 0, { face: NORTH });
  check('placement: against a side it points into the block clicked', prop(m, level, 4, G, 0, 'facing') === 'south', prop(m, level, 4, G, 0, 'facing'));
  check('placement: enabled', prop(m, level, 0, G, 0, 'enabled') === true);
  const be = world.getBlockEntity(0, G, 0);
  check('block entity: five slots', be instanceof m.HopperBlockEntity && be.container.size === 5 && be.id === 'hopper');
  be.container.set(2, stack(m, 'iron_ingot', 7));
  be.cooldownTime = 5;
  const copy = m.loadBlockEntity(be.save());
  check('block entity: saved and loaded with its items and cooldown', copy instanceof m.HopperBlockEntity && copy.container.get(2)?.count === 7 && copy.cooldownTime === 5);
  const b = m.getBlock('hopper');
  check('block: 3 hard, 4.8 resistant, metal', b.hardness === 3 && b.resistance === 4.8 && b.sound === 'metal');
  const drop = (tool) => m.blockDrops(b.defaultState, tool ? m.ITEMS.get(tool) : null, new m.Rand(1)).map((s) => `${s.item.id}x${s.count}`).join();
  check('drops: itself with a pickaxe, nothing by hand', drop('wooden_pickaxe') === 'hopperx1' && drop(null) === '', `${drop('wooden_pickaxe')} ${drop(null)}`);
  be.container.set(0, stack(m, 'stone', 5));
  level.destroyBlock(0, G, 0, true, m.ITEMS.get('iron_pickaxe'));
  const spilt = {};
  for (const e of level.entities) if (e instanceof m.ItemEntity && !e.removed) spilt[e.stack.item.id] = (spilt[e.stack.item.id] ?? 0) + e.stack.count;
  check('broken: it spills what it held', spilt.stone === 5 && spilt.iron_ingot === 7 && spilt.hopper === 1, JSON.stringify(spilt));
  const collision = m.COLLISION[m.getBlock('hopper').state({ facing: 'down' })];
  check('shape: the bowl, the funnel and the spout (7 boxes)', collision.length === 7);
}

// ---------------------------------------------------------------------------------------------------------------
// Chains: chest → hopper → hopper → chest, one item per 8 ticks

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const a = chestAt(level, 0, G + 1, 0);
  const h1 = hopperAt(level, 0, G, 0, 'east');
  const h2 = hopperAt(level, 1, G, 0, 'east');
  const b = chestAt(level, 2, G, 0);
  a.container.set(0, stack(m, 'cobblestone', 10));
  const arrivals = [];
  let last = 0;
  for (let t = 0; t < 120; t++) {
    level.tick();
    const n = countIn(b.container);
    if (n !== last) arrivals.push(level.gameTime);
    last = n;
  }
  const gaps = arrivals.slice(1).map((t, i) => t - arrivals[i]);
  check('chain: everything reaches the far chest', countIn(b.container, 'cobblestone') === 10 && countIn(a.container) === 0 && countIn(h1.container) === 0 && countIn(h2.container) === 0, `${countIn(b.container)} ${countIn(a.container)}`);
  check('chain: one item every 8 ticks', gaps.length === 9 && gaps.every((g) => g === 8), gaps.join());
  check('chain: the first arrives after the hops (a tick into each hopper, 8 on through each)', arrivals[0] > 0 && arrivals[0] <= 18, String(arrivals[0]));
}

{
  // a hopper straight under a hopper under a chest: the same speed going down
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const a = chestAt(level, 0, G + 3, 0);
  hopperAt(level, 0, G + 2, 0, 'down');
  hopperAt(level, 0, G + 1, 0, 'down');
  const b = chestAt(level, 0, G, 0);
  a.container.set(5, stack(m, 'dirt', 64));
  ticks(level, 20);
  const n0 = countIn(b.container);
  ticks(level, 80);
  check('chain downward: 10 more items in 80 ticks', countIn(b.container) - n0 === 10, `${countIn(b.container) - n0}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Switched off by power

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const a = chestAt(level, 0, G + 1, 0);
  const h = hopperAt(level, 0, G, 0, 'east');
  const b = chestAt(level, 1, G, 0);
  place(m, level, 'lever', -1, G, 0, { props: { face: 'floor', facing: 'north', powered: false } });
  a.container.set(0, stack(m, 'sand', 4));
  use(m, level, -1, G, 0);
  check('lever: on, the hopper is switched off', prop(m, level, 0, G, 0, 'enabled') === false);
  ticks(level, 40);
  check('lever: nothing moves through a switched-off hopper', countIn(a.container) === 4 && countIn(h.container) === 0 && countIn(b.container) === 0);
  use(m, level, -1, G, 0);
  check('lever: off, it is back on', prop(m, level, 0, G, 0, 'enabled') === true);
  ticks(level, 40);
  check('lever: and moves things again', countIn(b.container) === 4, String(countIn(b.container)));
  // a locked hopper keeps what it holds (and still takes nothing)
  h.container.set(0, stack(m, 'gravel', 3));
  place(m, level, 'redstone_block', 0, G, 1);
  ticks(level, 30);
  check('redstone block: it holds on to what it has', countIn(h.container, 'gravel') === 3 && countIn(b.container, 'gravel') === 0);
}

// ---------------------------------------------------------------------------------------------------------------
// Picking up items

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const h = hopperAt(level, 0, G, 0, 'down');
  const e = new m.ItemEntity(level, stack(m, 'apple', 3));
  e.moveTo(0.5, G + 1.4, 0.5, 0, 0);
  e.dx = e.dy = e.dz = 0;
  level.addEntity(e);
  ticks(level, 2);
  check('pickup: a dropped stack on it goes in whole', countIn(h.container, 'apple') === 3 && e.removed, `${countIn(h.container, 'apple')} ${e.removed}`);
  const far = new m.ItemEntity(level, stack(m, 'apple', 1));
  far.moveTo(0.5, G + 2.6, 0.5, 0, 0);
  far.noGravity = true;
  level.addEntity(far);
  ticks(level, 1);
  check('pickup: not from more than a block over it', !far.removed || countIn(h.container, 'apple') === 3);
  far.remove();
  // a full block on it: nothing falls in
  const h2 = hopperAt(level, 3, G, 0, 'down');
  place(m, level, 'stone', 3, G + 1, 0);
  const on = new m.ItemEntity(level, stack(m, 'apple', 1));
  on.moveTo(3.5, G + 2.05, 0.5, 0, 0);
  level.addEntity(on);
  ticks(level, 10);
  check('pickup: not through a full block over it', countIn(h2.container) === 0 && !on.removed);
  // it falls into the bowl and goes in (entityInside)
  const h3 = hopperAt(level, 6, G, 0, 'down');
  h3.cooldownTime = 0;
  const fall = new m.ItemEntity(level, stack(m, 'bread', 2));
  fall.moveTo(6.5, G + 3, 0.5, 0, 0);
  level.addEntity(fall);
  ticks(level, 40);
  check('pickup: an item dropped from above ends up inside', countIn(h3.container, 'bread') === 2 && fall.removed);
}

// ---------------------------------------------------------------------------------------------------------------
// Other containers

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  // furnace: from the top into its input, from the side into its fuel, out of the bottom from its result
  place(m, level, 'furnace', 0, G, 0, { props: { facing: 'north' } });
  const f = level.world.getBlockEntity(0, G, 0);
  const top = hopperAt(level, 0, G + 1, 0, 'down');
  const side = hopperAt(level, 1, G, 0, 'west');
  top.container.set(0, stack(m, 'raw_iron', 1));
  side.container.set(0, stack(m, 'coal', 1));
  ticks(level, 2);
  check('furnace: from above into the input slot', f.container.get(0)?.item.id === 'raw_iron', f.container.get(0)?.item.id);
  check('furnace: from the side into the fuel slot', f.container.get(1)?.item.id === 'coal' || f.litTime > 0, `${f.container.get(1)?.item.id} ${f.litTime}`);
  level.setBlock(0, G - 1, 0, 0);
  const below = hopperAt(level, 0, G - 1, 0, 'north');
  f.container.set(2, stack(m, 'iron_ingot', 2));
  ticks(level, 12);
  check('furnace: the result comes out of the bottom', countIn(below.container, 'iron_ingot') >= 1);
  // a ready composter gives its bone meal to a hopper under it, and empties
  place(m, level, 'composter', 4, G + 1, 4, { props: { level: 8 } });
  const ch = hopperAt(level, 4, G, 4, 'down');
  ticks(level, 2);
  check('composter: a hopper under a ready one takes the bone meal', countIn(ch.container, 'bone_meal') === 1 && prop(m, level, 4, G + 1, 4, 'level') === 0, `${countIn(ch.container, 'bone_meal')} ${prop(m, level, 4, G + 1, 4, 'level')}`);
  // a hopper over a composter fills it
  const over = hopperAt(level, 4, G + 2, 4, 'down');
  over.container.set(0, stack(m, 'wheat_seeds', 1));
  ticks(level, 2);
  check('composter: a hopper over it puts compost in', countIn(over.container) === 0 && prop(m, level, 4, G + 1, 4, 'level') === 1);
  // a shulker box won't take a shulker box
  place(m, level, 'shulker_box', 8, G, 8, { props: { facing: 'up' } });
  const sh = level.world.getBlockEntity(8, G, 8);
  const into = hopperAt(level, 8, G + 1, 8, 'down');
  into.container.set(0, stack(m, 'red_shulker_box', 1));
  into.container.set(1, stack(m, 'feather', 1));
  ticks(level, 12);
  check('shulker box: no shulker box goes into one, anything else does', countIn(sh.container, 'feather') === 1 && countIn(sh.container, 'red_shulker_box') === 0 && countIn(into.container, 'red_shulker_box') === 1);
  // a dropper passes into a hopper, which passes it on
  place(m, level, 'dropper', 10, G + 1, 0, { props: { facing: 'down' } });
  const dr = level.world.getBlockEntity(10, G + 1, 0);
  const hd = hopperAt(level, 10, G, 0, 'east');
  dr.container.set(0, stack(m, 'arrow', 5));
  place(m, level, 'redstone_block', 10, G + 2, 0);
  ticks(level, 6);
  // (the hopper pulls one out of the dropper over it at once, and the dropper drops one more into it 4 ticks later)
  check('dropper: it pulls from a dropper over it, which drops into it', countIn(hd.container, 'arrow') === 2 && countIn(dr.container, 'arrow') === 3, `${countIn(hd.container, 'arrow')} ${countIn(dr.container, 'arrow')}`);
}

// ---------------------------------------------------------------------------------------------------------------
// The menu and the recipe

{
  const { level } = flatLevel(m, -1, -1, 0, 0);
  const h = hopperAt(level, 0, G, 0, 'down');
  let opened = null;
  m.setHopperMenuHook((be) => (opened = be));
  use(m, level, 0, G, 0);
  check('use: right-click opens its inventory', opened === h);
  const cells = ['iron_ingot', null, 'iron_ingot', 'iron_ingot', 'chest', 'iron_ingot', null, 'iron_ingot', null].map((id) => (id ? stack(m, id) : null));
  const r = m.findRecipe(cells, 3, 3);
  check('recipe: five iron ingots round a chest', r?.result === 'hopper' && r.count === 1, JSON.stringify(r));
  check('item: the hopper is its block item, drawn flat', m.blockForItem(m.ITEMS.get('hopper'))?.name === 'hopper' && m.ITEMS.get('hopper').texture === 'hopper');
  const menu = new m.HopperMenu({ inventory: { main: new Array(36).fill(null), armor: new Array(4).fill(null), offhand: null, version: 0 }, level, distanceToSqr: () => 0 }, h);
  check('menu: five slots then the inventory', menu.slots.length === 41 && menu.slots[4].x === 116 && menu.slots[4].y === 20 && menu.slots[5].y === 51);
}

await exitWithStatus(close);

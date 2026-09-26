// Comparators on a flat stone world with a ticking Level: placement, reading a chest's fill level (1 item → 1, full →
// 15) directly and through a solid block, an item frame's turn, the 2-tick delay, compare and subtract modes against
// a side input, right-click with its click, what the other blocks give, breaking what it reads, and the recipe.

import { load, check, flatLevel, place, prop, ticks, use, stack, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/game/redstone/comparator.ts', '/src/entity/itemFrame.ts', '/src/game/redstone/repeater.ts']);
const G = 64;
const [DOWN, UP, NORTH, SOUTH, WEST, EAST] = [0, 1, 2, 3, 4, 5];

/** fill a container with `n` stone, 64 to a slot */
function fill(c, n, id = 'stone') {
  for (let i = 0; i < c.size; i++) c.set(i, null);
  for (let i = 0; n > 0; i++) {
    c.set(i, stack(m, id, Math.min(64, n)));
    n -= 64;
  }
}
const chestAt = (level, x, y, z) => {
  place(m, level, 'chest', x, y, z, { props: { facing: 'north' } });
  return level.world.getBlockEntity(x, y, z);
};
/** a comparator at (x, y, z) with its back to `facing` (its input that way), placed as a player would */
const comparatorAt = (level, x, y, z, facing, mode = 'compare') => place(m, level, 'comparator', x, y, z, { props: { facing, mode, powered: false } }) && m.behaviorOf(level.getState(x, y, z)).setPlacedBy(level, x, y, z, level.getState(x, y, z), { gameMode: 'survival' });
/** what the comparator at (x, y, z) gives out of its front */
const out = (level, x, y, z) => {
  const st = level.getState(x, y, z);
  const f = ['down', 'up', 'north', 'south', 'west', 'east'].indexOf(m.blockOf(st).get(st, 'facing'));
  return m.getSignal(level.world, x, y, z, f);
};

// ---------------------------------------------------------------------------------------------------------------
// The block

{
  const { level, world } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'comparator', 0, G, 0, { yaw: 0 }); // looking south
  check('placement: its back to the player (looking south, it faces north)', prop(m, level, 0, G, 0, 'facing') === 'north' && prop(m, level, 0, G, 0, 'mode') === 'compare');
  check('block entity: it keeps its output', world.getBlockEntity(0, G, 0) instanceof m.ComparatorBlockEntity);
  const be = world.getBlockEntity(0, G, 0);
  be.output = 9;
  const copy = m.loadBlockEntity(be.save());
  check('block entity: saved and loaded', copy instanceof m.ComparatorBlockEntity && copy.output === 9);
  be.output = 0;
  const b = m.getBlock('comparator');
  const drops = m.blockDrops(b.defaultState, null, new m.Rand(1)).map((s) => `${s.item.id}x${s.count}`).join();
  check('block: breaks at once and drops itself', b.hardness === 0 && drops === 'comparatorx1', drops);
  level.setBlock(0, G - 1, 0, 0);
  check('support: gone without the block under it', level.getBlockName(0, G, 0) === 'air');
  check('diode: it is one', m.isDiode(b.defaultState));
  // (vanilla canSupportRigidBlock: a hopper's rim holds a diode up)
  place(m, level, 'hopper', 4, G, 0, { props: { facing: 'down', enabled: true } });
  place(m, level, 'comparator', 4, G + 1, 0, { yaw: 0 });
  check('support: a comparator stands on a hopper (not on air)', level.getBlockName(4, G + 1, 0) === 'comparator' && m.behaviorOf(level.getState(4, G + 1, 0)).canSurvive(level.world, 4, G + 1, 0) && !m.behaviorOf(level.getState(4, G + 1, 0)).canSurvive(level.world, 4, G + 3, 0));
}

// ---------------------------------------------------------------------------------------------------------------
// Reading a chest

{
  const { level, world, sounds } = flatLevel(m, -1, -1, 1, 1);
  const chest = chestAt(level, 0, G, -1);
  fill(chest.container, 1);
  comparatorAt(level, 0, G, 0, 'north');
  ticks(level, 1);
  check('chest: one item reads 1', out(level, 0, G, 0) === 1 && prop(m, level, 0, G, 0, 'powered') === true, String(out(level, 0, G, 0)));
  fill(chest.container, 27 * 64);
  ticks(level, 1);
  const early = out(level, 0, G, 0);
  ticks(level, 1);
  check('chest: full reads 15, two ticks after it filled', early === 1 && out(level, 0, G, 0) === 15, `${early} ${out(level, 0, G, 0)}`);
  fill(chest.container, 27 * 32);
  ticks(level, 2);
  check('chest: half full reads 8', out(level, 0, G, 0) === 8, String(out(level, 0, G, 0)));
  const expect = (n) => (n === 0 ? 0 : Math.floor((n / 64 / 27) * 14) + 1);
  let all = true;
  for (const n of [0, 5, 64, 123, 500, 1000, 1500, 1727, 1728]) {
    fill(chest.container, n);
    ticks(level, 2);
    if (out(level, 0, G, 0) !== expect(n)) all = false;
  }
  check('chest: the reading follows vanilla\'s lerpDiscrete all the way up', all);
  fill(chest.container, 0);
  ticks(level, 2);
  check('chest: empty reads 0, and it\'s off', out(level, 0, G, 0) === 0 && prop(m, level, 0, G, 0, 'powered') === false);
  // it lights a lamp in front of it
  place(m, level, 'redstone_lamp', 0, G, 1);
  fill(chest.container, 10);
  ticks(level, 2);
  check('output: it powers the block in front of it', prop(m, level, 0, G, 1, 'lit') === true);
  // right-click: subtract mode, with the click
  use(m, level, 0, G, 0);
  check('use: subtract mode, clicking at pitch 0.55', prop(m, level, 0, G, 0, 'mode') === 'subtract' && sounds.some((s) => s.name === 'block.comparator.click' && s.pitch === 0.55 && s.volume === 0.3));
  use(m, level, 0, G, 0);
  check('use: back to compare, at pitch 0.5', prop(m, level, 0, G, 0, 'mode') === 'compare' && sounds.some((s) => s.name === 'block.comparator.click' && s.pitch === 0.5));
  check('use: not in adventure mode', use(m, level, 0, G, 0, { gameMode: 'adventure' }) === false);
  void world;
}

// ---------------------------------------------------------------------------------------------------------------
// Through a solid block, and item frames

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const chest = chestAt(level, 0, G, -2);
  place(m, level, 'stone', 0, G, -1);
  fill(chest.container, 27 * 64);
  comparatorAt(level, 0, G, 0, 'north');
  ticks(level, 2);
  check('through a block: it reads the chest beyond', out(level, 0, G, 0) === 15, String(out(level, 0, G, 0)));
  level.destroyBlock(0, G, -2, false);
  ticks(level, 2);
  check('through a block: the chest broken, it reads nothing', out(level, 0, G, 0) === 0, String(out(level, 0, G, 0)));
  // an item frame on the far side of the block, facing away
  const frame = new m.ItemFrame(level, 'item_frame', 0, G, -2, NORTH);
  level.addEntity(frame);
  frame.setItem(stack(m, 'diamond'));
  ticks(level, 2);
  check('item frame: an item in it reads 1', out(level, 0, G, 0) === 1, String(out(level, 0, G, 0)));
  frame.setRotation(5);
  ticks(level, 2);
  check('item frame: turned five times it reads 6', out(level, 0, G, 0) === 6, String(out(level, 0, G, 0)));
  // (a comparator reading straight through a non-conductor gets nothing from beyond it)
  const { level: l2 } = flatLevel(m, -1, -1, 1, 1);
  const c2 = chestAt(l2, 0, G, -2);
  fill(c2.container, 64);
  place(m, l2, 'glass', 0, G, -1);
  comparatorAt(l2, 0, G, 0, 'north');
  ticks(l2, 2);
  check('through glass: nothing', out(l2, 0, G, 0) === 0);
}

// ---------------------------------------------------------------------------------------------------------------
// Compare and subtract against a side input

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const a = chestAt(level, 0, G, -1);
  fill(a.container, Math.ceil((9 / 14) * 1728)); // reads 10
  comparatorAt(level, 0, G, 0, 'north');
  // a second comparator into its east side, reading a chest that gives 3
  const b = chestAt(level, 2, G, 0);
  fill(b.container, Math.ceil((2 / 14) * 1728));
  comparatorAt(level, 1, G, 0, 'east');
  ticks(level, 4);
  check('side: the side comparator gives 3', out(level, 1, G, 0) === 3, String(out(level, 1, G, 0)));
  check('compare: 10 at the back beats 3 at the side, 10 out', out(level, 0, G, 0) === 10, String(out(level, 0, G, 0)));
  use(m, level, 0, G, 0);
  ticks(level, 1);
  check('subtract: 10 less 3, 7 out', out(level, 0, G, 0) === 7, String(out(level, 0, G, 0)));
  // a side stronger than the back (a redstone block at the west side): off in either mode
  place(m, level, 'redstone_block', -1, G, 0);
  ticks(level, 2);
  check('side 15 against 10: nothing out, subtracting', out(level, 0, G, 0) === 0 && prop(m, level, 0, G, 0, 'powered') === false);
  use(m, level, 0, G, 0);
  ticks(level, 2);
  check('side 15 against 10: nothing out, comparing', out(level, 0, G, 0) === 0 && prop(m, level, 0, G, 0, 'powered') === false);
  // equal back and side: comparing it's on, subtracting it's off
  fill(a.container, 1728);
  ticks(level, 2);
  check('equal: comparing, 15 out', out(level, 0, G, 0) === 15);
  use(m, level, 0, G, 0);
  ticks(level, 1);
  check('equal: subtracting, 0 out and off', out(level, 0, G, 0) === 0 && prop(m, level, 0, G, 0, 'powered') === false);
}

// ---------------------------------------------------------------------------------------------------------------
// Plain power, a repeater locked by one, and the other blocks it reads

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  // redstone dust behind it at 13
  place(m, level, 'redstone_block', 0, G, -4);
  for (const z of [-3, -2, -1]) place(m, level, 'redstone_wire', 0, G, z);
  comparatorAt(level, 0, G, 0, 'north');
  ticks(level, 4);
  check('power: dust at 13 behind it, 13 out', out(level, 0, G, 0) === 13, String(out(level, 0, G, 0)));
  // it locks a repeater it points into from the side
  place(m, level, 'repeater', 0, G, 1, { yaw: 90 }); // (looking west: its input to the east)
  ticks(level, 2);
  check('repeater: a powered comparator into its side locks it', prop(m, level, 0, G, 1, 'facing') === 'east' && prop(m, level, 0, G, 1, 'locked') === true);
  const reads = (name, props, x) => {
    const { level: l } = flatLevel(m, -1, -1, 1, 1);
    place(m, l, name, x, G, -1, { props });
    comparatorAt(l, x, G, 0, 'north');
    ticks(l, 2);
    return out(l, x, G, 0);
  };
  check('reads: a water cauldron its level', reads('water_cauldron', { level: 2 }, 0) === 2);
  check('reads: a lava cauldron 3', reads('lava_cauldron', {}, 0) === 3);
  check('reads: an empty cauldron 0', reads('cauldron', {}, 0) === 0);
  check('reads: a composter its level', reads('composter', { level: 5 }, 0) === 5);
  check('reads: an end portal frame with an eye 15', reads('end_portal_frame', { eye: true, facing: 'north' }, 0) === 15);
  // a composter filling up tells it
  const { level: l3 } = flatLevel(m, -1, -1, 1, 1);
  place(m, l3, 'composter', 0, G, -1, { props: { level: 1 } });
  comparatorAt(l3, 0, G, 0, 'north');
  ticks(l3, 2);
  l3.setBlock(0, G, -1, m.getBlock('composter').state({ level: 4 }));
  ticks(l3, 2);
  check('reads: a composter changing level is read again', out(l3, 0, G, 0) === 4, String(out(l3, 0, G, 0)));
  // a hopper with one item
  const { level: l4 } = flatLevel(m, -1, -1, 1, 1);
  place(m, l4, 'hopper', 0, G, -1, { props: { facing: 'down', enabled: false } });
  l4.world.getBlockEntity(0, G, -1).container.set(0, stack(m, 'stone', 1));
  comparatorAt(l4, 0, G, 0, 'north');
  ticks(l4, 2);
  check('reads: a hopper with one item, 1', out(l4, 0, G, 0) === 1);
  check('signal from container: vanilla\'s formula', m.redstoneSignalFromContainer({ size: 5, get: (i) => (i < 5 ? stack(m, 'ender_pearl', 16) : null) }) === 15 && m.redstoneSignalFromContainer({ size: 9, get: (i) => (i === 0 ? stack(m, 'stone', 1) : null) }) === 1);
}

// ---------------------------------------------------------------------------------------------------------------
// The recipe and the item

{
  const cells = [null, 'redstone_torch', null, 'redstone_torch', 'quartz', 'redstone_torch', 'stone', 'stone', 'stone'].map((id) => (id ? stack(m, id) : null));
  const r = m.findRecipe(cells, 3, 3);
  check('recipe: three torches round quartz over stone', r?.result === 'comparator' && r.count === 1, JSON.stringify(r));
  check('item: the comparator is its block item, drawn flat', m.blockForItem(m.ITEMS.get('comparator'))?.name === 'comparator' && m.ITEMS.get('comparator').texture === 'comparator');
}

await exitWithStatus(close);

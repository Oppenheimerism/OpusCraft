// M5a: the crafter, on a flat stone world with a ticking Level. The block (its 48 states, strength, tool, drop, map
// colour, recipe and book category), where it faces as placed, its redstone (a rising edge sets it off four ticks
// later, once; no quasi-connectivity; placed powered it goes off too; the power going stops its glow), what it crafts
// (a recipe anywhere in the grid, mirrored ones, shapeless ones, the special ones, one of each item used, remainders
// sent out after the result), failing, its glow for six ticks, where the result goes (out of its front with a clunk
// and white smoke, into the container it faces, one at a time into another crafter), a dropper filling it evenly and
// skipping switched-off slots, switching slots, saving, its comparator count, its menu (the preview, switched-off
// slots, shift-clicks) and its screen's clicks, pistons, breaking it, and Crafters Crafting Crafters.

import { load, check, flatLevel, place, prop, playerAt, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/game/crafter.ts', '/src/game/redstone/dispenser.ts', '/src/inventory/crafterMenu.ts', '/src/game/redstone/piston.ts', '/src/world/mapColors.ts',
  '/src/world/blockEntity.ts', '/src/world/dir.ts', '/src/world/models.ts', '/src/gui/screens/crafter.ts',
]);
const G = 64;
const stack = (id, n = 1) => m.ItemStack.of(id, n);
const _ = null;
const crafterBlock = m.BLOCK_BY_NAME.get('crafter');

function setup(orientation = 'east_up') {
  const w = flatLevel(m, -1, -1, 1, 1);
  place(m, w.level, 'crafter', 0, G, 0, { props: { orientation } });
  return { ...w, be: w.level.world.getBlockEntity(0, G, 0) };
}
/** fill the grid: item ids (one of each) or stacks */
const fill = (be, cells) => cells.forEach((c, i) => be.container.set(i, c ? (typeof c === 'string' ? stack(c) : c) : null));
const counts = (be) => be.container.items.map((s) => (s ? s.count : 0)).join(',');
const dropped = (level) => level.entities.filter((e) => e instanceof m.ItemEntity && !e.removed);
const droppedIds = (level) => dropped(level).map((e) => `${e.stack.item.id}x${e.stack.count}`).sort().join(',');
const named = (sounds, n) => sounds.filter((s) => s.name === n).length;
/** a redstone block beside it (north), or taken away */
const power = (level, on) => level.setBlock(0, G, -1, on ? m.S('redstone_block') : 0);
const run = (level, n) => {
  for (let i = 0; i < n; i++) level.tick();
};

// ---------------------------------------------------------------------------------------------------------------
// The block

{
  const b = crafterBlock;
  check('the crafter: a block and its item', !!b && m.ITEMS.get('crafter')?.block === b);
  check('48 states: 12 orientations, triggered, crafting', b.stateCount === 48 && b.props.map((p) => `${p.name}:${p.values.length}`).join() === 'orientation:12,triggered:2,crafting:2');
  const d = b.defaultState;
  check('by default: facing north, top up, off, idle', b.get(d, 'orientation') === 'north_up' && b.get(d, 'triggered') === false && b.get(d, 'crafting') === false);
  check('strength 1.5, blast resistance 3.5, a pickaxe to drop it', b.hardness === 1.5 && b.resistance === 3.5 && b.requiresTool && b.s.tool === 'pickaxe', `${b.hardness} ${b.resistance}`);
  const r = new m.Rand(1, 2);
  const drops = (tool) => m.blockDrops(d, tool ? m.ITEMS.get(tool) : null, r).map((s) => `${s.item.id}x${s.count}`).join();
  check('drops itself to a wooden pickaxe, nothing by hand', drops('wooden_pickaxe') === 'crafterx1' && drops(null) === '');
  check('stone on maps, stone sounds', m.mapColorOf(d) === m.mapColorOf(m.S('stone')) && b.sound === 'stone');
  const grid = ['iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'crafting_table', 'iron_ingot', 'redstone', 'dropper', 'redstone'].map((id) => stack(id));
  const rec = m.findRecipe(grid, 3, 3);
  check('recipe: an iron case round a crafting table, a dropper and two redstone below', rec?.result === 'crafter' && rec.count === 1);
  check('recipe book: under redstone', m.BOOK_RECIPES.filter((x) => x.result === 'crafter').map((x) => x.category).join() === 'crafting_redstone');
  const fs = await import('node:fs');
  check('creative: in the redstone tab after the dropper', /REDSTONE_ORDER\.splice\(REDSTONE_ORDER\.indexOf\('dropper'\) \+ 1, 0, 'crafter'\)/.test(fs.readFileSync('src/gui/screens/creative.ts', 'utf8')));
}

// ---------------------------------------------------------------------------------------------------------------
// Placing it: its front toward the player

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const cases = [
    // [yaw, pitch, expected]: yaw 0 looks south, 90 west, 180 north, 270 east
    [0, 0, 'north_up'], [90, 0, 'east_up'], [180, 0, 'south_up'], [270, 0, 'west_up'],
    // looking down: its front up, its top the way the player faces
    [0, 80, 'up_south'], [90, 80, 'up_west'], [180, 80, 'up_north'], [270, 80, 'up_east'],
    // looking up: its front down, its top the way the player's back is
    [0, -80, 'down_north'], [180, -80, 'down_south'], [270, -80, 'down_west'],
  ];
  const got = cases.map(([yaw, pitch], i) => {
    place(m, level, 'crafter', i * 2, G, 4, { yaw, pitch });
    return prop(m, level, i * 2, G, 4, 'orientation');
  });
  check(`placed: its front toward the player, its top up or along their look (${got.join(', ')})`, got.every((o, i) => o === cases[i][2]), got.join());
  // placed where power reaches it: on at once, and it goes off four ticks later
  const { level: l2, sounds } = flatLevel(m, -1, -1, 1, 1);
  l2.setBlock(0, G, -1, m.S('redstone_block'));
  place(m, l2, 'crafter', 0, G, 0, { yaw: 270 });
  const on = prop(m, l2, 0, G, 0, 'triggered');
  run(l2, 3);
  const before = named(sounds, 'block.crafter.fail');
  run(l2, 1);
  check('placed powered: triggered at once, and it tries to craft four ticks later', on === true && before === 0 && named(sounds, 'block.crafter.fail') === 1 && l2.world.getBlockEntity(0, G, 0).triggered === true);
}

// ---------------------------------------------------------------------------------------------------------------
// Redstone

{
  const { level, sounds, be } = setup();
  fill(be, ['oak_planks', 'oak_planks', _, 'oak_planks', 'oak_planks', _, _, _, _]);
  power(level, true);
  check('powered: triggered (its block entity too), not crafting yet', prop(m, level, 0, G, 0, 'triggered') === true && be.triggered && prop(m, level, 0, G, 0, 'crafting') === false);
  run(level, 3);
  const early = dropped(level).length;
  run(level, 1);
  check('it crafts four ticks later', early === 0 && droppedIds(level) === 'crafting_tablex1', droppedIds(level));
  check('crafting: it shows it', prop(m, level, 0, G, 0, 'crafting') === true && be.craftingTicks === 5);
  const lit = [];
  for (let t = 0; t < 7; t++) {
    level.tick();
    lit.push(prop(m, level, 0, G, 0, 'crafting'));
  }
  check(`crafting: for six ticks from the craft (${lit.map((x) => (x ? 1 : 0)).join('')})`, lit.join() === 'true,true,true,true,false,false,false');
  fill(be, ['oak_planks', 'oak_planks', _, 'oak_planks', 'oak_planks', _, _, _, _]);
  run(level, 20);
  check('held on: it crafts only once', dropped(level).length === 1 && named(sounds, 'block.crafter.craft') === 1);
  power(level, false);
  check('the power gone: off', prop(m, level, 0, G, 0, 'triggered') === false && !be.triggered);
  // a one-tick pulse still crafts, and the power going stops its glow
  power(level, true);
  level.tick();
  power(level, false);
  run(level, 4);
  check('a one-tick pulse: it still crafts', dropped(level).length === 2);
  check('the power gone mid-glow: the glow goes with it', (() => {
    power(level, true);
    fill(be, ['oak_planks', 'oak_planks', _, 'oak_planks', 'oak_planks', _, _, _, _]);
    run(level, 5);
    const glowing = prop(m, level, 0, G, 0, 'crafting');
    power(level, false);
    return glowing === true && prop(m, level, 0, G, 0, 'crafting') === false;
  })());
  // no quasi-connectivity: power at the block above it does nothing (a dropper would fire)
  const { level: l2, sounds: s2 } = setup();
  l2.setBlock(0, G + 1, 0, m.S('stone'));
  l2.setBlock(0, G + 2, 0, m.S('redstone_block'));
  run(l2, 6);
  check('no quasi-connectivity: power reaching the block above does nothing', prop(m, l2, 0, G, 0, 'triggered') === false && named(s2, 'block.crafter.fail') === 0);
}

// ---------------------------------------------------------------------------------------------------------------
// What it crafts

/** a crafter with this grid, set off once: what came out, what's left, the sounds */
function craftOnce(cells, orientation = 'east_up') {
  const w = setup(orientation);
  fill(w.be, cells);
  power(w.level, true);
  run(w.level, 5);
  return w;
}
{
  const a = craftOnce([_, _, _, _, 'oak_planks', 'oak_planks', _, 'oak_planks', 'oak_planks']);
  check('a 2x2 recipe in any corner of the grid (a crafting table)', droppedIds(a.level) === 'crafting_tablex1' && counts(a.be) === '0,0,0,0,0,0,0,0,0');
  const b = craftOnce(['oak_log', _, _, _, _, _, _, _, _]);
  check('the whole result comes out at once (4 planks from a log)', droppedIds(b.level) === 'oak_planksx4' && dropped(b.level).length === 1);
  const c = craftOnce([stack('oak_planks', 5), stack('oak_planks', 3), _, stack('oak_planks', 2), stack('oak_planks', 9), _, _, _, _]);
  check('one of each item is used', counts(c.be) === '4,2,0,1,8,0,0,0,0');
  const axe = craftOnce([_, 'cobblestone', 'cobblestone', _, 'stick', 'cobblestone', _, 'stick', _]);
  check('a mirrored recipe (a stone axe)', droppedIds(axe.level) === 'stone_axex1');
  const shapeless = craftOnce([_, _, _, _, 'iron_ingot', _, _, 'flint', _]);
  check('a shapeless one (flint and steel)', droppedIds(shapeless.level) === 'flint_and_steelx1');
  // (the game has no recipe that leaves a bucket or bottle; copying a book leaves the book copied from)
  const original = stack('written_book');
  original.tag = { book: { title: 'Notes', author: 'Alex', generation: 0, pages: ['hello'] } };
  const clone = craftOnce([original, 'writable_book', 'writable_book', _, _, _, _, _, _]);
  const out = dropped(clone.level).map((e) => `${e.stack.item.id}x${e.stack.count}:${e.stack.tag?.book?.generation}`);
  check('remainders come out after the result: two copies, then the book copied from', out.join() === 'written_bookx2:1,written_bookx1:0' && counts(clone.be) === '0,0,0,0,0,0,0,0,0', out.join());
  check('each thing sent out clunks and puffs', named(clone.sounds, 'block.crafter.craft') === 2 && clone.particles.filter((p) => p.kind === 'white_smoke').length === 20);
  const potion = stack('lingering_potion');
  potion.tag = { potion: { potion: 'poison', effects: [] } };
  const tipped = craftOnce(['arrow', 'arrow', 'arrow', 'arrow', potion, 'arrow', 'arrow', 'arrow', 'arrow']);
  check('a special recipe too (tipped arrows)', droppedIds(tipped.level) === 'tipped_arrowx8', droppedIds(tipped.level));
  const rocket = craftOnce(['paper', 'gunpowder', 'gunpowder', _, _, _, _, _, _]);
  check('firework rockets', droppedIds(rocket.level) === 'firework_rocketx3', droppedIds(rocket.level));
  const none = craftOnce(['dirt', 'stick', _, _, _, _, _, _, _]);
  check('nothing it makes: a dull click, nothing used, no glow', named(none.sounds, 'block.crafter.fail') === 1 && named(none.sounds, 'block.crafter.craft') === 0 && dropped(none.level).length === 0 &&
    counts(none.be) === '1,1,0,0,0,0,0,0,0' && prop(m, none.level, 0, G, 0, 'crafting') === false);
  const empty = craftOnce([_, _, _, _, _, _, _, _, _]);
  check('empty: the same click', named(empty.sounds, 'block.crafter.fail') === 1);
}

// ---------------------------------------------------------------------------------------------------------------
// Where the result goes

{
  const { level, particles, be, sounds } = setup('east_up');
  fill(be, [_, _, _, _, 'oak_planks', 'oak_planks', _, 'oak_planks', 'oak_planks']);
  power(level, true);
  run(level, 4);
  const e = dropped(level)[0];
  const puffs = particles.filter((p) => p.kind === 'white_smoke');
  check('out of its front: from 0.7 out and a little lower, flying on east', Math.abs(e.x - 1.2) < 1e-6 && Math.abs(e.z - 0.5) < 1e-6 && Math.abs(e.y - (G + 0.5 - 0.15625)) < 1e-6 && e.dx > 0.1, `${e.x.toFixed(2)} ${e.y.toFixed(2)} ${e.z.toFixed(2)} ${e.dx.toFixed(2)}`);
  check('ten puffs of white smoke out of its front, and its clunk', puffs.length === 10 && puffs.every((p) => p.x >= 1.1 && p.dx > 0) && named(sounds, 'block.crafter.craft') === 1 && sounds.find((s) => s.name === 'block.crafter.craft').volume === 1);
  void be;
}
{
  // into a chest it faces: all of it, quietly
  const w = setup('east_up');
  place(w.m ?? m, w.level, 'chest', 1, G, 0, { props: { facing: 'north' } });
  fill(w.be, ['oak_log', _, _, _, _, _, _, _, _]);
  power(w.level, true);
  run(w.level, 5);
  const chest = w.level.world.getBlockEntity(1, G, 0);
  check('into a chest it faces: the whole result, and no clunk or smoke', chest.container.items.filter(Boolean).map((s) => `${s.item.id}x${s.count}`).join() === 'oak_planksx4' && dropped(w.level).length === 0 && named(w.sounds, 'block.crafter.craft') === 0 &&
    w.particles.length === 0);
  // the chest full: out of its front after all
  for (let i = 0; i < 27; i++) chest.container.set(i, stack('dirt', 64));
  fill(w.be, ['oak_log', _, _, _, _, _, _, _, _]);
  power(w.level, false);
  power(w.level, true);
  run(w.level, 5);
  check('the chest full: out of its front', droppedIds(w.level) === 'oak_planksx4' && named(w.sounds, 'block.crafter.craft') === 1);
}
{
  // into another crafter: one at a time, by its rule; what doesn't fit comes out
  const w = setup('east_up');
  place(m, w.level, 'crafter', 1, G, 0, { props: { orientation: 'north_up' } });
  const other = w.level.world.getBlockEntity(1, G, 0);
  fill(w.be, ['oak_log', _, _, _, _, _, _, _, _]);
  power(w.level, true);
  run(w.level, 5);
  check('into another crafter: one item to a slot, first to last', counts(other) === '1,1,1,1,0,0,0,0,0' && dropped(w.level).length === 0, counts(other));
  other.setSlotState(8, false);
  for (let i = 0; i < 8; i++) other.container.set(i, stack('oak_planks', 64));
  fill(w.be, ['oak_log', _, _, _, _, _, _, _, _]);
  power(w.level, false);
  power(w.level, true);
  run(w.level, 5);
  check('another crafter full (its last slot off): the lot comes out', droppedIds(w.level) === 'oak_planksx4' && counts(other) === '64,64,64,64,64,64,64,64,0');
}

// ---------------------------------------------------------------------------------------------------------------
// A dropper filling it, and switching slots

{
  const w = setup('north_up');
  const t = m.containerAt(w.level, 0, G, 0);
  const put = (id) => m.insertItem(t, stack(id), 3) === null;
  const got = [];
  for (let i = 0; i < 12; i++) got.push(put('oak_planks'));
  check('a dropper fills it evenly: one to each slot, then round again', got.every(Boolean) && counts(w.be) === '2,2,2,1,1,1,1,1,1', counts(w.be));
  const w2 = setup('north_up');
  w2.be.setSlotState(1, false);
  w2.be.setSlotState(4, false);
  const t2 = m.containerAt(w2.level, 0, G, 0);
  for (let i = 0; i < 8; i++) m.insertItem(t2, stack('stick'), 3);
  check('it skips switched-off slots', counts(w2.be) === '2,0,1,1,0,1,1,1,1', counts(w2.be));
  check('something else goes into the next empty slot', (() => {
    const w3 = setup('north_up');
    const t3 = m.containerAt(w3.level, 0, G, 0);
    m.insertItem(t3, stack('oak_planks'), 3);
    m.insertItem(t3, stack('stick'), 3);
    return w3.be.container.items.slice(0, 2).map((s) => s?.item.id).join() === 'oak_planks,stick';
  })());
  const w4 = setup('north_up');
  for (let i = 0; i < 9; i++) w4.be.container.set(i, stack('stick', i === 4 ? 64 : 63));
  const t4 = m.containerAt(w4.level, 0, G, 0);
  const left = m.insertItem(t4, stack('stick', 1), 3);
  check('a full stack takes no more', left === null && counts(w4.be) === '64,63,63,63,64,63,63,63,63', counts(w4.be));
  // a real dropper beside it
  const w5 = setup('north_up');
  place(m, w5.level, 'dropper', -1, G, 0, { props: { facing: 'east', triggered: false } });
  const dropper = w5.level.world.getBlockEntity(-1, G, 0);
  dropper.container.set(0, stack('oak_planks', 3));
  for (let i = 0; i < 3; i++) {
    w5.level.setBlock(-2, G, 0, m.S('redstone_block'));
    run(w5.level, 5);
    w5.level.setBlock(-2, G, 0, 0);
    run(w5.level, 2);
  }
  check('a dropper facing it puts things in one at a time', counts(w5.be) === '1,1,1,0,0,0,0,0,0' && !dropper.container.get(0), counts(w5.be));
}
{
  const { be, level } = setup();
  be.setSlotState(2, false);
  be.container.set(0, stack('stick'));
  be.setSlotState(0, false);
  check('switching: an empty slot can be switched off; a filled one can\'t', be.isSlotDisabled(2) && !be.isSlotDisabled(0));
  be.setSlotState(2, true);
  be.setSlotState(3, false);
  check('switched back on', !be.isSlotDisabled(2) && be.isSlotDisabled(3));
  be.container.set(3, stack('stick'));
  check('putting something in a switched-off slot switches it back on', !be.isSlotDisabled(3));
  be.setSlotState(5, false);
  be.setSlotState(8, false);
  check('its comparator count: slots filled or switched off (4)', be.redstoneSignal() === 4 && m.crafterAnalogOutput(level, 0, G, 0) === 4);
  be.triggered = true;
  be.craftingTicks = 3;
  const saved = be.save();
  const back = m.loadBlockEntity(saved);
  check('saved and loaded: its items, switched-off slots, power and crafting ticks', back instanceof m.CrafterBlockEntity && counts(back) === counts(be) &&
    [5, 8].every((i) => back.isSlotDisabled(i)) && !back.isSlotDisabled(2) && back.triggered && back.craftingTicks === 3 && saved.data.disabled_slots === '5,8', JSON.stringify(saved.data));
}

// ---------------------------------------------------------------------------------------------------------------
// Its menu and screen

{
  const { level, be } = setup();
  const p = playerAt(m, level, 0.5, G, 3.5);
  p.inventory.main[9] = stack('oak_planks', 10);
  const menu = new m.CrafterMenu(p, be);
  check('menu: its grid at vanilla\'s places, the inventory under it, the result at 134, 35', menu.slots.length === 46 && menu.slots[0].x === 26 && menu.slots[0].y === 17 && menu.slots[8].x === 62 && menu.slots[8].y === 53 &&
    menu.slots[45].x === 134 && menu.slots[45].y === 35 && menu.slots[9].y === 84);
  be.setSlotState(0, false);
  check('menu: a switched-off slot takes nothing', !menu.slots[0].mayPlace(stack('stick')) && menu.slots[1].mayPlace(stack('stick')));
  menu.quickMoveStack(p, 9);
  check('menu: shift-click puts things in the first slot that\'s on', counts(be) === '0,10,0,0,0,0,0,0,0');
  menu.clicked(1, 0, 'pickup');
  for (const i of [1, 2, 4, 5]) menu.clicked(i, 1, 'pickup');
  check('menu: the preview shows what the grid makes', menu.result.get(0)?.item.id === 'crafting_table', counts(be));
  menu.clicked(45, 0, 'pickup');
  menu.clicked(45, 0, 'quick_move');
  check('menu: the preview can\'t be taken', menu.result.get(0)?.item.id === 'crafting_table' && counts(be) === '0,1,1,0,1,1,0,0,0' && menu.carried?.item.id === 'oak_planks', counts(be));
  be.container.set(3, stack('dirt'));
  menu.refreshRecipeResult();
  check('menu: nothing made, nothing shown', menu.result.get(0) === null);
  // the screen's clicks (vanilla CrafterScreen.slotClicked), with a stand-in for the game
  const ui = [];
  const scr = Object.create(m.CrafterScreen.prototype);
  scr.menu = menu;
  scr.book = null;
  scr.game = { player: p, sound: { playUI: (n, v, pi) => ui.push(`${n}@${v}/${pi}`) } };
  menu.carried = null;
  scr.slotClicked(menu.slots[6], 6, 0, 'pickup');
  check('screen: clicking an empty slot with nothing in hand switches it off, with a lower click', be.isSlotDisabled(6) && ui.join() === 'ui.button.click@0.4/0.75');
  scr.slotClicked(menu.slots[6], 6, 0, 'pickup');
  check('screen: clicking it again switches it on', !be.isSlotDisabled(6) && ui[1] === 'ui.button.click@0.4/1');
  menu.carried = stack('stick');
  scr.slotClicked(menu.slots[7], 7, 0, 'pickup');
  check('screen: with something in hand, it goes in instead', !be.isSlotDisabled(7) && be.container.get(7)?.item.id === 'stick' && ui.length === 2);
  menu.carried = null;
  scr.slotClicked(menu.slots[7], 7, 0, 'pickup');
  check('screen: clicking a filled slot picks it up, switching nothing', !be.isSlotDisabled(7) && be.container.get(7) === null && menu.carried?.item.id === 'stick' && ui.length === 2);
  menu.carried = null;
  be.setSlotState(8, false);
  p.inventory.main[2] = stack('stick');
  scr.slotClicked(menu.slots[8], 8, 2, 'swap');
  check('screen: a number key swaps an item into a switched-off slot, switching it on', !be.isSlotDisabled(8) && be.container.get(8)?.item.id === 'stick');
  p.gameMode = 'spectator';
  scr.slotClicked(menu.slots[0], 0, 0, 'pickup');
  check('screen: a spectator can\'t switch slots', be.isSlotDisabled(0));
}

// ---------------------------------------------------------------------------------------------------------------
// Pistons, breaking it

{
  const { level, be } = setup();
  check('pistons can\'t move it (a block entity)', !m.isPushable(level, level.getState(0, G, 0), 0, G, 0, 5, false, 5));
  fill(be, ['stick', stack('oak_planks', 7), _, _, _, _, _, _, _]);
  level.destroyBlock(0, G, 0, true, m.ITEMS.get('iron_pickaxe'));
  check('broken: its contents and itself drop', droppedIds(level) === 'crafterx1,oak_planksx7,stickx1', droppedIds(level));
}

// ---------------------------------------------------------------------------------------------------------------
// Crafters Crafting Crafters

{
  const recipe = ['iron_ingot', 'iron_ingot', 'iron_ingot', 'iron_ingot', 'crafting_table', 'iron_ingot', 'redstone', 'dropper', 'redstone'];
  const w = setup('east_up');
  const near = playerAt(m, w.level, -7.5, G, 0.5);
  const far = playerAt(m, w.level, -10.5, G, 0.5);
  const spectator = playerAt(m, w.level, 0.5, G, -6.5);
  spectator.gameMode = 'spectator';
  const hits = [];
  w.level.onPlayerTrigger = (p, type, payload) => hits.push({ p, type, payload });
  fill(w.be, recipe);
  power(w.level, true);
  run(w.level, 5);
  const got = hits.filter((h) => h.type === 'crafter_recipe_crafted');
  check('a crafter crafting a crafter: the players within 8.5 blocks hear of it, not those farther or spectating', droppedIds(w.level) === 'crafterx1' && got.length === 1 && got[0].p === near && got[0].payload.crafterCrafted.recipe === 'crafter', got.map((h) => h.p === far ? 'far' : h.p === spectator ? 'spec' : 'near').join());
  const adv = new m.PlayerAdvancements();
  adv.trigger(got[0].type, got[0].payload);
  check('Crafters Crafting Crafters', adv.isDone(m.ADVANCEMENTS.get('adventure/crafters_crafting_crafters')));
  const adv2 = new m.PlayerAdvancements();
  adv2.trigger('crafter_recipe_crafted', { crafterCrafted: { recipe: 'crafting_table' } });
  check('not for another recipe', !adv2.isDone(m.ADVANCEMENTS.get('adventure/crafters_crafting_crafters')));
  // into a chest: no word of it (vanilla only tells when it comes out of its front)
  const w2 = setup('east_up');
  place(m, w2.level, 'chest', 1, G, 0, { props: { facing: 'north' } });
  playerAt(m, w2.level, -2.5, G, 0.5);
  fill(w2.be, recipe);
  power(w2.level, true);
  run(w2.level, 5);
  check('crafted into a chest: no word of it, as in vanilla', w2.triggers.filter((t) => t.type === 'crafter_recipe_crafted').length === 0 && w2.level.world.getBlockEntity(1, G, 0).container.items.some((s) => s?.item.id === 'crafter'));
}

await exitWithStatus(close);

// M2b: tripwire hooks and tripwire on a flat stone world with a ticking Level — placement, hooks attaching over
// string (up to 40 blocks of it), tripping by anything in the string (both hooks give 15, strongly into their
// blocks), the 10-tick recheck, breaking the string (trips it) and cutting it with shears (doesn't), drops, recipes.

import { load, check, flatLevel, place, prop, ticks, blockName, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/inventory/recipes.ts']);
const G = 64; // the floor: stone below, air from y 64
const EAST = 5, WEST = 4;

/** a line along x at z: stone walls at x0 and x1, hooks on them facing each other, and string between */
function line(level, x0, x1, z, { string = true } = {}) {
  place(m, level, 'stone', x0, G, z);
  place(m, level, 'stone', x1, G, z);
  place(m, level, 'tripwire_hook', x0 + 1, G, z, { face: EAST });
  place(m, level, 'tripwire_hook', x1 - 1, G, z, { face: WEST });
  if (string) for (let x = x0 + 2; x <= x1 - 2; x++) place(m, level, 'tripwire', x, G, z);
}

/** a player breaking the block (vanilla playerWillDestroy, then the block goes) */
function breakBlock(level, x, y, z, held = null) {
  const st = level.getState(x, y, z);
  m.behaviorOf(st)?.playerWillDestroy?.(level, x, y, z, st, { gameMode: 'survival' }, held);
  level.destroyBlock(x, y, z, true, held?.item ?? null, false, held);
}

const count = (sounds, name) => sounds.filter((s) => s.name === name).length;

// ---------------------------------------------------------------------------------------------------------------
// Placement

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'stone', 0, G, 0);
  place(m, level, 'tripwire_hook', 1, G, 0, { face: EAST });
  check('hook: on the side of a block it faces away from it', prop(m, level, 1, G, 0, 'facing') === 'east', prop(m, level, 1, G, 0, 'facing'));
  check('hook: placed loose (not attached, not powered)', prop(m, level, 1, G, 0, 'attached') === false && prop(m, level, 1, G, 0, 'powered') === false);
  const floor = place(m, level, 'tripwire_hook', 5, G, 5, { face: 1 });
  check('hook: it can\'t stand on a floor with no wall about', floor === null && blockName(m, level.getState(5, G, 5)) === 'air');
  // on a floor next to a wall it hangs on the wall (the looking directions after the clicked face)
  place(m, level, 'stone', 6, G, 8);
  place(m, level, 'tripwire_hook', 6, G, 7, { face: 1, yaw: 0 }); // looking south, at the wall
  check('hook: clicking the floor by a wall it faces away from the wall', prop(m, level, 6, G, 7, 'facing') === 'north', prop(m, level, 6, G, 7, 'facing'));
  // it drops off when its wall goes
  level.setBlock(0, G, 0, 0);
  check('hook: without its wall it drops off', blockName(m, level.getState(1, G, 0)) === 'air');
  // string: placed by the string item, anywhere (it needs nothing under it)
  check('string: the string item places tripwire', m.blockForItem(m.ITEMS.get('string')).name === 'tripwire');
  place(m, level, 'tripwire', 3, G + 3, 3);
  check('string: it hangs in the air as well', blockName(m, level.getState(3, G + 3, 3)) === 'tripwire');
  place(m, level, 'tripwire', 4, G + 3, 3);
  check('string: pieces side by side join up', prop(m, level, 3, G + 3, 3, 'east') === true && prop(m, level, 4, G + 3, 3, 'west') === true && prop(m, level, 3, G + 3, 3, 'north') === false);
  // drops: string, and the hook itself
  const drop = (name) => m.blockDrops(m.getBlock(name).defaultState, null, new m.Rand(1)).map((s) => `${s.item.id}x${s.count}`).join();
  check('drops: tripwire drops string, a hook itself', drop('tripwire') === 'stringx1' && drop('tripwire_hook') === 'tripwire_hookx1', `${drop('tripwire')} ${drop('tripwire_hook')}`);
  check('both break at once', m.getBlock('tripwire').hardness === 0 && m.getBlock('tripwire_hook').hardness === 0);
}

// ---------------------------------------------------------------------------------------------------------------
// Attaching

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  line(level, 0, 10, 0, { string: false });
  for (let x = 2; x <= 7; x++) place(m, level, 'tripwire', x, G, 0);
  check('attach: with a gap in the string the hooks stay loose', prop(m, level, 1, G, 0, 'attached') === false && prop(m, level, 9, G, 0, 'attached') === false);
  const before = count(sounds, 'block.tripwire.attach');
  place(m, level, 'tripwire', 8, G, 0);
  const allStrung = [2, 3, 4, 5, 6, 7, 8].every((x) => prop(m, level, x, G, 0, 'attached') === true);
  check('attach: the last piece of string attaches both hooks', prop(m, level, 1, G, 0, 'attached') === true && prop(m, level, 9, G, 0, 'attached') === true);
  check('attach: and all the string between', allStrung);
  const att = sounds.filter((s) => s.name === 'block.tripwire.attach').slice(before);
  check('attach: each hook plays the attach sound (0.4, pitch 0.7)', att.length === 2 && att.every((s) => s.volume === 0.4 && s.pitch === 0.7), JSON.stringify(att));
  check('attach: the end pieces join the hooks facing them', prop(m, level, 2, G, 0, 'west') === true && prop(m, level, 8, G, 0, 'east') === true);
  check('attach: attached string has the low shape (1 to 2.5 pixels), loose the tall one', (() => {
    const hi = (st) => m.OUTLINE[st][0][4] * 16;
    return hi(level.getState(5, G, 0)) === 2.5 && hi(m.getBlock('tripwire').defaultState) === 8;
  })());
  // hooks side by side, and a hook facing the wrong way, don't attach
  place(m, level, 'stone', 0, G, 4);
  place(m, level, 'stone', 3, G, 4);
  place(m, level, 'tripwire_hook', 1, G, 4, { face: EAST });
  place(m, level, 'tripwire_hook', 2, G, 4, { face: WEST });
  check('attach: two hooks side by side don\'t', prop(m, level, 1, G, 4, 'attached') === false && prop(m, level, 2, G, 4, 'attached') === false);
  place(m, level, 'stone', 0, G, 6);
  place(m, level, 'tripwire_hook', 1, G, 6, { face: EAST });
  for (let x = 2; x <= 4; x++) place(m, level, 'tripwire', x, G, 6);
  place(m, level, 'stone', 6, G, 6);
  place(m, level, 'tripwire_hook', 5, G, 6, { props: { facing: 'east' } }); // its back to the line
  check('attach: not to a hook facing away', prop(m, level, 1, G, 6, 'attached') === false);
}

{
  // the reach: 40 pieces of string (hooks 41 apart) attach, 41 don't
  const { level } = flatLevel(m, -1, -1, 3, 1);
  line(level, 0, 43, 0);
  line(level, 0, 44, 3);
  check('reach: hooks 41 blocks apart (40 of string) attach', prop(m, level, 1, G, 0, 'attached') === true && prop(m, level, 42, G, 0, 'attached') === true);
  check('reach: 42 apart they don\'t', prop(m, level, 1, G, 3, 'attached') === false && prop(m, level, 43, G, 3, 'attached') === false);
}

// ---------------------------------------------------------------------------------------------------------------
// Tripping

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  line(level, 0, 10, 0);
  // lamps: one by the hook's wall (strong power through it), one beside the hook (its own power)
  place(m, level, 'redstone_lamp', -1, G, 0);
  place(m, level, 'redstone_lamp', 1, G, 1);
  place(m, level, 'redstone_lamp', 11, G, 0);
  ticks(level, 5);
  const lit = (x, z) => prop(m, level, x, G, z, 'lit') === true;
  check('trip: nothing on the string, nothing powered', !lit(-1, 0) && !lit(1, 1) && !lit(11, 0) && prop(m, level, 1, G, 0, 'powered') === false);
  const item = new m.ItemEntity(level, new m.ItemStack(m.ITEMS.get('stone'), 1));
  item.moveTo(5.5, G + 0.5, 0.5);
  item.pickupDelay = 32767;
  level.addEntity(item);
  let t = 0;
  while (prop(m, level, 1, G, 0, 'powered') !== true && t < 40) {
    level.tick();
    t++;
  }
  check('trip: an item falling onto the string trips it', prop(m, level, 5, G, 0, 'powered') === true && prop(m, level, 1, G, 0, 'powered') === true && prop(m, level, 9, G, 0, 'powered') === true, `after ${t} ticks`);
  ticks(level, 2);
  check('trip: both hooks power their walls strongly and what\'s beside them', lit(-1, 0) && lit(1, 1) && lit(11, 0));
  const on = sounds.filter((s) => s.name === 'block.tripwire.click_on');
  check('trip: each hook clicks on (0.4, pitch 0.6)', on.length === 2 && on.every((s) => s.volume === 0.4 && s.pitch === 0.6), JSON.stringify(on));
  // it stays tripped while the item lies there
  ticks(level, 40);
  check('trip: tripped as long as something\'s in it', prop(m, level, 1, G, 0, 'powered') === true);
  item.remove();
  let off = 0;
  while (prop(m, level, 1, G, 0, 'powered') === true && off < 30) {
    level.tick();
    off++;
  }
  check('trip: once it\'s clear, it lets go at its next look (within 10 ticks)', off >= 1 && off <= 10 && prop(m, level, 5, G, 0, 'powered') === false, `${off}`);
  check('trip: the hooks click off (0.4, pitch 0.5)', count(sounds, 'block.tripwire.click_off') === 2 && sounds.filter((s) => s.name === 'block.tripwire.click_off').every((s) => s.pitch === 0.5));
  ticks(level, 5);
  check('trip: the lamps go out again (4 ticks after)', !lit(-1, 0) && !lit(1, 1) && !lit(11, 0));
  check('trip: still attached', prop(m, level, 1, G, 0, 'attached') === true);
  // a mob walking in trips it too (the stone pressure plate's kind of test, with a zombie)
  const z = new m.Zombie(level);
  z.moveTo(3.5, G, 0.5, 0, 0);
  level.addEntity(z);
  ticks(level, 3);
  check('trip: a mob in it trips it', prop(m, level, 1, G, 0, 'powered') === true);
  z.remove();
  ticks(level, 12);
  // loose string notices what's in it, but there's nothing to power
  const { level: l2 } = flatLevel(m, -1, -1, 1, 1);
  place(m, l2, 'tripwire', 4, G, 4);
  const it2 = new m.ItemEntity(l2, new m.ItemStack(m.ITEMS.get('stone'), 1));
  it2.moveTo(4.5, G + 0.3, 4.5);
  it2.pickupDelay = 32767;
  l2.addEntity(it2);
  ticks(l2, 10);
  check('trip: loose string is pressed too (powered), with no hooks to tell', prop(m, l2, 4, G, 4, 'powered') === true);
}

// ---------------------------------------------------------------------------------------------------------------
// Breaking the string, and cutting it

{
  const { level, sounds } = flatLevel(m, -1, -1, 1, 1);
  line(level, 0, 10, 0);
  place(m, level, 'redstone_lamp', -1, G, 0);
  ticks(level, 3);
  breakBlock(level, 5, G, 0);
  check('break: breaking the string trips the hooks at once', prop(m, level, 1, G, 0, 'powered') === true && prop(m, level, 9, G, 0, 'powered') === true && count(sounds, 'block.tripwire.click_on') === 2);
  ticks(level, 2);
  check('break: its power reaches the lamp', prop(m, level, -1, G, 0, 'lit') === true);
  ticks(level, 10);
  check('break: at their next look (10 ticks) the hooks let go of the string', prop(m, level, 1, G, 0, 'powered') === false && prop(m, level, 1, G, 0, 'attached') === false && prop(m, level, 9, G, 0, 'attached') === false);
  check('break: the string left goes slack', [2, 3, 4, 6, 7, 8].every((x) => prop(m, level, x, G, 0, 'attached') === false));
  // (vanilla emitState: going off sounds before letting go)
  check('break: they click off as they let go', count(sounds, 'block.tripwire.click_off') === 2 && count(sounds, 'block.tripwire.detach') === 0);
  check('break: the broken piece stays broken', blockName(m, level.getState(5, G, 0)) === 'air');

  const { level: l2, sounds: s2 } = flatLevel(m, -1, -1, 1, 1);
  line(l2, 0, 10, 0);
  place(m, l2, 'redstone_lamp', -1, G, 0);
  ticks(l2, 3);
  const shears = new m.ItemStack(m.ITEMS.get('shears'), 1);
  let everOn = false;
  breakBlock(l2, 5, G, 0, shears);
  everOn ||= prop(m, l2, 1, G, 0, 'powered') === true;
  for (let i = 0; i < 12; i++) {
    l2.tick();
    everOn ||= prop(m, l2, 1, G, 0, 'powered') === true || prop(m, l2, -1, G, 0, 'lit') === true;
  }
  check('shears: cut with shears it doesn\'t trip', !everOn && count(s2, 'block.tripwire.click_on') === 0);
  const det = s2.filter((s) => s.name === 'block.tripwire.detach');
  check('shears: the hooks let go straight away', prop(m, l2, 1, G, 0, 'attached') === false && prop(m, l2, 9, G, 0, 'attached') === false);
  check('shears: they play the detach sound (0.4, pitch 1.2 / 0.9-1.1)', det.length === 2 && det.every((s) => s.volume === 0.4 && s.pitch >= 1.2 / 1.1 - 1e-6 && s.pitch <= 1.2 / 0.9 + 1e-6), JSON.stringify(det));
  check('shears: the cut piece is gone (not put back)', blockName(m, l2.getState(5, G, 0)) === 'air');
  // a disarmed piece left in a line doesn't trip it (cut and put back: string laid again is armed)
  const { level: l3 } = flatLevel(m, -1, -1, 1, 1);
  line(l3, 0, 10, 0);
  l3.setBlock(4, G, 0, m.getBlock('tripwire').with(l3.getState(4, G, 0), 'disarmed', true), 4);
  const it = new m.ItemEntity(l3, new m.ItemStack(m.ITEMS.get('stone'), 1));
  it.moveTo(4.5, G + 0.3, 0.5);
  it.pickupDelay = 32767;
  l3.addEntity(it);
  ticks(l3, 10);
  check('disarmed: something on a disarmed piece doesn\'t power the hooks', prop(m, l3, 4, G, 0, 'powered') === true && prop(m, l3, 1, G, 0, 'powered') === false);
  // a hook broken: the other lets go, the string goes slack
  const { level: l4 } = flatLevel(m, -1, -1, 1, 1);
  line(l4, 0, 10, 0);
  l4.destroyBlock(1, G, 0, true);
  check('hook broken: the other hook lets go and the string goes slack', prop(m, l4, 9, G, 0, 'attached') === false && [2, 5, 8].every((x) => prop(m, l4, x, G, 0, 'attached') === false));
}

// ---------------------------------------------------------------------------------------------------------------
// Items and recipes

{
  const grid = (rows, key) => {
    const cells = [];
    for (const r of rows) for (const ch of r.padEnd(3)) cells.push(ch === ' ' ? null : new m.ItemStack(m.ITEMS.get(key[ch]), 1));
    return cells;
  };
  const hook = m.findRecipe(grid(['I  ', 'S  ', '#  '], { I: 'iron_ingot', S: 'stick', '#': 'birch_planks' }), 3, 3);
  check('recipe: iron, stick and planks make 2 tripwire hooks', hook?.result === 'tripwire_hook' && hook.count === 2, JSON.stringify(hook));
  const xbow = m.findRecipe(grid(['#&#', '~$~', ' # '], { '#': 'stick', '&': 'iron_ingot', '~': 'string', $: 'tripwire_hook' }), 3, 3);
  check('recipe: the crossbow can be crafted now', xbow?.result === 'crossbow');
  check('item: the hook is a flat sprite of its texture', m.ITEMS.get('tripwire_hook').texture === 'block:tripwire_hook');
  check('item: picking string gives string', m.itemForBlock('tripwire').id === 'string');
}

await exitWithStatus(close);

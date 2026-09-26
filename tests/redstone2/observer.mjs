// Observers on a flat stone world with a ticking Level: placement, the 2-tick pulse two ticks after the block it
// watches changes, strong power out of its back, dust meeting its back, no pulse from its own change, two facing each
// other making a clock, firing when a piston sets it down, and the recipe.

import { load, check, flatLevel, place, prop, ticks, use, stack, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/game/redstone/observer.ts', '/src/game/redstone/piston.ts']);
const G = 64;

/** its powered state each tick for `n` ticks */
function trace(level, x, y, z, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    level.tick();
    out.push(prop(m, level, x, y, z, 'powered') ? 1 : 0);
  }
  return out.join('');
}

// ---------------------------------------------------------------------------------------------------------------
// The block

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'observer', 0, G, 0, { yaw: 0, pitch: 0 }); // looking south
  check('placement: its face the way the player looks (south), its back to them', prop(m, level, 0, G, 0, 'facing') === 'south' && prop(m, level, 0, G, 0, 'powered') === false);
  place(m, level, 'observer', 2, G, 0, { yaw: 0, pitch: 80 }); // looking down
  check('placement: looking down, its face down', prop(m, level, 2, G, 0, 'facing') === 'down');
  ticks(level, 10);
  check('placement: placing it sets nothing off', prop(m, level, 0, G, 0, 'powered') === false && prop(m, level, 2, G, 0, 'powered') === false);
  const b = m.getBlock('observer');
  const drop = (tool) => m.blockDrops(b.defaultState, tool ? m.ITEMS.get(tool) : null, new m.Rand(1)).map((s) => `${s.item.id}x${s.count}`).join();
  check('block: 3 hard, a pickaxe to drop', b.hardness === 3 && drop('wooden_pickaxe') === 'observerx1' && drop(null) === '');
  check('block: not a conductor', !m.isConductor(b.defaultState));
}

// ---------------------------------------------------------------------------------------------------------------
// The pulse

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'observer', 0, G, 0, { props: { facing: 'north', powered: false } });
  place(m, level, 'redstone_lamp', 0, G, 1);
  ticks(level, 5);
  place(m, level, 'stone', 0, G, -1);
  const t = trace(level, 0, G, 0, 10);
  check('pulse: two ticks after the block in front changes, on for two ticks', t === '0110000000', t);
  place(m, level, 'redstone_lamp', 0, G, -1); // (a change again: a lamp in front of it this time)
  let lit = false;
  for (let i = 0; i < 4; i++) {
    level.tick();
    if (prop(m, level, 0, G, 1, 'lit')) lit = true;
  }
  check('pulse: it lights the lamp behind it', lit);
  const quiet = trace(level, 0, G, 0, 30);
  check('pulse: its own change never sets it off again', !quiet.includes('1'), quiet);
  // changes beside it, or behind it, aren't watched
  place(m, level, 'stone', 1, G, 0);
  place(m, level, 'stone', 0, G + 1, 0);
  check('pulse: blocks beside it aren\'t watched', !trace(level, 0, G, 0, 6).includes('1'));
  // a lever flicked in front of it
  level.setBlock(0, G, -1, 0);
  ticks(level, 6);
  place(m, level, 'lever', 0, G, -1, { props: { face: 'floor', facing: 'north', powered: false } });
  ticks(level, 6);
  use(m, level, 0, G, -1);
  check('pulse: a lever flicked in front of it', trace(level, 0, G, 0, 5).includes('1'));
}

// ---------------------------------------------------------------------------------------------------------------
// Its power

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'observer', 0, G, 0, { props: { facing: 'north', powered: false } });
  place(m, level, 'stone', 0, G, 1); // behind it
  place(m, level, 'redstone_lamp', 1, G, 1); // beside that block
  place(m, level, 'redstone_lamp', 1, G, 0); // beside the observer itself
  place(m, level, 'stone', 0, G, -1);
  ticks(level, 2);
  check('power: strong out of its back, through the block behind it', prop(m, level, 0, G, 0, 'powered') && prop(m, level, 1, G, 1, 'lit') === true);
  check('power: nothing out of its sides', prop(m, level, 1, G, 0, 'lit') === false);
  // dust meets its back, not its sides
  const { level: l2 } = flatLevel(m, -1, -1, 1, 1);
  place(m, l2, 'observer', 0, G, 0, { props: { facing: 'north', powered: false } });
  place(m, l2, 'redstone_wire', 0, G, 1);
  place(m, l2, 'redstone_wire', 1, G, 0);
  check('dust: it meets the observer\'s back', prop(m, l2, 0, G, 1, 'north') === 'side');
  check('dust: but not its side', prop(m, l2, 1, G, 0, 'west') !== 'side' || prop(m, l2, 1, G, 0, 'east') === 'side');
  place(m, l2, 'stone', 0, G, -1);
  ticks(l2, 2);
  check('dust: its pulse powers the dust behind it at 15', prop(m, l2, 0, G, 1, 'power') === 15);
}

// ---------------------------------------------------------------------------------------------------------------
// A clock, and pistons

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'observer', 0, G, 0, { props: { facing: 'east', powered: false } });
  place(m, level, 'observer', 1, G, 0, { props: { facing: 'west', powered: false } });
  // (set one off by hand: its own tick)
  level.scheduleBlockTick(0, G, 0, m.getBlock('observer').id, 2);
  const t = trace(level, 0, G, 0, 24);
  check('clock: two facing each other keep each other going', (t.match(/1/g) || []).length >= 8, t);
  // a piston pushes one along: it fires as it lands
  const { level: l2 } = flatLevel(m, -1, -1, 1, 1);
  place(m, l2, 'piston', 0, G, 5, { props: { facing: 'east' } });
  place(m, l2, 'observer', 1, G, 5, { props: { facing: 'north', powered: false } });
  ticks(l2, 4);
  place(m, l2, 'redstone_block', -1, G, 5);
  let fired = false;
  for (let i = 0; i < 12; i++) {
    l2.tick();
    if (l2.getBlockName(2, G, 5) === 'observer' && prop(m, l2, 2, G, 5, 'powered')) fired = true;
  }
  check('piston: pushed, it lands one block on', l2.getBlockName(2, G, 5) === 'observer');
  check('piston: and fires as it lands', fired);
  const quiet = trace(l2, 2, G, 5, 20);
  check('piston: then stays quiet', !quiet.includes('1'), quiet);
}

// ---------------------------------------------------------------------------------------------------------------
// The recipe

{
  const cells = ['cobblestone', 'cobblestone', 'cobblestone', 'redstone', 'redstone', 'quartz', 'cobblestone', 'cobblestone', 'cobblestone'].map((id) => stack(m, id));
  const r = m.findRecipe(cells, 3, 3);
  check('recipe: cobblestone round two redstone and quartz', r?.result === 'observer' && r.count === 1, JSON.stringify(r));
}

await exitWithStatus(close);

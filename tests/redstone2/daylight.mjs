// Daylight detectors on a flat stone world with a ticking Level: 15 at noon and 0 at midnight (inverted: 0 and 11),
// read once every 20 ticks, dimmer at the ends of the day and in shade, right-click inverting it at once, its weak
// power into a lamp, its slab shape, and the recipe.

import { load, check, flatLevel, place, prop, ticks, use, stack, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/game/redstone/daylightDetector.ts', '/src/render/environment.ts']);
const G = 64;

/** the level's time set to `t` and held there, then ticked to the next multiple of 20 (the detector's read) */
function at(level, t) {
  level.doDaylightCycle = false;
  level.dayTime = t;
  level.updateSkyBrightness();
  do level.tick();
  while (level.gameTime % 20 !== 0);
}

{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'daylight_detector', 0, G, 0);
  check('block: placed dark and not inverted', prop(m, level, 0, G, 0, 'power') === 0 && prop(m, level, 0, G, 0, 'inverted') === false);
  check('block: it has a block entity (so pistons leave it be)', level.world.getBlockEntity(0, G, 0) instanceof m.DaylightDetectorBlockEntity);
  check('light: open sky over it', level.world.getLight(0, G, 0) >> 4 === 15);
  at(level, 6000);
  check('noon: 15', prop(m, level, 0, G, 0, 'power') === 15, String(prop(m, level, 0, G, 0, 'power')));
  at(level, 18000);
  check('midnight: 0', prop(m, level, 0, G, 0, 'power') === 0, String(prop(m, level, 0, G, 0, 'power')));
  // the ends of the day
  at(level, 0);
  const morning = prop(m, level, 0, G, 0, 'power');
  at(level, 12000);
  const evening = prop(m, level, 0, G, 0, 'power');
  at(level, 3000);
  const mid = prop(m, level, 0, G, 0, 'power');
  // (vanilla's sums: at sunrise the sun's angle is 4.929, pulled to 5.200, cos 0.468 of 15 → 7; sunset the same from
  // the other side; at 3000 the angle 5.680 pulled to 5.801, cos 0.886 → 13)
  check('day: dimmer early and late than at noon (7 at sunrise and sunset, 13 mid-morning)', morning === 7 && evening === 7 && mid === 13, `${morning} ${evening} ${mid}`);
  // read every 20 ticks, not in between
  at(level, 6000);
  level.dayTime = 18000;
  level.updateSkyBrightness();
  ticks(level, 19);
  const held = prop(m, level, 0, G, 0, 'power');
  ticks(level, 1);
  check('timing: read once every 20 ticks', held === 15 && prop(m, level, 0, G, 0, 'power') === 0, `${held} ${prop(m, level, 0, G, 0, 'power')}`);
  // inverted
  use(m, level, 0, G, 0);
  check('inverted: right-click inverts it, and it reads again at once (11 at midnight)', prop(m, level, 0, G, 0, 'inverted') === true && prop(m, level, 0, G, 0, 'power') === 11, String(prop(m, level, 0, G, 0, 'power')));
  at(level, 6000);
  check('inverted: 0 at noon', prop(m, level, 0, G, 0, 'power') === 0);
  use(m, level, 0, G, 0);
  check('inverted: right-click again and it is back (15 at noon)', prop(m, level, 0, G, 0, 'inverted') === false && prop(m, level, 0, G, 0, 'power') === 15);
  check('use: not in adventure mode', use(m, level, 0, G, 0, { gameMode: 'adventure' }) === false);
  // its power lights a lamp beside it (weakly: not through a block)
  place(m, level, 'redstone_lamp', 1, G, 0);
  check('power: a lamp beside it lights', prop(m, level, 1, G, 0, 'lit') === true);
  check('power: weak only', m.getDirectSignal(level.world, 0, G, 0, 5) === 0 && m.getSignal(level.world, 0, G, 0, 5) === 15);
  // in shade: under glass the sky light is still there; under a block it's less
  place(m, level, 'daylight_detector', 3, G, 3);
  place(m, level, 'stone', 3, G + 2, 3);
  at(level, 6000);
  const shaded = prop(m, level, 3, G, 3, 'power');
  check('shade: under a block it reads less than in the open', shaded < 15 && shaded === (level.world.getLight(3, G, 3) >> 4), `${shaded} ${level.world.getLight(3, G, 3) >> 4}`);
  // the shape: a slab 6 high
  const c = m.COLLISION[m.getBlock('daylight_detector').defaultState];
  check('shape: 6 pixels high', c.length === 1 && Math.abs(c[0][4] - 6 / 16) < 1e-9);
  const b = m.getBlock('daylight_detector');
  check('block: 0.2 hard, wood', b.hardness === 0.2 && b.sound === 'wood' && b.tool === 'axe');
}

{
  const cells = ['glass', 'glass', 'glass', 'quartz', 'quartz', 'quartz', 'oak_slab', 'spruce_slab', 'birch_slab'].map((id) => stack(m, id));
  const r = m.findRecipe(cells, 3, 3);
  check('recipe: glass over quartz over wooden slabs', r?.result === 'daylight_detector' && r.count === 1, JSON.stringify(r));
}

await exitWithStatus(close);

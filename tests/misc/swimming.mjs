// Sprint swimming (vanilla Entity.updateSwimming, Player.updatePlayerPose, Player.travel, LocalPlayer.aiStep's
// sprinting): sprinting with the head under water starts a swim: the swimming pose (0.6 tall, eyes at 0.4), faster
// along (0.9 of the speed kept a tick, not 0.8) and heading where the player looks; it goes on while sprinting in the
// water, bumping into things or not, and ends on letting go of forward (off the bottom) or leaving the water. On the
// surface, head out, a sprint can't start (and wading stops one). Out of the water in a gap too low to crouch in, the
// pose stays flat: crawling, at the sneaking pace, till there's room to stand.

import { load, check, exitWithStatus, flatLevel, addPlayer } from '../fixes/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/world/fluids.ts']);

// a pool of still water 30 long, 12 wide, 40 deep (y 64..103), walled in stone
const { world, level } = flatLevel(m, -1, -1, 2, 2, 64, 'stone', 'swim');
for (let x = -1; x <= 12; x++)
  for (let z = -1; z <= 30; z++)
    for (let y = 64; y <= 104; y++) {
      const wall = x === -1 || x === 12 || z === -1 || z === 30;
      world.setState(x, y, z, wall ? m.S('stone') : y <= 103 ? m.S('water') : 0);
    }

let p = null;
const NONE = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
function fresh(x, y, z, pitch = 0) {
  p?.remove();
  p = addPlayer(m, level, x, y, z);
  p.invulnerable = true;
  p.moveTo(x, y, z, 0, pitch);
  p.input = { ...NONE };
  return p;
}
const tick = (n = 1) => { for (let i = 0; i < n; i++) level.tick(); };
const hspeed = (n = 10) => {
  const a = [p.x, p.z];
  tick(n);
  return Math.hypot(p.x - a[0], p.z - a[1]) / n;
};

// --- starting a swim ---
fresh(5.5, 80, 1.5);
p.input = { ...NONE, forward: true, sprint: true };
tick(2);
check('under water, forward + sprint: sprinting and swimming', p.sprinting && p.swimming);
check('the swimming pose: 0.6 tall, eyes at 0.4', p.swimPose && p.height === 0.6 && p.eyeHeight === 0.4 && p.isVisuallySwimming());
check('not crawling (it\'s in the water)', !p.isVisuallyCrawling());
tick(60);
const swimV = hspeed(10);
console.log(`     sprint swimming: ${swimV.toFixed(4)} a tick (${(swimV * 20).toFixed(2)} blocks a second)`);
// (settled, the speed after the tick's drag is v = (v + 0.02·0.98)·0.9 = 0.1764; the move is made at v + 0.0196)
check('sprint swimming settles at 0.196 a tick', Math.abs(swimV - 0.196) < 0.002, String(swimV));
check('looking straight ahead, it neither climbs nor sinks', Math.abs(p.dy) < 0.01, String(p.dy));

fresh(5.5, 80, 1.5);
p.input = { ...NONE, forward: true };
tick(40);
const plainV = hspeed(10);
console.log(`     swimming without sprinting: ${plainV.toFixed(4)} a tick`);
check('swimming along without sprinting: 0.098 a tick (v = (v + 0.0196)·0.8, moving at v + 0.0196), and no swimming pose', Math.abs(plainV - 0.098) < 0.002 && !p.swimPose && p.height === 1.8, String(plainV));

// --- double tap under water (any push forward will do) ---
fresh(5.5, 80, 1.5);
p.input = { ...NONE, forward: true };
tick(1);
p.input = { ...NONE };
tick(1);
p.input = { ...NONE, forward: true };
tick(2);
check('double-tapping forward under water starts a sprint, and the swim', p.sprinting && p.swimming);

// --- heading where it looks ---
fresh(5.5, 95, 1.5, 45);
p.input = { ...NONE, forward: true, sprint: true };
tick(20);
check('looking down, a swimmer dives', p.dy < -0.1, String(p.dy));
const y0 = p.y;
p.pitch = -45;
tick(20);
check('looking up (the water still over its head), it climbs', p.y > y0 && p.dy > 0.05, `${p.y} ${p.dy}`);

// --- bumping into a wall doesn't stop a swim ---
fresh(5.5, 80, 27.5);
p.input = { ...NONE, forward: true, sprint: true };
tick(30);
check('swimming into the pool\'s wall: still swimming (vanilla: no stop on collision)', p.swimming && p.horizontalCollision !== undefined);

// --- ending it ---
p.input = { ...NONE };
tick(2);
check('letting go of forward, off the bottom: the sprint and the swim end', !p.sprinting && !p.swimming);
tick(1);
check('and it stands up again (1.8 tall, eyes at 1.62)', !p.swimPose && p.height === 1.8 && p.eyeHeight === 1.62);

fresh(5.5, 80, 1.5);
p.input = { ...NONE, forward: true, sprint: true };
tick(5);
p.input = { ...NONE, sneak: true, sprint: true };
tick(5);
check('sneaking, a swimmer keeps sprinting with nothing forward (vanilla: shift holds the swim)', p.sprinting && p.swimming);

// --- on the surface ---
fresh(5.5, 102.6, 1.5);
p.input = { ...NONE, forward: true, sprint: true };
tick(10);
check('on the surface, head out of the water, no sprint starts (and so no swim)', !p.sprinting && !p.swimming, `${p.y} ${p.eyeFluid}`);

// --- wading stops a sprint ---
{
  // a shallow strip: a block of water on the floor at z 40..60, x 20
  for (let z = 35; z <= 60; z++) {
    for (let x = 19; x <= 21; x++) world.setState(x, 64, z, m.S('stone'));
    world.setState(20, 65, z, z >= 45 ? m.S('water') : 0);
  }
  fresh(20.5, 65, 35.5);
  p.input = { ...NONE, forward: true, sprint: true };
  tick(5);
  const before = p.sprinting;
  tick(40);
  check('sprinting into knee-deep water stops the sprint (vanilla: in water, not under it)', before && !p.sprinting && p.inWater, `${before} ${p.sprinting} ${p.inWater} ${p.z}`);
}

// --- crawling ---
{
  // a channel two blocks deep: swimming in it, then a roof put in one block up and the water drained: the swimmer's
  // left lying flat in a gap too low to crouch in
  for (let z = 0; z <= 10; z++) {
    for (let x = 30; x <= 32; x++) {
      world.setState(x, 70, z, m.S('stone'));
      world.setState(x, 73, z, m.S('stone'));
    }
    for (const y of [71, 72]) {
      world.setState(31, y, z, m.S('water'));
      world.setState(30, y, z, m.S('stone'));
      world.setState(32, y, z, m.S('stone'));
    }
  }
  fresh(31.5, 71, 1.5);
  p.input = { ...NONE, forward: true, sprint: true };
  tick(3);
  const swam = p.swimming && p.swimPose;
  for (let z = 0; z <= 10; z++) {
    world.setState(31, 72, z, m.S('stone'));
    world.setState(31, 71, z, 0);
  }
  p.input = { ...NONE };
  tick(3);
  check('drained out of a one-block tunnel, the swimmer is left crawling (the swimming pose, out of the water)', swam && !p.swimming && p.swimPose && p.isVisuallyCrawling() && p.height === 0.6, `${swam} ${p.swimming} ${p.swimPose} ${p.height}`);
  p.moveTo(31.5, 71, 2.5, 0, 0);
  p.input = { ...NONE, forward: true };
  tick(5);
  const crawlV = hspeed(10);
  console.log(`     crawling: ${crawlV.toFixed(4)} a tick`);
  check('crawling goes at the sneaking pace (0.3 of walking\'s 0.2158 a tick: 0.0647)', Math.abs(crawlV - 0.0647) < 0.002, String(crawlV));
  for (let z = 0; z <= 10; z++) for (let x = 30; x <= 32; x++) for (const y of [72, 73]) world.setState(x, y, z, 0);
  tick(2);
  check('with the roof gone it stands up', !p.swimPose && p.height === 1.8);
}

// --- riding: no swimming ---
{
  fresh(5.5, 80, 1.5);
  p.vehicle = {}; // (as far as updateSwimming asks)
  p.sprinting = true;
  p.updateSwimming();
  check('riding, there\'s no swimming', !p.swimming);
  p.vehicle = null;
}

await exitWithStatus(close);

// Sneaking in water (vanilla LocalPlayer.aiStep → LivingEntity.goDownInWater): holding sneak in the water pulls a
// player down 0.04 a tick more, so they sink 0.225 a tick (4.5 blocks a second) instead of drifting down 0.025; a flying
// player (not affected by fluids) isn't pulled; out of the water sneaking does nothing of the kind. And in the water
// sneaking crouches, as on land (vanilla updatePlayerPose), which slows swimming along to 0.3.

import { load, check, exitWithStatus, flatLevel, addPlayer } from '../fixes/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/world/fluids.ts']);

// a pool of still water 12 wide, 40 deep (y 64..103), walled in stone
const { world, level } = flatLevel(m, -1, -1, 1, 1, 64, 'stone', 'sneak');
for (let x = -1; x <= 12; x++)
  for (let z = -1; z <= 12; z++)
    for (let y = 64; y <= 104; y++) {
      const wall = x === -1 || x === 12 || z === -1 || z === 12;
      world.setState(x, y, z, wall ? m.S('stone') : y <= 103 ? m.S('water') : 0);
    }

let p = null;
function fresh(mode = 'survival') {
  p?.remove();
  p = addPlayer(m, level, 5.5, 95, 5.5);
  p.setGameMode(mode);
  p.invulnerable = true;
  return p;
}

/** start at y, with `input` held for n ticks; the steady vertical speed (the last tick's) and the track */
function run(input, n = 40, y = 95, mode = 'survival', flying = false) {
  fresh(mode);
  p.flying = flying;
  p.moveTo(5.5, y, 5.5, 0, 0);
  p.input = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false, ...input };
  const ys = [];
  for (let i = 0; i < n; i++) {
    level.tick();
    ys.push(p.y);
  }
  return { v: ys[n - 1] - ys[n - 2], ys, crouching: p.crouching, height: p.height };
}

const idle = run({});
const sneak = run({ sneak: true });
console.log(`     steady sinking in water: idle ${idle.v.toFixed(4)}/tick, sneaking ${sneak.v.toFixed(4)}/tick`);
check('idle in the water, a player drifts down at 0.025 a tick', Math.abs(idle.v + 0.025) < 1e-3, String(idle.v));
// (settled: the speed after the tick's drag is v = (v − 0.04)·0.8 − 0.005 = −0.185, and the move is made at v − 0.04)
check('sneaking, it sinks 0.225 a tick, settled', Math.abs(sneak.v + 0.225) < 1e-3, String(sneak.v));
check('sneaking in the water crouches (1.5 tall), as vanilla\'s updatePlayerPose does', sneak.crouching && sneak.height === 1.5);
const early = run({ sneak: true }, 2);
check('the pull is there from the first tick (0.04 more down than idle after one)', early.ys[0] < run({}, 2).ys[0] - 0.03);

// creative, not flying: the same
const cre = run({ sneak: true }, 40, 95, 'creative', false);
check('in creative, swimming (not flying), sneaking sinks just the same', Math.abs(cre.v + 0.225) < 1e-3, String(cre.v));
// flying: sneak is the fly-down, with no extra pull (the flying fix's speeds)
const fly = run({ sneak: true }, 30, 95, 'creative', true);
const flyAir = (() => {
  fresh('creative');
  p.flying = true;
  p.moveTo(30.5, 120, 30.5, 0, 0);
  p.input = { forward: false, back: false, left: false, right: false, jump: false, sneak: true, sprint: false };
  const ys = [];
  for (let i = 0; i < 30; i++) {
    level.tick();
    ys.push(p.y);
  }
  return ys[29] - ys[28];
})();
check('flying down through water is no faster than through air (no goDownInWater while flying)', Math.abs(fly.v - flyAir) < 1e-9, `${fly.v} vs ${flyAir}`);

// out of the water: sneaking on the ground does nothing to the fall
{
  fresh();
  p.moveTo(30.5, 64, 30.5, 0, 0);
  p.input = { forward: false, back: false, left: false, right: false, jump: false, sneak: true, sprint: false };
  for (let i = 0; i < 10; i++) level.tick();
  check('on dry ground sneaking just crouches', p.onGround && p.y === 64 && p.crouching);
}

// swimming along while sneaking is slowed as walking is (sneaking speed 0.3)
const along = (sneak) => {
  fresh();
  p.moveTo(0.5, 90, 0.5, -45, 0);
  p.input = { forward: true, back: false, left: false, right: false, jump: false, sneak, sprint: false };
  const pts = [];
  for (let i = 0; i < 30; i++) {
    level.tick();
    pts.push([p.x, p.z]);
  }
  const [a, b] = [pts[19], pts[29]];
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
};
const hs = along(false), hc = along(true);
console.log(`     swimming along: ${hs.toFixed(4)} vs sneaking ${hc.toFixed(4)} (10 ticks)`);
check('swimming along while sneaking goes at 0.3 of the speed', Math.abs(hc / hs - 0.3) < 0.02, `${hc / hs}`);

// and sneaking still keeps you from walking off a ledge on land (vanilla maybeBackOffFromEdge, isAboveGround)
{
  for (let x = 20; x <= 24; x++) for (let z = 20; z <= 24; z++) for (let y = 64; y <= 66; y++) world.setState(x, y, z, m.S('stone'));
  fresh();
  p.moveTo(22.5, 67, 22.5, -90, 0);
  p.input = { forward: true, back: false, left: false, right: false, jump: false, sneak: true, sprint: false };
  for (let i = 0; i < 80; i++) level.tick();
  check('sneaking to a ledge on land, you stop at its edge', p.y === 67 && p.x < 25.4 && p.x > 24.5, `${p.x} ${p.y}`);
}

await exitWithStatus(close);

// Ender pearls by walls and end gateways.
//
// A pearl takes its thrower to where it was at the start of the tick it hit something (vanilla ThrownEnderpearl.onHit),
// which by a wall can be less than the 0.3 of the player's half width from it: the player is then partly in the
// wall. Vanilla's LocalPlayer.moveTowardsClosestSpace pushes such a player out, 0.1 a tick, toward the nearest free
// side of the block a corner of its box is in; without it the player stayed there, suffocating, till they walked away.
//
// A pearl thrown at 1.5 blocks a tick is taken by an end gateway it passes through between two ticks too (as from
// 1.21.2), and one that drops on to the bedrock under the gateway goes through rather than landing there.

import { load, check, exitWithStatus, flatLevel, ticks } from '../bastions/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/entity/throwable.ts', '/src/game/endGateway.ts', '/src/game/gatewayTravel.ts', '/src/world/blockEntity.ts']);
const NONE = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };

// stone to y 63 (its top at 64), a wall across x 10, nine blocks high
const { world, level } = flatLevel(m, -2, -2, 4, 4, 64);
for (let y = 64; y <= 72; y++) for (let z = -6; z <= 6; z++) world.setState(10, y, z, m.S('stone'));
// (the game's hook)
level.onPortal = (e, x, y, z, kind) => { if (kind === 'end_gateway') m.gatewayTravel(level, e, x, y, z); };

let p = null;
function fresh(x, y, z, yaw = 0, pitch = 0) {
  p?.remove();
  p = new m.Player(level);
  p.setGameMode('survival');
  p.moveTo(x, y, z, yaw, pitch);
  level.player = p;
  level.addEntity(p);
  p.input = { ...NONE };
  return p;
}
/** a pearl of the player's at (x, y, z) moving (dx, dy, dz) a tick; ticks until it's gone; whether it went into a gateway on its way */
function pearl(x, y, z, dx, dy, dz) {
  const t = new m.ThrownItem(level, 'ender_pearl', p);
  t.moveTo(x, y, z, 0, 0);
  [t.dx, t.dy, t.dz] = [dx, dy, dz];
  level.addEntity(t);
  let n = 0;
  while (!t.removed && n++ < 200) level.tick();
  return t;
}

// --- 1. a pearl that hits a wall
fresh(3.5, 64, 0.5);
ticks(level, 3);
const h0 = p.health;
// (0.1 from the wall's face at the start of the tick it hits: the player's box, 0.3 either side, is 0.2 into the wall)
pearl(9.9, 65, 0.5, 1.2, 0, 0);
check('a pearl that hits a wall takes the player to where it was the tick before', Math.abs(p.x - 9.9) < 1e-6 && Math.abs(p.y - 65) < 1e-6, `${p.x} ${p.y}`);
check('...for 5 points of fall damage', p.health === h0 - 5, String(p.health));
let low = p.health;
const lowest = (n) => { for (let i = 0; i < n; i++) { level.tick(); low = Math.min(low, p.health); } };
lowest(6);
check('...and partly in the wall, the player is pushed out of it within a few ticks', p.x + 0.3 <= 10 + 1e-6, `x ${p.x.toFixed(3)}`);
lowest(40);
// (the wall's one point in the first tick or two is nothing after the fall's five, as a hit soon after a bigger one is)
check('...without suffocating', low === h0 - 5, String(low));

// --- 2. the push only where a corner of the box is in a block
const still = (name, x, y, z, n = 20) => {
  fresh(x, y, z);
  ticks(level, n);
  check(name, Math.abs(p.x - x) < 1e-6 && Math.abs(p.z - z) < 1e-6, `${p.x} ${p.z}`);
};
still('standing against a wall, not in it, nothing pushes', 9.7, 64, 0.5);
still('...nor in the open', 3.5, 64, 3.5);
// (a pit beside the player, and the floor it stands on)
world.setState(4, 63, 8, 0);
still('...nor by a pit', 3.7, 64, 8.5);
world.setState(4, 63, 8, m.S('stone'));
// (a tunnel one wide and two high)
for (let x = 20; x <= 24; x++) for (let y = 64; y <= 66; y++) for (const z of [9, 11]) world.setState(x, y, z, m.S('stone'));
for (let x = 20; x <= 24; x++) world.setState(x, 66, 10, m.S('stone'));
still('...nor in a tunnel one block wide and two high', 22.5, 64, 10.5);
// half in the tunnel's wall, the open side to the north of it (z falling) is nearer than the tunnel (z rising)
fresh(22.5, 64, 9.2);
ticks(level, 12);
check('half in a block with open ground on its far side, the player is pushed out that way', p.z + 0.3 <= 9 + 1e-6, `z ${p.z.toFixed(3)}`);
// walled in on every side, in the middle of solid stone: nowhere to push to
fresh(22.5, 60, 10.5);
ticks(level, 5);
check('in solid stone there is nowhere to push to', Math.abs(p.x - 22.5) < 1e-6 && Math.abs(p.z - 10.5) < 1e-6);
p.remove();
p = null;
// a spectator goes through blocks and is left alone
fresh(9.9, 65, 0.5);
p.setGameMode('spectator');
ticks(level, 10);
check('a spectator in a wall is left there', Math.abs(p.x - 9.9) < 1e-6, String(p.x));

// --- 3. into an end gateway (its way out is known: by (10, 70, 40), onto the floor there)
const gx = 40, gy = 70, gz = 40;
m.placeEndGateway(level, gx, gy, gz, [10, 70, 40], false);
const be = world.getBlockEntity(gx, gy, gz);
const out = () => Math.hypot(p.x - 10.5, p.z - 40.5) < 9 && Math.abs(p.y - 64) < 0.01;
const reset = () => {
  fresh(gx - 6.5, 64, gz + 0.5);
  ticks(level, 45);
  be.teleportCooldown = 0;
};
reset();
// (its box clear of the gateway's block before this tick's move, and clear past it after)
pearl(gx - 0.2, gy + 0.5, gz + 0.5, 1.5, 0, 0);
check('a pearl that crosses the gateway within one tick is taken through, and its thrower after it', out(), `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`);
reset();
pearl(gx - 2.9, gy + 0.5, gz + 0.5, 1.5, 0, 0);
check('...as one that is in the gateway at the start of a tick always was', out(), `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`);
reset();
// (falling through the gateway's block on to the bedrock under it, all within one tick)
pearl(gx - 0.9, gy + 0.6, gz + 0.5, 1.2, -0.9, 0);
check('a pearl that drops through the gateway on to the bedrock under it goes through', out(), `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`);
reset();
// (over the top of the cage: it never touches the gateway)
pearl(gx - 3, gy + 4, gz + 0.5, 1.5, 0, 0);
check('a pearl that passes over the gateway is not taken', !out() && p.x > gx, `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`);
reset();
be.teleportCooldown = 40;
pearl(gx - 0.2, gy + 0.5, gz + 0.5, 1.5, 0, 0);
check('...nor one that crosses a gateway that is cooling down', !out(), `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`);

await exitWithStatus(close);

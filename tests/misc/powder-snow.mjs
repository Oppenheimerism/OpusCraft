// Powder snow (vanilla PowderSnowBlock, LivingEntity's freezing): without leather boots a player sinks into it, slowed
// (0.9 across, 1.5 up and down); with them they stand on it and walk across, and sneaking lets them down through it.
// In it they freeze a tick at a time to 140 (with any leather armour on, not at all), thaw 2 a tick out of it, are
// slowed by the frost (up to 0.05 off the base speed), and fully frozen take 1 freeze damage every 40 ticks. A long
// fall onto it lands on its crust unhurt; burning, it puts you out and melts.

import { load, check, exitWithStatus, flatLevel, addPlayer } from '../fixes/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/item/item.ts']);

// a pit of powder snow, 5 wide and 3 deep (y 61..63, its top at 64), in stone
const { world, level } = flatLevel(m, -1, -1, 2, 2, 64, 'stone', 'snow');
const fill = () => {
  for (let x = 8; x <= 12; x++) for (let z = 8; z <= 30; z++) for (let y = 61; y <= 63; y++) world.setState(x, y, z, m.S('powder_snow'));
};
fill();

let p = null;
const NONE = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
function fresh(x = 10.5, y = 64, z = 10.5, armor = []) {
  p?.remove();
  p = addPlayer(m, level, x, y, z);
  p.input = { ...NONE };
  p.inventory.armor.fill(null);
  for (const [i, id] of armor) p.inventory.armor[i] = m.ItemStack.of(id);
  return p;
}
const tick = (n = 1) => { for (let i = 0; i < n; i++) level.tick(); };

// --- sinking, or standing on it ---
fresh();
tick(1);
const y1 = p.y;
tick(30);
check('without leather boots, a player sinks into powder snow', p.y < 63, `${y1} → ${p.y}`);
check('slowly (stuck: 1.5 of the move a tick, the fall reset): not yet at the bottom 2 ticks in', (() => { fresh(); tick(2); return p.y > 63; })());
fresh(10.5, 64, 10.5, [[0, 'leather_boots']]);
tick(40);
check('with leather boots on, they stand on top of it', p.y === 64 && p.onGround, String(p.y));
p.yaw = 0;
p.input = { ...NONE, forward: true };
const z0 = p.z;
tick(40);
check('and walk across it at a walk (not stuck)', p.y === 64 && p.z - z0 > 6, `${p.z - z0}`);
p.input = { ...NONE, sneak: true };
tick(40);
check('sneaking, they go down through it (isDescending)', p.y < 63.5, String(p.y));

// --- freezing ---
fresh();
const frozenAt = [];
for (let i = 0; i < 150; i++) {
  tick(1);
  frozenAt.push(p.ticksFrozen);
}
check('in it, ticksFrozen climbs a tick at a time', frozenAt[9] - frozenAt[4] === 5, JSON.stringify(frozenAt.slice(0, 12)));
check('to 140 and no further: fully frozen', p.ticksFrozen === 140 && p.isFullyFrozen() && p.percentFrozen() === 1);
check('the frost slows it: 0.05 off the base speed, fully frozen', Math.abs(p.frostSpeed + 0.05) < 1e-9 || p.onGround === false, String(p.frostSpeed));
p.hurts.length = 0;
// (no healing meanwhile: hungry enough not to regenerate)
p.food.level = 17;
p.food.saturation = 0;
const h0 = p.health;
p.invulnerableTime = 0;
tick(80);
const freezes = p.hurts.filter((s) => s === 'freeze').length;
check('fully frozen, 1 freeze damage every 40 ticks (2 in 80)', freezes === 2 && Math.abs(h0 - p.health - 2) < 1e-9, `${freezes} hits, ${h0 - p.health} health`);
// out of it: thawing
p.moveTo(40.5, 64, 40.5, 0, 0);
tick(10);
check('out of it, it thaws 2 a tick', p.ticksFrozen === 120, String(p.ticksFrozen));
tick(70);
check('and is soon warm again, the frost\'s slowness gone', p.ticksFrozen === 0 && p.frostSpeed === 0);

// leather armour keeps the cold out
for (const [slot, id] of [[3, 'leather_helmet'], [2, 'leather_chestplate'], [1, 'leather_leggings']]) {
  fresh(10.5, 64, 10.5, [[slot, id]]);
  tick(60);
  check(`wearing ${id.replace('_', ' ')} alone, it doesn't freeze (but sinks)`, p.ticksFrozen === 0 && p.y < 64, `${p.ticksFrozen} ${p.y}`);
}
// iron boots don't
fresh(10.5, 64, 10.5, [[0, 'iron_boots']]);
tick(30);
check('iron boots neither hold it up nor keep it warm', p.ticksFrozen > 0 && p.y < 64);
// spectators don't freeze
fresh();
p.setGameMode('spectator');
p.inPowderSnow = true;
check('a spectator can\'t freeze', !p.canFreeze());

// --- a long fall onto it ---
fresh(20.5, 64, 20.5);
p.hurts.length = 0;
p.moveTo(10.5, 80, 20.5, 0, 0);
let landed = null;
for (let i = 0; i < 60 && landed === null; i++) {
  tick(1);
  if (p.onGround) landed = p.y;
}
check('falling 16 blocks onto powder snow, it lands on the crust (0.9 up)', landed !== null && Math.abs(landed - 63.9) < 1e-6, String(landed));
check('unhurt', !p.hurts.includes('fall'), JSON.stringify(p.hurts));
tick(20);
check('then sinks in', p.y < 63.9);
// the same fall onto stone hurts (the pit's rim)
fresh(40.5, 80, 40.5);
p.hurts.length = 0;
tick(60);
check('(the same fall onto stone hurts)', p.hurts.includes('fall'));

// --- burning ---
fill();
fresh(10.5, 64, 12.5);
tick(3);
p.remainingFireTicks = 100;
tick(2);
check('burning, powder snow puts you out', !p.isOnFire(), String(p.remainingFireTicks));
check('and melts where you burned in it', [61, 62, 63].some((y) => world.getState(10, y, 12) === 0));

await exitWithStatus(close);

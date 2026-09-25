// M4a: wind charges, on a flat stone world with a ticking Level. Thrown from the eye at a block and a half a tick (one
// used up, none in creative, half a second before the next), they fly dead straight; the burst where one strikes
// throws what's near away (without hurting it), a point of damage to what it struck; doors, trapdoors, fence gates,
// buttons, levers and bells are set off (not iron ones, and a breeze's only while mobs may grief). A player thrown up
// by their own wind charge is hurt only for the fall below where it burst; a breeze's gives no such grace; the start
// of the fall is told on (Who Needs Rockets?). Dispensers and ominous trial spawners send them out, a blow turns one
// (not in its first five ticks), and one gone over the top of the world bursts. The Wind Charged effect's burst, as
// its bearer's death ends, is the same kind of burst, 3 to 5 across.

import { load, check, flatLevel, place, prop, ticks, playerAt, rightClick, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/game/spawner.ts', '/src/entity/windCharge.ts', '/src/game/windBurst.ts', '/src/game/windCharges.ts', '/src/game/combat.ts',
  '/src/game/redstone/dispenser.ts', '/src/game/redstone/dispenseItems.ts', '/src/entity/ominousItemSpawner.ts', '/src/world/constants.ts',
  '/src/game/potionEffects.ts', '/src/entity/effects.ts',
]);
const G = 64;
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const count = (sounds, name) => sounds.filter((s) => s.name === name).length;
const charges = (level, type = 'wind_charge') => level.entities.filter((e) => !e.removed && e.type === type);
const speed = (e) => Math.hypot(e.dx, e.dy, e.dz);

// ---------------------------------------------------------------------------------------------------------------
// Throwing

{
  const { level, sounds } = flatLevel(m, -2, -2, 2, 2);
  const p = playerAt(m, level, 0.5, G, 0.5, { yaw: 0, pitch: 0, held: stack('wind_charge', 16) });
  const inter = new m.Interaction(level, p);
  rightClick(m, level, p, inter);
  const [c] = charges(level);
  check('thrown: a wind charge comes out of the eye', !!c && near(c.y, p.y + p.eyeHeight, 1e-9) && c.owner === p, c && `${c.y} ${c.owner?.type}`);
  check('thrown: at a block and a half a tick, the way the player looks (south)', !!c && near(speed(c), 1.5, 0.08) && c.dz > 1.4, c && `${speed(c)} ${c.dz}`);
  check('thrown: one used up', p.inventory.selectedItem?.count === 15, p.inventory.selectedItem?.count);
  check('thrown: its whoosh', count(sounds, 'entity.wind_charge.throw') === 1);
  check('thrown: half a second before the next', p.cooldowns.get('wind_charge') === 10, p.cooldowns.get('wind_charge'));
  rightClick(m, level, p, inter);
  check('thrown: not again while it cools down', charges(level).length === 1 && p.inventory.selectedItem?.count === 15);
  // flying straight: no drag, no fall
  const [x0, y0, z0] = [c.x, c.y, c.z], [vx, vy, vz] = [c.dx, c.dy, c.dz];
  for (let i = 0; i < 5; i++) c.tick();
  check('flight: dead straight at its speed (no drag, no fall)', near(c.x, x0 + 5 * vx, 1e-9) && near(c.y, y0 + 5 * vy, 1e-9) && near(c.z, z0 + 5 * vz, 1e-9) && c.dy === vy && c.dz === vz, `${c.y - y0} ${c.z - z0}`);
  const pc = playerAt(m, level, 0.5, G, 4.5, { held: stack('wind_charge', 16), creative: true });
  rightClick(m, level, pc);
  check('creative: none used up', pc.inventory.selectedItem?.count === 16);
}

// ---------------------------------------------------------------------------------------------------------------
// The burst: a charge flown into a wall and into a pig

{
  const { level, sounds } = flatLevel(m, -2, -2, 2, 2);
  for (let y = G; y < G + 4; y++) for (let x = -3; x <= 3; x++) level.setBlock(x, y, 6, m.S('stone'));
  const pig = m.createMob('pig', level);
  pig.moveTo(0.5, G, 5.2, 0, 0);
  level.addEntity(pig);
  const farPig = m.createMob('pig', level);
  farPig.moveTo(-3.5, G, 1.5, 0, 0);
  level.addEntity(farPig);
  const c = new m.WindCharge(level, null);
  c.moveTo(0.5, G + 1.5, 2.5, 0, 0);
  c.shoot(0, 0, 1, 0.8, 0);
  level.addEntity(c);
  const hp = pig.health;
  for (let i = 0; i < 6 && !c.removed; i++) c.tick();
  check('burst: at the wall, and the charge is gone', c.removed && count(sounds, 'entity.wind_charge.wind_burst') === 1);
  check('burst: the pig by the wall thrown back from it, unhurt', pig.dz < -0.2 && pig.health === hp, `${pig.dz.toFixed(3)} ${pig.health}`);
  check('burst: a pig 6 blocks off left alone', farPig.dx === 0 && farPig.dz === 0);
  const g = level.entities.length;
  void g;
  // struck: a point of damage and the burst at the charge
  const c2 = new m.WindCharge(level, null);
  c2.moveTo(0.5, G + 0.5, 1.5, 0, 0);
  c2.shoot(0, 0, 1, 1, 0);
  level.addEntity(c2);
  pig.dx = pig.dz = 0;
  const hp2 = pig.health;
  for (let i = 0; i < 6 && !c2.removed; i++) c2.tick();
  check('struck: a point of damage to the pig', c2.removed && pig.health === hp2 - 1, `${hp2} -> ${pig.health}`);
  check('struck: the pig blown on', pig.dz > 0.1, pig.dz);
  check('struck: its damage is the wind charge\'s', pig.lastDamageSource === 'windCharge', pig.lastDamageSource);
}

// ---------------------------------------------------------------------------------------------------------------
// Blocks set off

{
  const { level, sounds } = flatLevel(m, -2, -2, 2, 2);
  const burstAt = (x, y, z, source = null) => m.windBurstAt(level, source, x + 0.5, y + 0.5, z + 0.5, 1.2, { knockback: 1.22, sound: 'entity.wind_charge.wind_burst' });
  // a door hit by a thrown charge: the whole chain
  place(m, level, 'oak_door', 0, G, 6, { yaw: 180 });
  const c = new m.WindCharge(level, null);
  c.moveTo(0.5, G + 0.5, 2.5, 0, 0);
  c.shoot(0, 0, 1, 1, 0);
  level.addEntity(c);
  for (let i = 0; i < 8 && !c.removed; i++) c.tick();
  check('a thrown charge opens the oak door it hits', c.removed && prop(m, level, 0, G, 6, 'open') === true && prop(m, level, 0, G + 1, 6, 'open') === true);
  burstAt(0, G, 6);
  check('another burst shuts it', prop(m, level, 0, G, 6, 'open') === false);
  const cases = [
    ['iron_door', 'open', false, {}],
    ['oak_trapdoor', 'open', true, {}],
    ['iron_trapdoor', 'open', false, {}],
    ['oak_fence_gate', 'open', true, {}],
    ['lever', 'powered', true, { props: { face: 'floor', facing: 'north', powered: false } }],
    ['stone_button', 'powered', true, { props: { face: 'floor', facing: 'north', powered: false } }],
  ];
  let x = -8;
  for (const [name, key, changes, o] of cases) {
    x += 3;
    place(m, level, name, x, G, -4, o);
    const before = prop(m, level, x, G, -4, key);
    burstAt(x, G, -4);
    const after = prop(m, level, x, G, -4, key);
    check(`${name}: ${changes ? 'set off' : 'left alone'} by a burst`, changes ? after !== before : after === before, `${before} -> ${after}`);
  }
  // a bell: a charge flown into it rings it; a burst's rays get through its blast resistance only if the burst is a
  // breeze's (radius 3: a player's, 1.2, never gets past its 5)
  place(m, level, 'bell', 8, G, 4);
  const rings = count(sounds, 'block.bell.use');
  m.windBurstAt(level, null, 8.5, G + 0.5, 3.25, 1.2, { knockback: 1.22, sound: 'entity.wind_charge.wind_burst' });
  check("a bell: a player's burst beside it doesn't ring it", count(sounds, 'block.bell.use') === rings);
  const cb = new m.WindCharge(level, null);
  cb.moveTo(8.5, G + 0.5, 1.5, 0, 0);
  cb.shoot(0, 0, 1, 1, 0);
  level.addEntity(cb);
  for (let i = 0; i < 6 && !cb.removed; i++) cb.tick();
  check('a bell: a charge flown into it rings it', cb.removed && count(sounds, 'block.bell.use') === rings + 1, count(sounds, 'block.bell.use') - rings);
  level.gameRules.mobGriefing = true;
  m.windBurstAt(level, new m.BreezeWindCharge(level, null), 8.5, G + 0.5, 3.25, 3, { knockback: 1, sound: 'entity.breeze.wind_burst' });
  check("a bell: a breeze's burst beside it rings it", count(sounds, 'block.bell.use') === rings + 2);
  // a breeze's burst sets blocks off only while mobs may grief
  place(m, level, 'oak_trapdoor', -6, G, 6);
  const breezeCharge = new m.BreezeWindCharge(level, null);
  level.gameRules.mobGriefing = false;
  burstAt(-6, G, 6, breezeCharge);
  check("a breeze's burst leaves blocks alone without mobGriefing", prop(m, level, -6, G, 6, 'open') === false);
  level.gameRules.mobGriefing = true;
  burstAt(-6, G, 6, breezeCharge);
  check("a breeze's burst sets them off with it", prop(m, level, -6, G, 6, 'open') === true);
  level.gameRules.mobGriefing = false;
  burstAt(-6, G, 6);
  check("a player's charge sets them off either way", prop(m, level, -6, G, 6, 'open') === false);
}

// ---------------------------------------------------------------------------------------------------------------
// Thrown up: the fall back

function launch(kind) {
  const { level } = flatLevel(m, -2, -2, 2, 2);
  const p = playerAt(m, level, 0.5, G, 0.5);
  p.gameMode = 'survival';
  ticks(level, 2);
  const falls = [];
  m.impulseHooks.fallAfterExplosion = (pl, start, now, cause) => falls.push({ start, now, cause: cause?.type ?? null });
  // (a charge thrown at one's feet bursts a quarter block over the ground)
  const c = kind === 'breeze' ? new m.BreezeWindCharge(level, null) : new m.WindCharge(level, p);
  const dy0 = p.dy;
  c.explode(p.x, p.y + 0.25, p.z);
  const dy = p.dy - dy0;
  const imp = m.impulseOf(p);
  const snapshot = { impact: imp.impactPos && [...imp.impactPos], ignore: imp.ignoreFall, cause: imp.cause?.type ?? null };
  let top = p.y;
  for (let i = 0; i < 200; i++) {
    level.tick();
    top = Math.max(top, p.y);
    if (i > 5 && p.onGround) break;
  }
  m.impulseHooks.fallAfterExplosion = null;
  return { p, dy, snapshot, top, falls };
}
{
  const own = launch('player');
  check("own charge: thrown straight up (1.22 times a quarter block's closeness in 2.4)", near(own.dy, (1 - 0.25 / 2.4) * 1.22, 1e-6) && own.snapshot.cause === 'wind_charge', `${own.dy} ${own.snapshot.cause}`);
  check("own charge: where they were is remembered, the fall back forgiven", own.snapshot.ignore === true && near(own.snapshot.impact[1], G, 1e-9));
  check(`own charge: up ${(own.top - G).toFixed(1)} blocks and back down unhurt`, own.top - G > 5 && own.p.health === 20 && own.p.onGround, `${own.top} ${own.p.health}`);
  check('own charge: the start of the fall told once, from where it burst', own.falls.length === 1 && own.falls[0].cause === 'wind_charge' && near(own.falls[0].start[1], G, 1e-9) && own.falls[0].now[1] > G + 5, JSON.stringify(own.falls));
  const br = launch('breeze');
  check("a breeze's charge: no grace", br.snapshot.ignore === false && br.snapshot.cause === 'breeze_wind_charge');
  check(`a breeze's charge: up ${(br.top - G).toFixed(1)} blocks and hurt by the fall`, br.top - G > 3.2 && br.p.health < 20, `${br.top} ${br.p.health}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Dispensers, ominous trial spawners, a blow, the top of the world

{
  const { level, sounds } = flatLevel(m, -2, -2, 2, 2);
  place(m, level, 'dispenser', 0, G, 0, { props: { facing: 'east', triggered: false } });
  const src = { level, x: 0, y: G, z: 0, facing: 5, be: level.world.getBlockEntity(0, G, 0), success: true };
  const left = m.dispenseBehaviorFor(stack('wind_charge', 5))(src, stack('wind_charge', 5));
  const [c] = charges(level);
  check('dispenser: one wind charge out of its front', !!c && c.x > 0.5 && left.count === 4, c && `${c.x} ${left.count}`);
  check('dispenser: about a block a tick, straight out', !!c && c.dx > 0.85 && Math.abs(c.dy) < 0.2 && Math.abs(c.dz) < 0.2, c && `${c.dx} ${c.dy} ${c.dz}`);
  check('dispenser: its whoosh', count(sounds, 'entity.wind_charge.throw') === 1);
  const o = m.OMINOUS_PROJECTILES.wind_charge(level, 3.5, G + 4, 3.5);
  check('ominous trial spawner: one shot straight down', o.type === 'wind_charge' && o.dy < -0.85 && Math.abs(o.dx) < 0.2 && Math.abs(o.dz) < 0.2, `${o.dx} ${o.dy} ${o.dz}`);
  // a blow turns one the way the striker looks, and makes it theirs; not in its first five ticks
  const p = playerAt(m, level, 0.5, G, -3.5, { yaw: 90, pitch: 0 });
  p.gameMode = 'survival';
  const young = new m.WindCharge(level, null);
  young.moveTo(0.5, G + 1, -2.5, 0, 0);
  young.shoot(0, 0, 1, 0.5, 0);
  level.addEntity(young);
  p.attackStrengthTicker = 100;
  m.playerAttack(level, p, young, () => {});
  check('a blow: a fresh wind charge goes on as it was', near(young.dz, 0.5, 1e-9) && young.owner === null);
  for (let i = 0; i < 5; i++) young.tick();
  p.attackStrengthTicker = 100;
  m.playerAttack(level, p, young, () => {});
  check('a blow: after five ticks it goes the way the striker looks (west), theirs', near(young.dx, -1, 1e-9) && near(young.dz, 0, 1e-9) && young.owner === p, `${young.dx} ${young.dz}`);
  const high = new m.WindCharge(level, null);
  high.moveTo(0.5, m.MAX_Y + 31.5, 0.5, 0, 0);
  level.addEntity(high);
  const bursts = count(sounds, 'entity.wind_charge.wind_burst');
  high.tick();
  check('gone over the top of the world, it bursts', high.removed && count(sounds, 'entity.wind_charge.wind_burst') === bursts + 1);
}

// ---------------------------------------------------------------------------------------------------------------
// The Wind Charged effect

{
  const { level, sounds } = flatLevel(m, -2, -2, 2, 2);
  place(m, level, 'oak_trapdoor', 2, G, 0);
  const z = m.createMob('zombie', level);
  z.moveTo(0.5, G, 0.5, 0, 0);
  level.addEntity(z);
  z.addEffect(new m.MobEffectInstance(m.MOB_EFFECTS.wind_charged, 600, 0));
  const pig = m.createMob('pig', level);
  pig.moveTo(4.5, G, 0.5, 0, 0);
  level.addEntity(pig);
  z.hurt(100, 'generic', null);
  for (let i = 0; i < 25; i++) level.tick();
  check("Wind Charged: its bearer's death ends in a burst (the breeze's sound)", count(sounds, 'entity.breeze.wind_burst') === 1);
  check('Wind Charged: it sets off a trapdoor beside it', prop(m, level, 2, G, 0, 'open') === true);
  check(`Wind Charged: a pig 4 blocks off blown away (${(pig.x - 4.5).toFixed(2)} blocks)`, pig.x - 4.5 > 0.1, pig.x);
}

await exitWithStatus(close);

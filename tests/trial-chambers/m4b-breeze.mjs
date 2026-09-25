// M4b: the breeze, on a flat stone world with a ticking Level. What it is (30 health, its size and eyes, 10
// experience); idle, it strolls and whistles and leaves creative players be; a survival player within its range is
// fought: it breathes in, fires a wind charge from its snout and leaps about, sliding and jumping; every pose comes up.
// Arrows and snowballs are turned back off it (once each), a player's wind charge hurts it and another breeze's does
// not; it takes no fall damage but lands with a thump; a player's kill drops breeze rods (more with looting), no one
// else's; the trial spawner's breeze config brings real breezes, and the spawn egg is there.

import { load, check, flatLevel, playerAt, ticks, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/game/spawner.ts', '/src/entity/breeze.ts', '/src/entity/windCharge.ts', '/src/entity/arrow.ts', '/src/entity/throwable.ts',
  '/src/game/trialSpawner.ts', '/src/world/blockEntity.ts', '/src/game/combat.ts', '/src/entity/effects.ts',
]);
const G = 64;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const count = (sounds, name) => sounds.filter((s) => s.name === name).length;
const live = (level, type) => level.entities.filter((e) => !e.removed && e.type === type);

function breezeAt(level, x, z, y = G) {
  const b = m.createMob('breeze', level);
  b.moveTo(x, y, z, 0, 0);
  level.addEntity(b);
  return b;
}

// ---------------------------------------------------------------------------------------------------------------
// What it is

{
  const { level } = flatLevel(m, -2, -2, 2, 2);
  const b = breezeAt(level, 0.5, 0.5);
  check('a Breeze, from createMob', b instanceof m.Breeze && b.type === 'breeze' && m.entityDisplayName('breeze') === 'Breeze');
  check('30 health, 10 experience', b.maxHealth === 30 && b.health === 30 && b.xpReward === 10, `${b.maxHealth} ${b.xpReward}`);
  check('0.6 wide, 1.77 tall, its eyes at 1.3452', near(b.bb.maxX - b.bb.minX, 0.6) && near(b.bb.maxY - b.bb.minY, 1.77) && near(b.eyeHeight, 1.3452), `${b.bb.maxY - b.bb.minY} ${b.eyeHeight}`);
  check('its spawn egg', !!m.ITEMS.get('breeze_spawn_egg') && m.ITEMS.get('breeze_spawn_egg').creativeTab === 'spawn_eggs');
  check("the trial spawner's breeze config brings breezes", m.TRIAL_SPAWNER_CONFIGS['trial_chamber/breeze/normal'].spawnPotentials[0][0].entity.id === 'breeze');
}

// ---------------------------------------------------------------------------------------------------------------
// Idle, and a creative player

{
  const { level, sounds } = flatLevel(m, -3, -3, 3, 3);
  const b = breezeAt(level, 0.5, 0.5);
  const pc = playerAt(m, level, 6.5, G, 0.5, { creative: true });
  let moved = 0, lastX = b.x, lastZ = b.z;
  for (let i = 0; i < 1200; i++) {
    level.tick();
    moved += Math.hypot(b.x - lastX, b.z - lastZ);
    lastX = b.x;
    lastZ = b.z;
  }
  check('idle: it keeps to its idle activity with only a creative player about', b.activity() === 'idle' && b.attackTarget === null, `${b.activity()} ${b.attackTarget?.type}`);
  check('idle: no wind charges fired', count(sounds, 'entity.breeze.shoot') === 0 && live(level, 'breeze_wind_charge').length === 0);
  check(`idle: it strolls about (${moved.toFixed(1)} blocks in a minute)`, moved > 2);
  check('idle: it whistles now and then on the ground', count(sounds, 'entity.breeze.idle_ground') >= 2, count(sounds, 'entity.breeze.idle_ground'));
  check('idle: it whirls', count(sounds, 'entity.breeze.whirl') >= 2, count(sounds, 'entity.breeze.whirl'));
  void pc;
}

// ---------------------------------------------------------------------------------------------------------------
// A fight

{
  const { level, sounds } = flatLevel(m, -3, -3, 3, 3);
  level.difficulty = 'normal';
  const b = breezeAt(level, 10.5, 0.5);
  const p = playerAt(m, level, 0.5, G, 0.5);
  p.gameMode = 'survival';
  p.addEffect?.(new m.MobEffectInstance(m.MOB_EFFECTS.resistance, 100000, 4));
  const poses = new Set();
  let firstCharge = null, chargeY = null, targetedAt = -1;
  for (let i = 0; i < 1600; i++) {
    level.tick();
    poses.add(b.pose);
    if (targetedAt < 0 && b.attackTarget === p) targetedAt = i;
    const c = live(level, 'breeze_wind_charge')[0];
    if (c && !firstCharge) {
      firstCharge = c;
      chargeY = c.y - b.y;
    }
  }
  check(`fight: it takes the survival player on (tick ${targetedAt})`, targetedAt >= 0 && targetedAt < 40);
  check('fight: it fires wind charges', count(sounds, 'entity.breeze.shoot') >= 3 && !!firstCharge, count(sounds, 'entity.breeze.shoot'));
  check('fight: breathing in before each shot', count(sounds, 'entity.breeze.inhale') >= count(sounds, 'entity.breeze.shoot'), `${count(sounds, 'entity.breeze.inhale')} ${count(sounds, 'entity.breeze.shoot')}`);
  check('fight: the charge comes from its snout', firstCharge instanceof m.BreezeWindCharge && firstCharge.owner === b && chargeY > 0.9 && chargeY < 1.5, chargeY);
  check("fight: the charges burst with the breeze's own sound", count(sounds, 'entity.breeze.wind_burst') >= 1);
  check(`fight: it shoots, breathes in and leaps (${[...poses].join(', ')})`, ['shooting', 'inhaling', 'long_jumping', 'standing'].every((x) => poses.has(x)));
  check('fight: it leaps (charge, jump, land)', count(sounds, 'entity.breeze.charge') >= 1 && count(sounds, 'entity.breeze.jump') >= 1 && count(sounds, 'entity.breeze.land') >= 1, `${count(sounds, 'entity.breeze.charge')} ${count(sounds, 'entity.breeze.jump')} ${count(sounds, 'entity.breeze.land')}`);
  // gone creative: it gives up
  p.gameMode = 'creative';
  ticks(level, 40);
  check('a player gone creative is let go', b.attackTarget === null);
}

{
  // too close to leap from (4 blocks), it slides away first, then fires
  const { level, sounds } = flatLevel(m, -3, -3, 3, 3);
  level.difficulty = 'normal';
  const b = breezeAt(level, 3.0, 0.5);
  const p = playerAt(m, level, 0.5, G, 0.5);
  p.gameMode = 'survival';
  p.addEffect(new m.MobEffectInstance(m.MOB_EFFECTS.resistance, 100000, 4));
  let slidAt = -1, farthest = 0;
  for (let i = 0; i < 200; i++) {
    level.tick();
    if (slidAt < 0 && b.pose === 'sliding') slidAt = i;
    farthest = Math.max(farthest, Math.hypot(b.x - p.x, b.z - p.z));
  }
  check(`close up: it slides (from tick ${slidAt}), with its rush`, slidAt >= 0 && slidAt < 20 && count(sounds, 'entity.breeze.slide') >= 1);
  check(`close up: away from the player, out past 4 blocks (${farthest.toFixed(1)})`, farthest > 4);
  check('close up: then it fires', count(sounds, 'entity.breeze.shoot') >= 1);
}

// ---------------------------------------------------------------------------------------------------------------
// Projectiles, damage, falling

{
  const { level, sounds } = flatLevel(m, -3, -3, 3, 3);
  const b = breezeAt(level, 0.5, 6.5);
  b.tick = () => {}; // (held still: only what strikes it matters here)
  const p = playerAt(m, level, 0.5, G, 0.5);
  p.gameMode = 'survival';
  const a = new m.Arrow(level, p);
  a.moveTo(0.5, G + 1, 3.5, 0, 0);
  a.dx = 0; a.dy = 0; a.dz = 1.5;
  level.addEntity(a);
  for (let i = 0; i < 4; i++) a.tick();
  check('an arrow is turned back off it, at half the speed', a.dz < 0 && near(Math.hypot(a.dx, a.dy, a.dz), 0.75, 0.2) && b.health === 30, `${a.dz} ${b.health}`);
  check('with its whoosh', count(sounds, 'entity.breeze.deflect') === 1);
  // coming back at it again, the same arrow is let through (turned once by each thing)
  a.moveTo(0.5, G + 1, 4.5, 0, 0);
  a.dx = 0; a.dy = 0; a.dz = 1.5;
  for (let i = 0; i < 3; i++) a.tick();
  check('the same arrow at it again passes on through', count(sounds, 'entity.breeze.deflect') === 1 && b.health === 30);
  const s = new m.ThrownItem(level, 'snowball', p);
  s.moveTo(0.5, G + 1, 4.5, 0, 0);
  s.dx = 0; s.dy = 0; s.dz = 1;
  level.addEntity(s);
  for (let i = 0; i < 3; i++) s.tick();
  check('a snowball too', s.dz < 0 && !s.removed && count(sounds, 'entity.breeze.deflect') === 2, `${s.dz} ${s.removed}`);
  // a player's wind charge hurts it; another breeze's charge doesn't
  const c = new m.WindCharge(level, p);
  c.moveTo(0.5, G + 1, 4.5, 0, 0);
  c.shoot(0, 0, 1, 1, 0);
  level.addEntity(c);
  for (let i = 0; i < 4 && !c.removed; i++) c.tick();
  check("a player's wind charge strikes it (a point of damage)", c.removed && b.health === 29, b.health);
  const other = breezeAt(level, -3.5, 6.5);
  check("another breeze can't hurt it", b.hurt(5, 'windCharge', other, new m.BreezeWindCharge(level, other)) === false && b.health === 29);
}
{
  const { level, sounds } = flatLevel(m, -2, -2, 2, 2);
  const b = breezeAt(level, 0.5, 0.5, G + 12);
  for (let i = 0; i < 80 && !b.onGround; i++) level.tick();
  check('a fall of 12 blocks: no damage', b.onGround && b.health === 30, `${b.onGround} ${b.health}`);
  check('but a thump as it lands', count(sounds, 'entity.breeze.land') >= 1);
}

// ---------------------------------------------------------------------------------------------------------------
// Loot

{
  const rods = (byPlayer, looting = 0) => {
    const out = [];
    for (let i = 0; i < 40; i++) {
      const { level } = flatLevel(m, -1, -1, 1, 1, G, `loot${i}`);
      const b = breezeAt(level, 0.5, 0.5);
      const p = playerAt(m, level, 2.5, G, 0.5);
      if (looting) p.inventory.main[0] = Object.assign(m.ItemStack.of('diamond_sword', 1), { tag: { enchantments: { looting } } });
      if (byPlayer) b.hurt(100, 'player', p);
      else b.hurt(100, 'generic', null);
      out.push(level.entities.filter((e) => e instanceof m.ItemEntity && e.stack.item.id === 'breeze_rod').reduce((n, e) => n + e.stack.count, 0));
    }
    return out;
  };
  const plain = rods(true);
  check(`a player's kill: 1 or 2 breeze rods (${Math.min(...plain)}..${Math.max(...plain)})`, Math.min(...plain) === 1 && Math.max(...plain) === 2);
  const lot = rods(true, 3);
  check(`looting III: more (${Math.min(...lot)}..${Math.max(...lot)})`, Math.min(...lot) >= 4 && Math.max(...lot) <= 8, lot.join());
  check("no one's kill: none", rods(false).every((n) => n === 0));
}

// ---------------------------------------------------------------------------------------------------------------
// A trial spawner's breeze (in a dark room: its spawn rules want the dark)

{
  const { level } = flatLevel(m, -2, -2, 2, 2);
  level.difficulty = 'normal';
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) level.setBlock(x, G + 5, z, m.S('stone'), 2);
  level.world.relightAll?.();
  level.setBlock(0, G, 0, m.S('trial_spawner'));
  const be = level.world.getBlockEntity(0, G, 0);
  be.normalConfig = 'trial_chamber/breeze/normal';
  let uuid = null;
  for (let i = 0; i < 40 && !uuid; i++) uuid = be.spawnMob(level);
  const mob = level.entities.find((e) => e.uuid === uuid);
  check('a trial spawner with the breeze config brings out a breeze', mob instanceof m.Breeze, uuid ? mob?.type : 'nothing spawned');
}

await exitWithStatus(close);

// M3a: the piglin brute (vanilla PiglinBrute, PiglinBruteAi): registered (summon, spawn egg, name, save and load), as a
// structure places it (a golden axe, its home where it stands, 50 health), its hit (13 on normal), whom it goes for
// (a player within 12 whether in gold or not, but not a creative one; wither skeletons), how it keeps to its home, how
// it and the piglins stand up for each other, gold meaning nothing to it, and its turning into a zombified piglin out
// of the Nether.

import { load, check, exitWithStatus, flatLevel, playerAt, ticks } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

const { m, close } = await load(['/src/entity/piglinBrute.ts', '/src/entity/piglin.ts', '/src/game/spawner.ts', '/src/world/dimension.ts', '/src/entity/monsters.ts']);

function arena(r = 2, nether = true) {
  const L = flatLevel(m, -r, -r, r - 1, r - 1, 64, 'brutes');
  if (nether) L.world.dim = m.DIMENSIONS.the_nether;
  L.level.difficulty = 'normal';
  return L;
}
/** a mob as a bastion's chunk brings it in (placed by the structure) or as summoned */
function mob(level, id, x, z, structure = true) {
  const d = { id, x: x + 0.5, y: 64, z: z + 0.5, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, health: m.createMob(id, level).maxHealth, fire: 0, persistent: true, data: structure ? { finalize: 'structure' } : {} };
  const e = m.loadEntity(d, level);
  level.addEntity(e);
  return e;
}
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);

// ---------------------------------------------------------------------------------------------------------------
// Registered, placed

{
  const { level } = arena();
  const made = m.createMob('piglin_brute', level);
  check('registered: summonable, a spawn egg, its name', made instanceof m.PiglinBrute && m.summonableTypes().includes('piglin_brute') &&
    !!m.ITEMS.get('piglin_brute_spawn_egg') && m.entityDisplayName('piglin_brute') === 'Piglin Brute');
  const b = mob(level, 'piglin_brute', 3, 4);
  check('as a bastion places it: a golden axe in hand, its home where it stands', b.getItemBySlot('mainhand')?.item.id === 'golden_axe' &&
    b.home && b.home.x === 3 && b.home.y === 64 && b.home.z === 4 && b.home.dim === 'the_nether');
  check('its numbers: 50 health, never a baby, 20 experience', b.health === 50 && b.maxHealth === 50 && !b.isBaby() && b.xpReward === 20);
  b.moveTo(9.5, 64, 9.5, 0, 0);
  const saved = m.saveEntity(b);
  const back = m.loadEntity(saved, level);
  check('saved and loaded: its home and axe kept, not placed as a structure\'s again (its home stays put)', back instanceof m.PiglinBrute &&
    back.home?.x === 3 && back.home?.z === 4 && back.getItemBySlot('mainhand')?.item.id === 'golden_axe' && saved.data?.finalize !== 'structure');
}

// ---------------------------------------------------------------------------------------------------------------
// Its hit

for (const [diff, want] of [['normal', 13], ['easy', 7.5], ['hard', 19.5]]) {
  const { level } = arena();
  level.difficulty = diff;
  const b = mob(level, 'piglin_brute', 0, 0);
  const p = playerAt(m, level, 2.5, 64, 0.5);
  let hurtAt = -1;
  for (let t = 0; t < 200 && hurtAt < 0; t++) {
    level.tick();
    if (p.health < 20) hurtAt = t;
  }
  check(`its hit: ${want} on ${diff} with a golden axe (the player down to ${p.health})`, hurtAt >= 0 && Math.abs(20 - p.health - want) < 0.01, `after ${hurtAt} ticks`);
}

// ---------------------------------------------------------------------------------------------------------------
// Whom it goes for

{
  // a player 11 blocks off, in gold armour, and the brute kept where it is
  const { level, sounds } = arena();
  const b = mob(level, 'piglin_brute', 0, 0);
  b.moveSpeedAttr = 0;
  const p = playerAt(m, level, 11.5, 64, 0.5);
  for (const [i, id] of ['golden_boots', 'golden_leggings', 'golden_chestplate', 'golden_helmet'].entries()) p.inventory.armor[i] = stack(id);
  ticks(level, 45);
  check('a player within 12, gold armour or not: it goes for them', b.activity === 'fight' && b.target === p, `${b.activity}`);
  check('its angry snort as it starts', sounds.some((s) => s.name === 'entity.piglin_brute.angry'));
}
{
  const { level } = arena();
  const b = mob(level, 'piglin_brute', 0, 0);
  b.moveSpeedAttr = 0;
  const p = playerAt(m, level, 13.5, 64, 0.5);
  ticks(level, 100);
  check('a player 13 off: left alone (seen, but out of its range)', b.activity === 'idle' && p.health === 20);
  p.moveTo(10.5, 64, 0.5, 0, 0);
  ticks(level, 45);
  check('... till they come within 12', b.activity === 'fight');
}
{
  const { level } = arena();
  const b = mob(level, 'piglin_brute', 0, 0);
  const p = playerAt(m, level, 3.5, 64, 0.5, { creative: true });
  ticks(level, 100);
  check('a creative player: left alone', b.activity === 'idle' && b.target !== p);
}
{
  const { level } = arena();
  const b = mob(level, 'piglin_brute', 0, 0);
  const w = mob(level, 'wither_skeleton', 8, 0, false);
  w.moveSpeedAttr = 0;
  ticks(level, 45);
  check('a wither skeleton in sight: it goes for it', b.activity === 'fight' && b.target === w);
}

// ---------------------------------------------------------------------------------------------------------------
// Home

{
  const { level } = arena(3);
  const b = mob(level, 'piglin_brute', 0, 0);
  b.moveTo(24.5, 64, 0.5, 0, 0);
  let closest = Infinity, t = 0;
  for (; t < 2400 && closest > 2.5; t++) {
    level.tick();
    closest = Math.min(closest, Math.hypot(b.x - 0.5, b.z - 0.5));
  }
  check(`home: taken 24 blocks off, it strolls back (within ${closest.toFixed(1)} after ${t} ticks)`, closest <= 2.5);
  let far = 0;
  for (let i = 0; i < 1200; i++) {
    level.tick();
    far = Math.max(far, Math.hypot(b.x - 0.5, b.z - 0.5));
  }
  check(`home: and keeps near it after (at most ${far.toFixed(1)} off in a minute)`, far < 14);
}

// ---------------------------------------------------------------------------------------------------------------
// Standing up for each other

{
  const { level } = arena();
  const b = mob(level, 'piglin_brute', 0, 0);
  const pig = mob(level, 'piglin', 3, 3);
  const z = mob(level, 'zombie', 8, -4, false);
  z.moveSpeedAttr = 0;
  ticks(level, 25);
  pig.hurt(2, 'mob', z, z);
  check('a piglin hurt: the brute near it is angry with whoever did it', b.angryTarget() === z);
  ticks(level, 45);
  check('... and goes for them', b.activity === 'fight' && b.target === z);
}
{
  const { level } = arena();
  const b = mob(level, 'piglin_brute', 0, 0);
  const pig = mob(level, 'piglin', 3, 3);
  const z = mob(level, 'zombie', 8, -4, false);
  z.moveSpeedAttr = 0;
  ticks(level, 25);
  b.hurt(2, 'mob', z, z);
  check('the brute hurt: it and the piglins near it are angry with whoever did it', b.angryTarget() === z && pig.angryTarget() === z);
}
{
  const { level } = arena();
  const b = mob(level, 'piglin_brute', 0, 0);
  const pig = mob(level, 'piglin', 2, 2);
  ticks(level, 25);
  b.hurt(2, 'mob', pig, pig);
  check('hurt by a piglin: no grudge', b.angryTarget() === null && pig.angryTarget() === null);
}

// ---------------------------------------------------------------------------------------------------------------
// Gold

{
  const { level } = arena();
  const b = mob(level, 'piglin_brute', 0, 0);
  b.moveSpeedAttr = 0;
  const ingot = new m.ItemEntity(level, stack('gold_ingot'));
  ingot.moveTo(b.x, b.y + 0.2, b.z, 0, 0);
  level.addEntity(ingot);
  ticks(level, 60);
  check('gold: it leaves a gold ingot at its feet lying', !ingot.removed && b.getItemBySlot('offhand') === null && b.activity === 'idle');
}

// ---------------------------------------------------------------------------------------------------------------
// Out of the Nether

{
  const { level, sounds } = arena(2, false);
  const b = mob(level, 'piglin_brute', 0, 0);
  ticks(level, 300);
  check('the Overworld: still a brute after fifteen seconds, shaking', !b.removed && b.isConverting());
  ticks(level, 2);
  const zp = level.entities.find((e) => e.type === 'zombified_piglin');
  check('... then a zombified piglin, its axe in hand, as persistent', b.removed && zp && zp.getItemBySlot('mainhand')?.item.id === 'golden_axe' && zp.persistenceRequired);
  check('... with the brute\'s sound for it', sounds.some((s) => s.name === 'entity.piglin_brute.converted_to_zombified'));
}

await exitWithStatus(close);

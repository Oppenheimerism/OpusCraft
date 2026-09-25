// M4c: the bogged, on a flat stone world with a ticking Level. A skeleton (a bow, 16 health) whose arrows poison for
// five seconds, drawing again after 50 ticks on hard and 70 otherwise; it burns in the sun. Shears (in the hand or a
// dispenser's) take two mushrooms off it once; its sheared state is saved. A player's kill may drop an arrow of poison
// (never more than one); swamps and mangrove swamps bring it in fours, and a trial spawner's poison skeletons are it.

import { load, check, flatLevel, place, playerAt, rightClick, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/game/spawner.ts', '/src/entity/bogged.ts', '/src/entity/arrow.ts', '/src/entity/effects.ts', '/src/game/trialSpawner.ts',
  '/src/world/blockEntity.ts', '/src/game/redstone/dispenser.ts', '/src/game/redstone/dispenseItems.ts', '/src/entity/monsters.ts',
]);
const G = 64;
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);
const count = (sounds, name) => sounds.filter((s) => s.name === name).length;
const drops = (level, id) => level.entities.filter((e) => e instanceof m.ItemEntity && !e.removed && (!id || e.stack.item.id === id));

function boggedAt(level, x, z, finalize = true) {
  const b = m.createMob('bogged', level);
  b.moveTo(x, G, z, 0, 0);
  if (finalize) b.finalizeSpawn('natural');
  level.addEntity(b);
  return b;
}
/** a stone roof over the middle of the world: shade from the sun */
function roof(level, r = 12) {
  for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) level.setBlock(x, G + 4, z, m.S('stone'), 2);
}

// ---------------------------------------------------------------------------------------------------------------
// What it is

{
  const { level } = flatLevel(m, -2, -2, 2, 2);
  const b = boggedAt(level, 0.5, 0.5);
  check('a Bogged, a kind of skeleton', b instanceof m.Bogged && b instanceof m.Skeleton && b.type === 'bogged' && m.entityDisplayName('bogged') === 'Bogged');
  check('16 health', b.maxHealth === 16 && b.health === 16);
  check('it comes with a bow', b.mainHand?.item.id === 'bow', b.mainHand?.item.id);
  check('its spawn egg', m.ITEMS.get('bogged_spawn_egg')?.creativeTab === 'spawn_eggs');
  check('its own sounds', b.ambientSound() === 'entity.bogged.ambient' && b.hurtSound() === 'entity.bogged.hurt' && b.deathSound() === 'entity.bogged.death' && b.stepSound() === 'entity.bogged.step');
}

// ---------------------------------------------------------------------------------------------------------------
// Shooting: poison, and its pace

function shots(difficulty) {
  const { level } = flatLevel(m, -2, -2, 2, 2);
  roof(level);
  level.difficulty = difficulty;
  const b = boggedAt(level, 0.5, 9.5);
  const p = playerAt(m, level, 0.5, G, 0.5);
  p.gameMode = 'survival';
  p.addEffect(new m.MobEffectInstance(m.MOB_EFFECTS.resistance, 100000, 4));
  const seen = new Set(), times = [];
  let poisonAt = -1, poisonLeft = -1;
  for (let t = 0; t < 420; t++) {
    level.tick();
    for (const e of level.entities) if (e instanceof m.Arrow && !seen.has(e)) {
      seen.add(e);
      times.push(t);
    }
    const eff = p.activeEffects.get('poison');
    if (eff && poisonAt < 0) {
      poisonAt = t;
      poisonLeft = eff.duration;
    }
  }
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  return { gaps, poisonAt, poisonLeft, b };
}
{
  const hard = shots('hard');
  check(`hard: a shot every 70 ticks (50 waiting and 20 drawing: ${hard.gaps.join(', ')})`, hard.gaps.length >= 3 && hard.gaps.every((g) => g === 70));
  check(`its arrows poison for five seconds (${hard.poisonLeft} ticks left when it took)`, hard.poisonAt >= 0 && hard.poisonLeft >= 95 && hard.poisonLeft <= 100);
  const normal = shots('normal');
  check(`normal: a shot every 90 ticks (${normal.gaps.join(', ')})`, normal.gaps.length >= 2 && normal.gaps.every((g) => g === 90));
}
{
  const { level } = flatLevel(m, -2, -2, 2, 2);
  level.dayTime = 6000;
  const b = boggedAt(level, 0.5, 0.5);
  let burning = -1;
  for (let t = 0; t < 200 && burning < 0; t++) {
    level.tick();
    if (b.onFire?.() ?? b.remainingFireTicks > 0) burning = t;
  }
  check(`it burns in the sun (alight at tick ${burning})`, burning >= 0);
}

// ---------------------------------------------------------------------------------------------------------------
// Shearing

{
  const { level, sounds } = flatLevel(m, -2, -2, 2, 2);
  roof(level);
  const b = boggedAt(level, 0.5, 2.5);
  const p = playerAt(m, level, 0.5, G, 0.5, { yaw: 0, pitch: 20, held: stack('shears') });
  p.gameMode = 'survival';
  const inter = new m.Interaction(level, p);
  rightClick(m, level, p, inter);
  const got = drops(level).map((e) => e.stack.item.id);
  check('sheared: two mushrooms, each red or brown', got.length === 2 && got.every((id) => id === 'red_mushroom' || id === 'brown_mushroom'), got.join());
  check('sheared: from the top of its head', drops(level).every((e) => e.y > b.y + 1.5), drops(level).map((e) => (e.y - b.y).toFixed(2)).join());
  check('sheared: the snip, a point of wear on the shears', b.sheared && count(sounds, 'entity.bogged.shear') === 1 && p.inventory.selectedItem?.damage === 1);
  inter.rightClickDelay = 0;
  rightClick(m, level, p, inter);
  check('sheared: only once', drops(level).length === 2 && count(sounds, 'entity.bogged.shear') === 1 && p.inventory.selectedItem?.damage === 1);
  const saved = b.saveData();
  const b2 = m.createMob('bogged', level);
  b2.loadData(saved);
  check('sheared: saved and loaded', b2.sheared === true && m.createMob('bogged', level).sheared === false);
  // in creative, the shears take no wear
  const b3 = boggedAt(level, 4.5, 2.5);
  const pc = playerAt(m, level, 4.5, G, 0.5, { yaw: 0, pitch: 20, held: stack('shears'), creative: true });
  rightClick(m, level, pc);
  check('creative: sheared, the shears unworn', b3.sheared && pc.inventory.selectedItem?.damage === 0);
  // a dispenser's shears
  const b4 = boggedAt(level, -3.5, 2.5);
  place(m, level, 'dispenser', -4, G, 1, { props: { facing: 'south', triggered: false } });
  const src = { level, x: -4, y: G, z: 1, facing: 3, be: level.world.getBlockEntity(-4, G, 1), success: true };
  const before = drops(level).length;
  const left = m.dispenseBehaviorFor(stack('shears'))(src, stack('shears'));
  check("a dispenser's shears shear it", b4.sheared && drops(level).length === before + 2 && left?.item.id === 'shears' && left.damage === 1, `${b4.sheared} ${left?.damage}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Loot

{
  let tipped = 0, most = 0, bones = 0, arrows = 0, wrongPotion = 0;
  const N = 80;
  for (let i = 0; i < N; i++) {
    const { level } = flatLevel(m, -1, -1, 1, 1, G, `bogged-loot-${i}`);
    roof(level, 4);
    const b = boggedAt(level, 0.5, 0.5, false);
    const p = playerAt(m, level, 2.5, G, 0.5);
    b.hurt(100, 'player', p);
    const t = drops(level, 'tipped_arrow');
    tipped += t.length ? 1 : 0;
    most = Math.max(most, t.reduce((n, e) => n + e.stack.count, 0));
    wrongPotion += t.filter((e) => e.stack.tag?.potion?.potion !== 'poison').length;
    bones += drops(level, 'bone').reduce((n, e) => n + e.stack.count, 0);
    arrows += drops(level, 'arrow').reduce((n, e) => n + e.stack.count, 0);
  }
  check(`a player's kill: sometimes an arrow of poison (${tipped} of ${N}), never more than one`, tipped > N * 0.25 && tipped < N * 0.75 && most === 1 && wrongPotion === 0);
  check(`and bones and arrows, 0 to 2 of each (about 1: ${(bones / N).toFixed(2)}, ${(arrows / N).toFixed(2)})`, bones / N > 0.7 && bones / N < 1.3 && arrows / N > 0.7 && arrows / N < 1.3);
  const { level } = flatLevel(m, -1, -1, 1, 1, G, 'bogged-loot-x');
  const b = boggedAt(level, 0.5, 0.5, false);
  b.hurt(100, 'generic', null);
  check("no one's kill: no arrow of poison", drops(level, 'tipped_arrow').length === 0);
}

// ---------------------------------------------------------------------------------------------------------------
// Where it comes from

{
  for (const biome of ['swamp', 'mangrove_swamp']) {
    const mon = m.biomeSettings(m.B[biome]).monster;
    const bog = mon.find((s) => s.type === 'bogged'), sk = mon.find((s) => s.type === 'skeleton');
    check(`${biome}: the bogged in fours (weight 50), fewer skeletons (70)`, bog?.weight === 50 && bog.min === 4 && bog.max === 4 && sk?.weight === 70, JSON.stringify([bog, sk]));
  }
  const plains = m.biomeSettings(m.B.plains).monster;
  check('plains: no bogged, skeletons at 100', !plains.some((s) => s.type === 'bogged') && plains.find((s) => s.type === 'skeleton')?.weight === 100);
  check('no breeze in any biome', !Object.values(m.B).some((id) => typeof id === 'number' && m.biomeSettings(id).monster.some((s) => s.type === 'breeze')));
  const { level } = flatLevel(m, -2, -2, 2, 2);
  level.difficulty = 'normal';
  roof(level, 6);
  level.setBlock(0, G, 0, m.S('trial_spawner'));
  const be = level.world.getBlockEntity(0, G, 0);
  be.normalConfig = 'trial_chamber/ranged/poison_skeleton/normal';
  let uuid = null;
  for (let i = 0; i < 40 && !uuid; i++) uuid = be.spawnMob(level);
  const mob = level.entities.find((e) => e.uuid === uuid);
  check("a trial spawner's poison skeletons are bogged", mob instanceof m.Bogged && mob.mainHand?.item.id === 'bow', uuid ? mob?.type : 'nothing spawned');
}

await exitWithStatus(close);

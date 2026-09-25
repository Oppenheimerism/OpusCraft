// M2a: the trial spawner, in a hand-made stone room. Set down by hand it has nothing to spawn until a spawn egg names
// its mob; it sees survival players within 14 blocks that it has a line of sight to (glass doesn't stop it, stone
// does; once someone is seen, the others in range join without it); its mobs come a few at a time (6 in all and 2 at
// once for one player, 8 and 3 for two), and once all are dead it throws out a reward for each player and cools down
// for 30 minutes. The ominous switch: Bad Omen turns into Trial Omen (15 minutes a level) and the spawner ominous, its
// mobs vanish, its new ones come armed, item spawners drop things on the players, the reward is the ominous one, and it
// stays ominous until its cooldown ends. Also: the vanilla configs' numbers, peaceful, mobs wandering off, and saving.

import { load, check, flatLevel, place, prop, ticks, playerAt, rightClick, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

const { m, close } = await load(['/src/world/blockEntity.ts', '/src/game/spawner.ts', '/src/game/trialSpawner.ts', '/src/entity/ominousItemSpawner.ts', '/src/entity/effects.ts', '/src/entity/monsters.ts', '/src/game/loot.ts']);
const G = 64;
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);
const state = (level) => prop(m, level, 0, G, 0, 'trial_spawner_state');
const ominous = (level) => prop(m, level, 0, G, 0, 'ominous');

/** a closed stone room round (0, G, 0): its walls R blocks out, its ceiling H up */
function room(level, R = 16, H = 7) {
  const STONE = m.S('stone');
  for (let x = -R; x <= R; x++)
    for (let z = -R; z <= R; z++) {
      level.setBlock(x, G + H, z, STONE, 2);
      if (Math.abs(x) === R || Math.abs(z) === R) for (let y = G; y < G + H; y++) level.setBlock(x, y, z, STONE, 2);
    }
}

/** turn the player to look at (x, y, z) (vanilla's yaw and pitch) */
function lookAt(p, x, y, z) {
  const dx = x - p.x, dy = y - (p.y + p.eyeHeight), dz = z - p.z;
  p.yaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90;
  p.pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
}

/** a second player in the level (level.player stays the first) */
function otherPlayer(level, x, y, z) {
  const p = new m.Player(level);
  p.moveTo(x, y, z, 0, 0);
  level.addEntity(p);
  return p;
}

/** vanilla Resistance V: the mobs can't hurt the player, so the trial can run as long as a test needs */
const shield = (p) => p.addEffect(new m.MobEffectInstance(m.MOB_EFFECTS.resistance, 1e7, 4));

/** tick until `cond` holds (at most `max` ticks): how many ticks it took, or -1 */
function until(level, cond, max) {
  for (let i = 1; i <= max; i++) {
    level.tick();
    if (cond()) return i;
  }
  return -1;
}

/** the mobs the spawner is tracking, as entities */
const tracked = (level, be) => level.entities.filter((e) => e.hasUuid && be.currentMobs.has(e.uuid));

/** kill all it's tracking */
function killAll(level, be) {
  for (const e of tracked(level, be)) e.hurt(1000, 'generic');
}

/**
 * a trial spawner at (0, G, 0) in a room, spawning `mob` (by spawn data, as a spawn egg sets it) or with vanilla's
 * named configs, and a shielded survival player at (px, G, pz) in its sight
 */
function setup({ mob = 'zombie', config = null, px = 0.5, pz = 5.5, seed = 'm2a' } = {}) {
  const s = flatLevel(m, -3, -3, 3, 3, G, seed);
  room(s.level);
  const p = playerAt(m, s.level, px, G, pz);
  shield(p);
  place(m, s.level, 'trial_spawner', 0, G, 0);
  const be = s.level.world.getBlockEntity(0, G, 0);
  if (config) {
    be.normalConfig = `${config}/normal`;
    be.ominousConfig = `${config}/ominous`;
  } else be.setEntityId(mob);
  return { ...s, p, be };
}

/** run the trial to its end: kill what it spawns as soon as `killWhen` says, until it's waiting to throw the reward */
function runTrial(level, be, { max = 4000, killWhen = () => true } = {}) {
  const spawnTimes = [];
  /** where each came out, and what it was */
  const spawned = [];
  let most = 0;
  const known = new Set(be.currentMobs);
  for (let i = 0; i < max && state(level) !== 'waiting_for_reward_ejection'; i++) {
    const before = be.totalMobsSpawned;
    level.tick();
    if (be.totalMobsSpawned > before) spawnTimes.push(level.gameTime);
    for (const e of tracked(level, be))
      if (!known.has(e.uuid)) {
        known.add(e.uuid);
        spawned.push({ e, x: e.x, y: e.y, z: e.z });
      }
    most = Math.max(most, be.currentMobs.size);
    if (killWhen(be)) killAll(level, be);
  }
  return { spawnTimes, spawned, most };
}

// ---------------------------------------------------------------------------------------------------------------
// Set down by hand, the spawn egg, and seeing players

{
  const { level, sounds, particles } = flatLevel(m, -2, -2, 2, 2, G, 'egg');
  room(level);
  const p = playerAt(m, level, 0.5, G, 4.5, { creative: true, held: 'zombie_spawn_egg' });
  place(m, level, 'trial_spawner', 0, G, 0);
  const be = level.world.getBlockEntity(0, G, 0);
  check('place: a trial spawner, inactive and not ominous, with its block entity', be instanceof m.TrialSpawnerBlockEntity && state(level) === 'inactive' && ominous(level) === false);
  ticks(level, 40);
  check('place: set down by hand it has no mob (vanilla TrialSpawnerConfig.DEFAULT has none), so it stays inactive', state(level) === 'inactive' && !be.hasMobToSpawn(level.random));
  lookAt(p, 0.5, G + 0.5, 0.5);
  rightClick(m, level, p);
  check('spawn egg: the spawner will spawn zombies (the egg kept, in creative)', be.nextSpawnData?.entity.id === 'zombie' && p.inventory.main[0]?.count === 1);
  level.tick();
  check('spawn egg: with a mob to spawn it waits for players, a zombie spinning inside', state(level) === 'waiting_for_players' && be.displayEntity instanceof m.Zombie);
  const spin0 = be.spin;
  level.tick();
  check('spawn egg: the mob inside spins (vanilla 200 / (ticks to the next mob + 200) degrees a tick while waiting)', Math.abs(be.spin - spin0 - 1) < 1e-9);
  ticks(level, 60);
  check('detect: a creative player is never seen (vanilla PlayerDetector.NO_CREATIVE_PLAYERS)', state(level) === 'waiting_for_players' && be.detectedPlayers.size === 0);
  p.gameMode = 'survival';
  shield(p);
  const n = until(level, () => state(level) === 'active', 20);
  check('detect: a survival player 4 blocks off in its sight is seen within a second, and it goes active', n > 0, `${n}`);
  check('detect: the detect_player sound, and 35 sparks (30, and 5 for each player it has)', sounds.some((s) => s.name === 'block.trial_spawner.detect_player') && particles.filter((q) => q.kind === 'trial_spawner_detection').length === 35);
  check('detect: the first mob waits 40 ticks from then (vanilla DETECT_PLAYER_SPAWN_BUFFER)', be.nextMobSpawnsAt === level.gameTime + 40, `${be.nextMobSpawnsAt - level.gameTime}`);
  // (vanilla (BlockPos.asLong + gameTime) % 20: the same tick of each second, by where it is)
  const at = [];
  for (let i = 0; i < 60; i++) {
    const before = be.detectedPlayers.size;
    be.detectedPlayers.clear();
    level.tick();
    if (be.detectedPlayers.size) at.push(level.gameTime % 20);
    if (!be.detectedPlayers.size && before) be.detectedPlayers.add(p.uuid);
  }
  check('detect: it looks once a second, always on the same tick of the second', at.length === 3 && at.every((t) => t === at[0]), JSON.stringify(at));
}

{
  // range, sight, spectators and glass
  const { level } = flatLevel(m, -3, -3, 3, 3, G, 'sight');
  room(level);
  const p = playerAt(m, level, 0.5, G, 14.5);
  shield(p);
  place(m, level, 'trial_spawner', 0, G, 0);
  const be = level.world.getBlockEntity(0, G, 0);
  be.setEntityId('zombie');
  ticks(level, 40);
  check('range: a player whose block is 14 blocks off isn\'t seen (vanilla closerThan 14)', state(level) === 'waiting_for_players');
  p.moveTo(0.5, G, 13.5, 0, 0);
  check('range: ... at 13 they are', until(level, () => state(level) === 'active', 20) > 0);
  be.detectedPlayers.clear();
  level.setBlock(0, G, 0, m.getBlock('trial_spawner').state({}), 2);
  // a wall of stone between them
  for (let x = -3; x <= 3; x++) for (let y = G; y < G + 7; y++) level.setBlock(x, y, 5, m.S('stone'), 2);
  p.moveTo(0.5, G, 8.5, 0, 0);
  ticks(level, 40);
  check('sight: behind a stone wall they aren\'t seen', state(level) === 'waiting_for_players' && be.detectedPlayers.size === 0);
  check('sight: (vanilla PlayerDetector.inLineOfSight, a VISUAL clip from the eyes to its middle)', !m.inLineOfSight(level, 0, G, 0, p.x, p.y + p.eyeHeight, p.z));
  for (let x = -3; x <= 3; x++) for (let y = G; y < G + 7; y++) level.setBlock(x, y, 5, m.S('glass'), 2);
  check('sight: glass doesn\'t block it (its visual shape is empty)', m.inLineOfSight(level, 0, G, 0, p.x, p.y + p.eyeHeight, p.z) && until(level, () => state(level) === 'active', 20) > 0);
  for (let x = -3; x <= 3; x++) for (let y = G; y < G + 7; y++) level.setBlock(x, y, 5, m.S('iron_bars'), 2);
  check('sight: nor do iron bars', m.inLineOfSight(level, 0, G, 0, p.x, p.y + p.eyeHeight, p.z));
  be.detectedPlayers.clear();
  level.setBlock(0, G, 0, m.getBlock('trial_spawner').state({}), 2);
  p.gameMode = 'spectator';
  ticks(level, 40);
  check('detect: a spectator isn\'t seen', be.detectedPlayers.size === 0 && state(level) === 'waiting_for_players');
}

// ---------------------------------------------------------------------------------------------------------------
// One player: the mobs, the reward, the cooldown

{
  const { level, sounds, p, be } = setup({ seed: 'one' });
  until(level, () => state(level) === 'active', 60);
  // let it spawn without killing anything for a while
  const first = runTrial(level, be, { max: 400, killWhen: () => false });
  check('one player: at most 2 of its mobs at once (vanilla DEFAULT: simultaneous_mobs 2)', first.most === 2 && tracked(level, be).length === 2, `${first.most}`);
  check('one player: the second comes 40 ticks after the first (ticks_between_spawn 40)', first.spawnTimes.length === 2 && first.spawnTimes[1] - first.spawnTimes[0] === 40, JSON.stringify(first.spawnTimes));
  const mobs = tracked(level, be);
  check('one player: zombies, each come out within its spawn range (4) and a block of its height', first.spawned.length === 2 && first.spawned.every(({ e, x, y, z }) => e instanceof m.Zombie && Math.abs(x - 0.5) <= 4 && Math.abs(z - 0.5) <= 4 && (y === G || y === G + 1)), JSON.stringify(first.spawned.map(({ x, y, z }) => [x, y, z])));
  check('one player: kept (persistenceRequired), and the spawn_mob sound for each', mobs.every((e) => e.persistenceRequired) && sounds.filter((s) => s.name === 'block.trial_spawner.spawn_mob').length === 2);
  // kill one: the next comes ticks_between_spawn after the kill
  mobs[0].hurt(1000, 'generic');
  const killedAt = level.gameTime;
  const n = until(level, () => be.totalMobsSpawned === 3, 200);
  check('one player: a kill lets the next come, 40 ticks on (vanilla: an untracked mob resets next_mob_spawns_at)', level.gameTime - killedAt === 41 || level.gameTime - killedAt === 40, `${level.gameTime - killedAt} ${n}`);
  const rest = runTrial(level, be);
  check('one player: 6 in all (vanilla DEFAULT: total_mobs 6)', 3 + rest.spawnTimes.length === 6, `${3 + rest.spawnTimes.length}`);
  check('one player: all dead, it waits to throw the reward, its cooldown set 30 minutes on', state(level) === 'waiting_for_reward_ejection' && be.cooldownEndsAt === level.gameTime + 36000);
  const done = level.gameTime;
  // (what the zombies dropped out of the way)
  for (const e of level.entities) if (e.type === 'item') e.remove();
  until(level, () => state(level) === 'ejecting_reward', 100);
  check('reward: 40 ticks after the last died the shutter opens', level.gameTime - done === 40 && sounds.some((s) => s.name === 'block.trial_spawner.open_shutter'));
  until(level, () => state(level) === 'cooldown', 200);
  const items = level.entities.filter((e) => e.type === 'item');
  const ejected = sounds.filter((s) => s.name === 'block.trial_spawner.eject_item').length;
  check('reward: one reward for the one player, thrown up out of its top', ejected === 1 && items.length > 0 && items.every((e) => Math.abs(e.x - 0.5) < 1.5 && Math.abs(e.z - 0.5) < 1.5 && e.y > G + 0.5), JSON.stringify(items.map((e) => [e.x.toFixed(2), e.y.toFixed(2), e.z.toFixed(2)])));
  const got = items.map((e) => e.stack.item.id);
  const consumables = ['cooked_chicken', 'bread', 'baked_potato', 'potion'];
  check('reward: a trial key or its consumables (vanilla spawners/trial_chamber/key or /consumables)', got.length > 0 && (got.every((id) => id === 'trial_key') || got.every((id) => consumables.includes(id))), got.join(','));
  check('reward: then the shutter closes and it cools down', sounds.some((s) => s.name === 'block.trial_spawner.close_shutter') && state(level) === 'cooldown');
  ticks(level, 100);
  check('cooldown: the player standing by doesn\'t start it again', state(level) === 'cooldown' && be.detectedPlayers.size === 0);
  // (the zombies may have shoved them about: back where they stood)
  p.moveTo(0.5, G, 5.5, 0, 0);
  level.gameTime = be.cooldownEndsAt - 2;
  level.tick();
  check('cooldown: still cooling a tick before the 30 minutes are up', state(level) === 'cooldown');
  const seen = [];
  for (let i = 0; i < 25; i++) {
    level.tick();
    seen.push(state(level));
  }
  check('cooldown: at 30 minutes it waits for players again, and seeing the one still here starts a new trial', seen[0] === 'waiting_for_players' && seen.at(-1) === 'active', seen.join(','));
  check('cooldown: the new trial starts from nothing', be.totalMobsSpawned === 0 && be.currentMobs.size === 0 && be.detectedPlayers.size === 1);
  void p;
}

// ---------------------------------------------------------------------------------------------------------------
// Two players: more mobs, more at once, a reward each

{
  const { level, sounds, p, be } = setup({ seed: 'two' });
  // the second behind a wall: not seen on their own, but they join once the first is (vanilla: once there's someone, the
  // rest in range join without sight)
  for (let x = -3; x <= 3; x++) for (let y = G; y < G + 7; y++) level.setBlock(x, y, -4, m.S('stone'), 2);
  const q = otherPlayer(level, 0.5, G, -7.5);
  shield(q);
  check('two players: the one behind the wall can\'t be seen', !m.inLineOfSight(level, 0, G, 0, q.x, q.y + q.eyeHeight, q.z));
  until(level, () => state(level) === 'active', 60);
  check('two players: first it sees the one in sight', be.detectedPlayers.size === 1 && be.detectedPlayers.has(p.uuid));
  check('two players: a second later the other joins, in range but out of sight', until(level, () => be.detectedPlayers.size === 2, 20) > 0 && be.detectedPlayers.has(q.uuid));
  const r = runTrial(level, be, { killWhen: (b) => b.currentMobs.size >= 3 || b.totalMobsSpawned >= 8 });
  check('two players: 3 at once (2 + 1 more for the extra player)', r.most === 3, `${r.most}`);
  check('two players: 8 in all (6 + 2 more for the extra player)', r.spawnTimes.length === 8, `${r.spawnTimes.length}`);
  check('two players: the targets (vanilla calculateTargetTotalMobs / calculateTargetSimultaneousMobs)', m.targetTotalMobs(be.config, 1) === 8 && m.targetSimultaneousMobs(be.config, 1) === 3);
  const t = level.gameTime;
  for (const e of level.entities) if (e.type === 'item') e.remove();
  until(level, () => state(level) === 'cooldown', 300);
  const ejects = sounds.filter((s) => s.name === 'block.trial_spawner.eject_item').map((s) => s.t);
  // (vanilla isReadyToEjectItems: when the time since the trial ended is a multiple of 30, so 60 and 90 ticks on)
  check('two players: a reward each, 30 ticks apart, then it cools down', ejects.length === 2 && ejects[0] - t === 60 && ejects[1] - t === 90, JSON.stringify(ejects.map((x) => x - t)));
  check('two players: one table for the trial (both rewards from the same one)', be.ejectingLootTable === null);
}

// ---------------------------------------------------------------------------------------------------------------
// The vanilla configs

{
  const C = m.TRIAL_SPAWNER_CONFIGS;
  const nums = (c) => [c.totalMobs, c.simultaneousMobs, c.totalMobsAddedPerPlayer, c.simultaneousMobsAddedPerPlayer, c.ticksBetweenSpawn].join(' ');
  check('configs: melee zombie: 6 in all, 3 at once, +2 and +0.5 a player, a second apart', nums(C['trial_chamber/melee/zombie/normal']) === '6 3 2 0.5 20');
  check('configs: its ominous one arms them (equipment/trial_chamber_melee)', C['trial_chamber/melee/zombie/ominous'].spawnPotentials[0][0].equipment === 'equipment/trial_chamber_melee');
  check('configs: ominous spiders: 12 in all, 4 at once', nums(C['trial_chamber/melee/spider/ominous']) === '12 4 2 0.5 20');
  check('configs: slow ranged skeletons: 4 at once, +2 a player, 8 seconds apart', nums(C['trial_chamber/slow_ranged/skeleton/normal']) === '6 4 2 2 160');
  check('configs: breezes: 2 in all, 1 at once, +1 and +0.5 a player (ominous 4 and 2)', nums(C['trial_chamber/breeze/normal']) === '2 1 1 0.5 20' && nums(C['trial_chamber/breeze/ominous']) === '4 2 1 0.5 20');
  check('configs: poison skeletons are the bogged', C['trial_chamber/ranged/poison_skeleton/normal'].spawnPotentials[0][0].entity.id === 'bogged');
  check('configs: baby zombies are babies; slimes size 2 three times in four, else 3', C['trial_chamber/small_melee/baby_zombie/normal'].spawnPotentials[0][0].entity.baby === true && C['trial_chamber/small_melee/slime/normal'].spawnPotentials.map(([d, w]) => `${d.entity.size}:${w}`).join(' ') === '2:3 3:1');
  check('configs: the normal rewards are the key or the consumables, even odds', JSON.stringify(C['trial_chamber/melee/husk/normal'].lootTablesToEject) === JSON.stringify([['spawners/trial_chamber/consumables', 1], ['spawners/trial_chamber/key', 1]]));
  check('configs: the ominous ones 3 in 10 the ominous key, else its consumables', JSON.stringify(C['trial_chamber/melee/husk/ominous'].lootTablesToEject) === JSON.stringify([['spawners/ominous/trial_chamber/key', 3], ['spawners/ominous/trial_chamber/consumables', 7]]));
  const slowSkel = C['trial_chamber/slow_ranged/skeleton/normal'];
  check('configs: with 3 players, slow ranged skeletons: 10 in all, 8 at once', m.targetTotalMobs(slowSkel, 2) === 10 && m.targetSimultaneousMobs(slowSkel, 2) === 8);
  const zombie = C['trial_chamber/melee/zombie/normal'];
  check('configs: melee zombies with 2 players: still 3 at once (3.5 rounded down), 8 in all', m.targetSimultaneousMobs(zombie, 1) === 3 && m.targetTotalMobs(zombie, 1) === 8);
  // a named config's spawner picks its mob by itself
  const { level, be } = setup({ config: 'trial_chamber/small_melee/slime', seed: 'slime' });
  level.tick();
  check('configs: a slime spawner shows a slime inside', state(level) !== 'inactive' && be.displayEntity instanceof m.Slime && [2, 3].includes(be.displayEntity.size));
  const r = runTrial(level, be, { max: 2000 });
  check('configs: and spawns slimes of size 2 or 3', r.spawnTimes.length === 6);
}

{
  // a baby zombie spawner's mobs are babies
  const { level, be } = setup({ config: 'trial_chamber/small_melee/baby_zombie', seed: 'baby' });
  until(level, () => be.totalMobsSpawned >= 1, 400);
  const z = tracked(level, be)[0];
  check('configs: baby zombies come out babies', z instanceof m.Zombie && z.isBaby() === true);
}

// ---------------------------------------------------------------------------------------------------------------
// Peaceful, mobs wandering off, saving

{
  const { level, be } = setup({ seed: 'peace' });
  until(level, () => be.totalMobsSpawned >= 1, 400);
  level.difficulty = 'peaceful';
  level.tick();
  check('peaceful: an active spawner goes back to waiting, its trial forgotten (vanilla canSpawnInLevel)', state(level) === 'waiting_for_players' && be.detectedPlayers.size === 0 && be.totalMobsSpawned === 0);
  ticks(level, 40);
  check('peaceful: and doesn\'t see anyone', state(level) === 'waiting_for_players' && be.detectedPlayers.size === 0);
  level.difficulty = 'normal';
  level.gameRules.doMobSpawning = false;
  ticks(level, 40);
  check('doMobSpawning off: the same', state(level) === 'waiting_for_players' && be.detectedPlayers.size === 0);
  level.gameRules.doMobSpawning = true;
  check('back on: it starts', until(level, () => state(level) === 'active', 40) > 0);
}

{
  const { level, be } = setup({ seed: 'wander' });
  until(level, () => be.totalMobsSpawned >= 1, 400);
  const z = tracked(level, be)[0];
  z.moveTo(0.5, G, 47.5, 0, 0);
  level.tick();
  check('tracking: a mob 47 blocks off still counts', be.currentMobs.has(z.uuid));
  z.moveTo(0.5, G, 48.5, 0, 0);
  level.tick();
  check('tracking: at 48 it no longer does (vanilla MAX_MOB_TRACKING_DISTANCE), and the next waits 40 ticks', !be.currentMobs.has(z.uuid) && be.nextMobSpawnsAt >= level.gameTime + 39);
}

{
  const { level, be, p } = setup({ config: 'trial_chamber/melee/husk', seed: 'save' });
  until(level, () => be.totalMobsSpawned >= 2, 400);
  const saved = JSON.parse(JSON.stringify(be.save()));
  const b2 = m.loadBlockEntity(saved);
  check('save: the configs, its players, its mobs and its count come back', b2.normalConfig === 'trial_chamber/melee/husk/normal' && b2.ominousConfig === 'trial_chamber/melee/husk/ominous' && b2.detectedPlayers.has(p.uuid) && b2.currentMobs.size === be.currentMobs.size && b2.totalMobsSpawned === be.totalMobsSpawned && b2.nextMobSpawnsAt === be.nextMobSpawnsAt && b2.nextSpawnData?.entity.id === 'husk');
  const b3 = m.loadBlockEntity({ id: 'trial_spawner', x: 0, y: 0, z: 0, items: [], data: { normal_config: 'minecraft:trial_chamber/breeze/normal', target_cooldown_length: 100, required_player_range: 20 } });
  check('save: vanilla\'s own names and the cooldown and range read in', b3.normalConfig === 'trial_chamber/breeze/normal' && b3.targetCooldownLength === 100 && b3.requiredPlayerRange === 20);
}

// ---------------------------------------------------------------------------------------------------------------
// Ominous

{
  // Bad Omen II walking up to a waiting spawner
  const { level, sounds, particles, p, be } = setup({ config: 'trial_chamber/melee/zombie', seed: 'omen' });
  p.addEffect(new m.MobEffectInstance(m.MOB_EFFECTS.bad_omen, 120000, 1));
  level.tick();
  check('omen: before it sees them, not ominous', ominous(level) === false);
  until(level, () => state(level) === 'active', 40);
  check('omen: seen with Bad Omen II, it turns ominous and goes active', ominous(level) === true && state(level) === 'active' && be.isOminous);
  const omen = p.getEffect('trial_omen');
  check('omen: their Bad Omen becomes Trial Omen, 15 minutes a level: 30 minutes', !p.hasEffect('bad_omen') && omen && omen.duration >= 36000 - 2 && omen.amplifier === 0, `${omen?.duration}`);
  check('omen: the omen sound, and the ominous_activate at them (quiet) and at the spawner', sounds.some((s) => s.name === 'event.mob_effect.trial_omen') && sounds.filter((s) => s.name === 'block.trial_spawner.ominous_activate').map((s) => s.volume).sort().join(',') === '0.3,1');
  check('omen: trial omen swirls and blue flames round it', particles.some((q) => q.kind === 'trial_omen') && particles.some((q) => q.kind === 'soul_fire_flame'));
  check('omen: no detect_player sound for the switch itself', !sounds.some((s) => s.name === 'block.trial_spawner.detect_player'));
  check('omen: its config is the ominous one now', be.config === m.TRIAL_SPAWNER_CONFIGS['trial_chamber/melee/zombie/ominous']);
  until(level, () => be.totalMobsSpawned >= 1, 200);
  const z = tracked(level, be)[0];
  const main = z?.getItemBySlot('mainhand');
  check('ominous: its zombies come armed from equipment/trial_chamber_melee (a sword), none of it to drop', z instanceof m.Zombie && main && /sword/.test(main.item.id) && ['mainhand', 'head', 'chest'].every((s) => !z.getItemBySlot(s) || z.equipmentDropChance(s) === 0), main?.item.id);
  check('ominous: blue flames when it spawns', particles.filter((q) => q.kind === 'soul_fire_flame').length > 40);
  // the item spawners, every 8 seconds (the trial kept going: nothing killed)
  const spawners = [];
  const held = [];
  for (let i = 0; i < 600; i++) {
    // (they stand their ground: the zombies' knockback would carry them out of its range)
    p.moveTo(0.5, G, 5.5, p.yaw, p.pitch);
    level.tick();
    for (const e of level.entities)
      if (e instanceof m.OminousItemSpawner && !spawners.includes(e)) {
        spawners.push(e);
        held.push(e.item?.item.id);
      }
  }
  const begins = sounds.filter((s) => s.name === 'block.trial_spawner.spawn_item_begin').map((s) => s.t);
  check('item spawners: one every 8 seconds (vanilla ticks_between_item_spawners 160)', begins.length >= 3 && begins.slice(1).every((t, i) => t - begins[i] === 160), JSON.stringify(begins));
  check('item spawners: each over the player or one of its mobs, 2 to 5 blocks over its head (under the ceiling)', spawners.length >= 3 && spawners.every((e) => e.y > G + 1 && e.y < G + 7));
  check('item spawners: all hold the same thing (rolled once for the spot)', held.length >= 3 && held.every((id) => id && id === held[0]), held.join(','));
  check('item spawners: they let go of it (the spawn_item sound) 3 to 6 seconds on', sounds.some((s) => s.name === 'block.trial_spawner.spawn_item') && sounds.some((s) => s.name === 'block.trial_spawner.about_to_spawn_item'));
  check('item spawners: blue sparks drawn in', particles.some((q) => q.kind === 'ominous_spawning'));
  // the drops are the same for any spawner in the same 30x20x30 region
  const b2 = new m.TrialSpawnerBlockEntity(1, G, 1);
  b2.ominousConfig = be.ominousConfig;
  b2.isOminous = true;
  const d1 = be.getDispensingItems(level).map(([s, w]) => `${s.item.id}:${w}`).join(), d2 = b2.getDispensingItems(level).map(([s, w]) => `${s.item.id}:${w}`).join();
  check('item spawners: two spawners in the same spot of the world drop the same', d1 === d2 && d1.length > 0, `${d1} / ${d2}`);
  // its trial out, the ominous reward and the cooldown
  runTrial(level, be);
  for (const e of level.entities) if (e.type === 'item') e.remove();
  until(level, () => state(level) === 'cooldown', 300);
  const ok = level.entities.filter((e) => e.type === 'item' && Math.abs(e.x - 0.5) < 1.5 && Math.abs(e.z - 0.5) < 1.5).map((e) => e.stack.item.id);
  const omConsumables = ['cooked_beef', 'baked_potato', 'golden_carrot', 'potion'];
  check('ominous: its reward is the ominous one (an ominous trial key, or its consumables)', ok.some((id) => id === 'ominous_trial_key' || omConsumables.includes(id)), ok.join(','));
  check('ominous: it stays ominous through its cooldown', ominous(level) === true && state(level) === 'cooldown');
  ticks(level, 60);
  check('ominous: Trial Omen doesn\'t start an ominous one cooling down again', state(level) === 'cooldown');
  level.gameTime = be.cooldownEndsAt - 1;
  p.removeEffect('trial_omen');
  ticks(level, 2);
  check('ominous: at the end of its cooldown it\'s a normal spawner again', ominous(level) === false && state(level) === 'waiting_for_players');
}

{
  // Trial Omen while it's mid-trial: its mobs vanish, the ominous trial starts over
  const { level, sounds, p, be } = setup({ config: 'trial_chamber/melee/zombie', seed: 'mid' });
  until(level, () => be.totalMobsSpawned >= 2, 400);
  const before = tracked(level, be);
  p.addEffect(new m.MobEffectInstance(m.MOB_EFFECTS.trial_omen, 12000, 0));
  until(level, () => ominous(level) === true, 25);
  check('mid-trial omen: it turns ominous', ominous(level) === true && state(level) === 'active');
  check('mid-trial omen: its mobs vanish (in a puff) and its count starts over', before.length === 2 && before.every((e) => e.removed) && be.currentMobs.size === 0 && be.totalMobsSpawned === 0);
  check('mid-trial omen: Trial Omen stays as it was (no sound for it)', p.getEffect('trial_omen').duration <= 12000 && !sounds.some((s) => s.name === 'event.mob_effect.trial_omen'));
}

{
  // Bad Omen at a normal spawner cooling down: it wakes up ominous
  const { level, p, be } = setup({ seed: 'cool' });
  until(level, () => state(level) === 'active', 40);
  runTrial(level, be);
  until(level, () => state(level) === 'cooldown', 300);
  ticks(level, 40);
  check('cooldown omen: cooling down, no one starts it', state(level) === 'cooldown');
  p.addEffect(new m.MobEffectInstance(m.MOB_EFFECTS.bad_omen, 120000, 2));
  until(level, () => state(level) !== 'cooldown', 25);
  check('cooldown omen: Bad Omen III wakes it up ominous, straight into a trial', ominous(level) === true && state(level) === 'active' && be.detectedPlayers.has(p.uuid));
  check('cooldown omen: 45 minutes of Trial Omen', p.getEffect('trial_omen')?.duration >= 54000 - 2);
}

{
  // the unit pieces: omen conversion keeps what's there, equipment tables
  const { level, p } = setup({ seed: 'unit' });
  p.addEffect(new m.MobEffectInstance(m.MOB_EFFECTS.trial_omen, 500, 0));
  p.addEffect(new m.MobEffectInstance(m.MOB_EFFECTS.bad_omen, 6000, 0));
  m.transformBadOmenIntoTrialOmen(p);
  check('omen: Bad Omen I over a short Trial Omen: 15 minutes of it', p.getEffect('trial_omen')?.duration === 18000 && !p.hasEffect('bad_omen'));
  const z = m.createMob('skeleton', level);
  z.moveTo(0.5, G, 0.5, 0, 0);
  m.equipFromTable(z, 'equipment/trial_chamber_ranged', new m.Rand(5));
  const bow = z.getItemBySlot('mainhand');
  check('equipment: a ranged mob gets a bow, not to drop', bow?.item.id === 'bow' && z.equipmentDropChance('mainhand') === 0);
  let armour = 0;
  for (let i = 0; i < 200; i++) {
    const w = m.createMob('zombie', level);
    m.equipFromTable(w, 'equipment/trial_chamber_melee', new m.Rand(100 + i));
    if (w.getItemBySlot('head') || w.getItemBySlot('chest')) armour++;
  }
  check('equipment: about 3 in 4 get some armour (a helmet half the time, a chestplate half the time)', armour > 120 && armour < 180, `${armour}`);
}

exitWithStatus(close);

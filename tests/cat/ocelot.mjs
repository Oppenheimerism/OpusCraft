// Headless checks for ocelots (node tests/cat/ocelot.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 400000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/entity/ocelot.ts', '/src/world/gen/biomes.ts',
  '/src/audio/synth.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, O, biomes, synth] = mods;
const { ItemStack } = itemMod;
const { S } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

function makeLevel({ biome = 'jungle', dayTime = 6000 } = {}) {
  const world = new worldMod.World();
  for (let cx = -5; cx <= 5; cx++) for (let cz = -5; cz <= 5; cz++) {
    const c = new chunkMod.Chunk(cx, cz);
    c.biomes.fill(biomes.BIOME_ID[biome]);
    world.chunks.set(c.key, c);
  }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  level.sound = { play: (n) => sounds.push(n), playUI() {} };
  const parts = [];
  level.particles = { spawn: (n) => parts.push(n), blockBreak() {}, spell() {}, poof() {}, entityEffect() {}, blockParticle() {} };
  const st = S('stone'), gs = S('grass_block');
  for (let x = -80; x <= 80; x++) for (let z = -80; z <= 80; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 55; y <= 62; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, gs);
    c.heightmap[((z & 15) << 4) | (x & 15)] = 64;
  }
  level.dayTime = dayTime;
  level.difficulty = 'normal';
  return { world, level, sounds, parts };
}
const mobAt = (level, type, x, y, z) => { const m = spawner.createMob(type, level); m.moveTo(x + 0.5, y, z + 0.5, 0, 0); m.finalizeSpawn('egg'); level.addEntity(m); return m; };
function playerAt(level, x, y, z, mode = 'survival') {
  const p = new playerMod.Player(level);
  p.gameMode = mode;
  p.moveTo(x + 0.5, y, z + 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  return p;
}
const hold = (p, id, n = 64) => p.inventory.setSelectedItem(id ? ItemStack.of(id, n) : null);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const settle = (level, n = 20) => { for (let i = 0; i < n; i++) level.tick(); };

// --- registered
{
  check('registered, with a spawn egg and a name', !!spawner.MOB_TYPES.ocelot && !!itemMod.ITEMS.get('ocelot_spawn_egg') && spawner.entityDisplayName('ocelot') === 'Ocelot');
  const { level } = makeLevel();
  const o = mobAt(level, 'ocelot', 0, 64, 0);
  check('0.6 x 0.7, 10 health, speed 0.3, claws for 3, a creature', o instanceof O.Ocelot && Math.abs(o.width - 0.6) < 1e-6 && Math.abs(o.height - 0.7) < 1e-6 && o.maxHealth === 10 && o.moveSpeedAttr === 0.3 && o.attackDamage === 3 && o.category === 'creature');
  const peak = (n, v = 0) => { const a = synth.SOUNDS[n].generate(v, 22050); let m = 0; for (const x of a) m = Math.max(m, Math.abs(x)); return m; };
  const quiet = ['ambient', 'hurt', 'death'].map((k) => [peak('entity.ocelot.' + k), peak('entity.cat.' + k)]);
  check('its sounds are the cat\'s, quieter', quiet.every(([o, c]) => o > 0.1 && o < c * 0.6), JSON.stringify(quiet.map(([o, c]) => [o.toFixed(2), c.toFixed(2)])));
  check('meows now and then (every 45 s or so), drops nothing', o.ambientSound() === 'entity.ocelot.ambient' && o.ambientSoundInterval() === 900 && o.lootTable().length === 0 && o.hurtSound() === 'entity.ocelot.hurt' && o.deathSound() === 'entity.ocelot.death');
}

// --- where they spawn
{
  const lists = ['jungle', 'bamboo_jungle', 'sparse_jungle', 'plains', 'forest'].map((b) => {
    if (biomes.BIOME_ID[b] === undefined) return `${b}:?`;
    const { level } = makeLevel({ biome: b });
    const sp = new spawner.NaturalSpawner(level);
    const e = sp['mobsAt']('monster', 0, 64, 0).find((d) => d.type === 'ocelot');
    const c = sp['mobsAt']('creature', 0, 64, 0).find((d) => d.type === 'ocelot');
    return e ? `${b}:${e.weight}/${e.min}-${e.max}` : c ? `${b}:creature!` : `${b}:-`;
  });
  check('jungles, on the monster list (vanilla OverworldBiomes)', lists.join(' ') === 'jungle:2/1-3 bamboo_jungle:2/1-1 sparse_jungle:- plains:- forest:-', lists.join(' '));
  const { level } = makeLevel();
  const sp = new spawner.NaturalSpawner(level);
  let ok = 0;
  for (let i = 0; i < 3000; i++) if (sp['checkSpawnRules']('ocelot', 3, 64, 3)) ok++;
  check('one spawn try in three fails', Math.abs(ok / 3000 - 2 / 3) < 0.03, (ok / 3000).toFixed(3));
  const at = (x, y, z) => { const o = spawner.createMob('ocelot', level); o.moveTo(x + 0.5, y, z + 0.5, 0, 0); return o.checkSpawnObstruction(); };
  level.world.setState(5, 63, 5, S('stone'));
  level.world.setState(6, 63, 6, S('jungle_leaves'));
  for (let y = 58; y <= 63; y++) level.world.setState(8, y, 8, S('air'));
  level.world.setState(8, 57, 8, S('grass_block'));
  check('on grass or leaves, at sea level or above', at(0, 64, 0) && at(6, 64, 6) && !at(5, 64, 5) && !at(8, 58, 8));
  const group = {};
  const kin = [0, 1, 2].map((i) => { const o = spawner.createMob('ocelot', level); o.moveTo(i + 0.5, 64, 0.5, 0, 0); o.finalizeSpawn('natural', group); return o; });
  check('a group is one grown ocelot and its kittens', !kin[0].isBaby() && kin[1].isBaby() && kin[2].isBaby());
  const lone = mobAt(level, 'ocelot', 9, 64, 9);
  check('one from an egg is grown', !lone.isBaby());
}

// --- wild: it runs from players, but a still one with fish draws it in
{
  const { level } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  const o = mobAt(level, 'ocelot', 6, 64, 0);
  let sprinted = false;
  for (let t = 0; t < 120; t++) { level.tick(); if (o.sprinting) sprinted = true; }
  check('it runs from a player, sprinting while near', dist(o, p) > 9 && sprinted, dist(o, p).toFixed(1));
  const { level: l2 } = makeLevel();
  playerAt(l2, 0, 64, 0, 'creative');
  const o2 = mobAt(l2, 'ocelot', 6, 64, 0);
  let fled = false;
  for (let t = 0; t < 120; t++) { l2.tick(); if (o2.sprinting || o2.goalSelector.running().some((g) => g.constructor.name === 'OcelotAvoidPlayersGoal')) fled = true; }
  check('but not from one in creative', !fled);
  const { level: l3 } = makeLevel();
  const p3 = playerAt(l3, 0, 64, 0, 'creative');
  hold(p3, 'salmon', 5);
  const o3 = mobAt(l3, 'ocelot', 8, 64, 0);
  let crouched = false;
  for (let t = 0; t < 200; t++) { l3.tick(); if (o3.crouching) crouched = true; }
  check('a player holding fish draws it in, creeping', dist(o3, p3) < 3.5 && crouched, dist(o3, p3).toFixed(1));
}

// --- trust: only one you've drawn in, from close by, one fish in three
{
  const { level, parts } = makeLevel();
  const p = playerAt(level, 0, 64, 0);
  hold(p, 'cod', 64);
  // not drawn in (its tempting isn't running): the fish is just food
  const shy = mobAt(level, 'ocelot', 2, 64, 0);
  // (goals are made on the first tick)
  shy['ensureGoals']();
  shy.interact(p, p.inventory.selectedItem);
  check('fish held out to one that isn\'t coming to you: no trust, it just falls in love', !shy.trusting && shy.isInLove());
  let won = 0, n = 0, far = 0;
  for (let i = 0; i < 600; i++) {
    const o = mobAt(level, 'ocelot', 2, 64, 0);
    o['ensureGoals']();
    o.temptGoal.isRunning = true;
    hold(p, 'cod', 64);
    o.interact(p, p.inventory.selectedItem);
    n++;
    if (o.trusting) won++;
    o.remove();
    const f = mobAt(level, 'ocelot', 5, 64, 0);
    f['ensureGoals']();
    f.temptGoal.isRunning = true;
    f.interact(p, p.inventory.selectedItem);
    if (f.trusting) far++;
    f.remove();
  }
  check('one fish in three wins its trust', Math.abs(won / n - 1 / 3) < 0.05, (won / n).toFixed(3));
  check('not from further than 3 blocks', far === 0);
  check('hearts when it does, smoke when it doesn\'t', parts.includes('heart') && parts.includes('smoke'));
  const t = mobAt(level, 'ocelot', 2, 64, 0);
  t.trusting = true;
  const d = spawner.loadEntity(t.save(), level);
  check('saved and loaded, it still trusts you', d.trusting === true);
  check('one that trusts you stays; one that doesn\'t wanders off after two minutes', (() => { const w = mobAt(level, 'ocelot', 3, 64, 3); w.tickCount = 2401; t.tickCount = 2401; return w.removeWhenFarAway() && !t.removeWhenFarAway(); })());
  // a trusting one: no running, no fright
  const { level: l2 } = makeLevel();
  const p2 = playerAt(l2, 0, 64, 0);
  const o = mobAt(l2, 'ocelot', 6, 64, 0);
  o.trusting = true;
  let ran = false;
  for (let tk = 0; tk < 120; tk++) { l2.tick(); if (o.sprinting) ran = true; }
  check('one that trusts you doesn\'t run', !ran && dist(o, p2) < 12, dist(o, p2).toFixed(1));
  hold(p2, 'cod', 5);
  o.moveTo(4.5, 64, 0.5, 0, 0);
  settle(l2, 10);
  let stays = true;
  for (let tk = 0; tk < 60; tk++) { p2.yaw += 12; l2.tick(); if (tk > 10 && !o.temptGoal.isRunning) stays = false; }
  check('and isn\'t put off when you turn about', stays);
}

// --- a hunter; a cat among creepers; no falls
{
  const { level } = makeLevel();
  playerAt(level, -40, 64, -40, 'creative');
  const o = mobAt(level, 'ocelot', 0, 64, 0);
  const ch = mobAt(level, 'chicken', 6, 64, 0);
  let hunting = false, clawed = false;
  for (let t = 0; t < 400 && !clawed; t++) { level.tick(); if (o.target === ch) hunting = true; if (ch.health < ch.maxHealth || !ch.isAlive) clawed = true; }
  check('it hunts chickens', hunting && clawed);
  const { level: l2 } = makeLevel({ dayTime: 18000 });
  playerAt(l2, -40, 64, -40, 'creative');
  const o2 = mobAt(l2, 'ocelot', 0, 64, 0);
  o2.serverAiStep = () => {};
  const cr = mobAt(l2, 'creeper', 3, 64, 0);
  let fled = 0;
  for (let t = 0; t < 80; t++) { l2.tick(); fled = Math.max(fled, dist(cr, o2)); }
  check('creepers keep away from it', fled > 6, fled.toFixed(1));
  const f = mobAt(l2, 'ocelot', 10, 90, 10);
  settle(l2, 60);
  check('it lands from 26 blocks unhurt', f.onGround && f.health === 10);
  const a = mobAt(l2, 'ocelot', 20, 64, 0), b = mobAt(l2, 'ocelot', 21, 64, 0);
  a.setInLove(null);
  b.setInLove(null);
  let kit = null;
  for (let t = 0; t < 300 && !kit; t++) { l2.tick(); kit = l2.entities.find((e) => e.type === 'ocelot' && e.isBaby()) ?? null; }
  check('two in love have a kitten, which doesn\'t trust you', !!kit && !kit.trusting);
}

console.log(fails ? `${fails} FAILED` : 'all passed');
await close();
process.exit(fails ? 1 : 0);

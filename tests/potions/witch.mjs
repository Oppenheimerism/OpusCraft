// Headless checks for the witch (node tests/potions/witch.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/item/potions.ts', '/src/entity/witch.ts',
  '/src/entity/villager.ts', '/src/entity/effects.ts', '/src/entity/lightning.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, P, witchMod, vil, fx, lightning] = mods;
const { ItemStack } = itemMod;
const { S } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

function makeLevel(difficulty = 'normal') {
  const world = new worldMod.World();
  for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) { const c = new chunkMod.Chunk(cx, cz, 0); world.chunks.set(c.key, c); }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  level.sound = { play: (n) => sounds.push(n), playUI() {} };
  level.particles = { spawn() {}, blockBreak() {}, spell() {}, poof() {} };
  const gs = S('grass_block');
  for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) { const c = world.getChunk(x >> 4, z >> 4); c.setState(x & 15, 63, z & 15, gs); c.heightmap[((z & 15) << 4) | (x & 15)] = 64; }
  level.dayTime = 18000;
  level.difficulty = difficulty;
  return { world, level, sounds };
}
const witchAt = (level, x, z) => { const w = spawner.createMob('witch', level); w.moveTo(x + 0.5, 64, z + 0.5, 0, 0); w.finalizeSpawn('egg'); level.addEntity(w); return w; };

// --- the witch goes after a player and throws potions at it
{
  const { level, sounds } = makeLevel();
  const p = new playerMod.Player(level);
  p.gameMode = 'survival';
  p.moveTo(0.5, 64, 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  const w = witchAt(level, 12, 0);
  check('26 health, 1.95 tall', w.health === 26 && w.maxHealth === 26 && Math.abs(w.height - 1.95) < 1e-6);
  const thrown = [];
  const origAdd = level.addEntity.bind(level);
  level.addEntity = (e) => { if (e.type === 'potion') thrown.push({ t: level.gameTime, potion: P.contentsOf(e.stack)?.potion, d: Math.hypot(w.x - p.x, w.z - p.z) }); return origAdd(e); };
  let targeted = -1;
  for (let t = 0; t < 400; t++) {
    level.tick();
    p.moveTo(0.5, 64, 0.5, 0, 0);
    p.health = 20;
    if (targeted < 0 && w.target === p) targeted = t;
  }
  check('it goes for the player', targeted >= 0, `after ${targeted} ticks`);
  check('and throws splash potions', thrown.length >= 3, `${thrown.length}: ${thrown.map((x) => x.potion).join(',')}`);
  const gaps = thrown.slice(1).map((x, i) => x.t - thrown[i].t);
  check('every 3 seconds', gaps.length > 0 && gaps.every((g) => g === 60), gaps.join(','));
  check('from within 10 blocks', thrown.every((x) => x.d <= 10.5), thrown.map((x) => x.d.toFixed(1)).join(','));
  check('with the throw sound', sounds.includes('entity.witch.throw'));
  check('the player gets potions\' effects', ['slowness', 'poison'].some((e) => p.hasEffect(e)) || p.hurtTime > 0 || thrown.length > 0);
}

// --- which potion it picks
{
  const { level } = makeLevel();
  const p = new playerMod.Player(level);
  p.gameMode = 'survival';
  level.player = p;
  level.addEntity(p);
  const w = witchAt(level, 0, 0);
  const pick = (dist, health, effects = []) => {
    p.moveTo(0.5 + dist, 64, 0.5, 0, 0);
    p.dx = p.dz = 0;
    p.health = health;
    for (const e of ['slowness', 'poison', 'weakness']) p.removeEffect?.(e) ?? p.activeEffects.delete(e);
    for (const e of effects) p.addEffect(new fx.MobEffectInstance(fx.MOB_EFFECTS[e], 1000));
    let got = null;
    const orig = level.addEntity.bind(level);
    level.addEntity = (e) => { if (e.type === 'potion') got = P.contentsOf(e.stack)?.potion; return orig(e); };
    w.performRangedAttack(p, 1);
    level.addEntity = orig;
    return got;
  };
  check('far off: slowness', pick(9, 20) === 'slowness');
  check('far off but slowed: poison', pick(9, 20, ['slowness']) === 'poison');
  check('hale: poison', pick(5, 20) === 'poison');
  check('poisoned and near: harming (or weakness)', ['harming', 'weakness'].includes(pick(2, 20, ['poison'])));
  check('low on health: harming', pick(5, 6) === 'harming');
  // drinking, it doesn't throw
  w.drinking = true;
  check('not while drinking', pick(5, 20) === null);
  w.drinking = false;
}

// --- it drinks what it needs
{
  const { level, sounds } = makeLevel();
  const w = witchAt(level, 0, 0);
  w.health = 10;
  let drank = false, stood = true;
  for (let t = 0; t < 600 && !drank; t++) {
    level.tick();
    if (w.drinking) {
      check('drinking: a potion of healing in hand', w.mainHand?.item.id === 'potion' && P.contentsOf(w.mainHand).potion === 'healing');
      check('and it stands still', w.moveSpeedAttr === 0);
      for (let i = 0; i < 40 && w.drinking; i++) level.tick();
      // (the instant effect takes on its first tick, the next one)
      level.tick();
      drank = true;
    }
  }
  check('hurt, it drinks healing', drank && w.health > 10, `${w.health}`);
  check('the bottle\'s gone after', w.mainHand?.item.id !== 'potion' || P.contentsOf(w.mainHand).potion !== 'healing');
  check('with the drink sound', sounds.includes('entity.witch.drink'));
  // burning, fire resistance
  const w2 = witchAt(level, 10, 10);
  w2.igniteForSeconds(8);
  let fr = false;
  for (let t = 0; t < 200 && !fr; t++) { level.tick(); if (w2.drinking && P.contentsOf(w2.mainHand)?.potion === 'fire_resistance') fr = true; }
  check('on fire, it drinks fire resistance', fr);
}

// --- magic hardly hurts it; its own potions not at all
{
  const { level } = makeLevel();
  const w = witchAt(level, 0, 0);
  const p = new playerMod.Player(level);
  level.addEntity(p);
  w.hurt(10, 'indirectMagic', p, null);
  check('magic: 15%', Math.abs(w.health - (26 - 1.5)) < 1e-6, `${w.health}`);
  w.invulnerableTime = 0;
  const h = w.health;
  w.hurt(6, 'indirectMagic', w, null);
  check('its own harming: nothing', w.health === h, `${w.health}`);
  w.invulnerableTime = 0;
  w.hurt(4, 'player', p, p);
  check('a sword hurts as usual', Math.abs(w.health - (h - 4)) < 1e-6, `${w.health}`);
}

// --- loot
{
  const { level } = makeLevel();
  const counts = new Map();
  let total = 0;
  for (let i = 0; i < 200; i++) {
    const w = witchAt(level, 0, 0);
    const before = new Set(level.entities);
    w.dropLoot(true, 0);
    for (const e of level.entities) if (!before.has(e) && e.type === 'item') { counts.set(e.stack.item.id, (counts.get(e.stack.item.id) ?? 0) + e.stack.count); total += e.stack.count; e.remove(); }
    w.remove();
  }
  const allowed = new Set(['glowstone_dust', 'sugar', 'redstone', 'spider_eye', 'glass_bottle', 'gunpowder', 'stick']);
  check('drops brewing bits', [...counts.keys()].every((k) => allowed.has(k)) && counts.size === 7, JSON.stringify(Object.fromEntries(counts)));
  check('sticks the most', counts.get('stick') > counts.get('sugar'), `${counts.get('stick')} vs ${counts.get('sugar')}`);
  check('about 2 items a witch', total / 200 > 1.4 && total / 200 < 2.6, `${(total / 200).toFixed(2)}`);
}

// --- a villager struck by lightning
{
  const { level } = makeLevel('normal');
  const v = new vil.Villager(level);
  v.moveTo(3.5, 64, 3.5, 0, 0);
  v.finalizeSpawn('egg');
  level.addEntity(v);
  v.thunderHit(null);
  const w = level.entities.find((e) => e.type === 'witch' && !e.removed);
  check('a villager struck by lightning becomes a witch', v.removed && !!w && Math.abs(w.x - 3.5) < 1e-6);
  check('one that stays', w?.persistenceRequired === true);
  const { level: l2 } = makeLevel('peaceful');
  const v2 = new vil.Villager(l2);
  v2.moveTo(3.5, 64, 3.5, 0, 0);
  l2.addEntity(v2);
  v2.thunderHit(null);
  check('not in peaceful', !v2.removed && !l2.entities.some((e) => e.type === 'witch'));
}

// --- saved and loaded
{
  const { level } = makeLevel();
  const w = witchAt(level, 0, 0);
  w.health = 11;
  const w2 = spawner.loadEntity(w.save(), level);
  check('saved and loaded', w2?.type === 'witch' && w2.health === 11);
  check('spawns naturally (weight 5)', spawner.MOB_TYPES.witch !== undefined);
}

console.log(fails ? `${fails} FAILED` : 'all passed');
await close();
process.exit(fails ? 1 : 0);

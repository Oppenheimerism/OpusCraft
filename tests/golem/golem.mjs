// Headless checks for iron golems: summoned by villagers, fights, mending, crackiness (node tests/golem/golem.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 400000).unref();
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/villager.ts', '/src/entity/player.ts', '/src/item/item.ts', '/src/entity/ironGolem.ts', '/src/entity/monsters.ts', '/src/game/spawner.ts']);
const [, levelMod, worldMod, chunkMod, blockMod, vil, playerMod, itemMod, golemMod, monsters, spawner] = mods;
const { S } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const t00 = performance.now();
const check = (name, cond, extra = '') => { extra += ` [${((performance.now() - t00) / 1000).toFixed(1)}s]`; if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
function makeLevel() {
  const world = new worldMod.World();
  for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  level.sound = { play: (n) => sounds.push(n), playUI() {} };
  level.particles = { spawn() {}, blockBreak() {} };
  // (straight into the chunks: through the world, every block of ground relights its whole column)
  const gs = S('grass_block');
  for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) { const c = world.getChunk(x >> 4, z >> 4); c.setState(x & 15, 63, z & 15, gs); c.heightmap[((z & 15) << 4) | (x & 15)] = 64; }
  level.dayTime = 1000;
  return { world, level, sounds };
}
const spawn = (level, x, z) => { const v = new vil.Villager(level); v.moveTo(x + 0.5, 64, z + 0.5, 0, 0); v.finalizeSpawn('egg'); level.addEntity(v); return v; };
const tick = (level, n) => { for (let i = 0; i < n; i++) level.tick(); };
const golems = (level) => level.entities.filter((e) => e.type === 'iron_golem' && !e.removed);

// --- five villagers that slept last night gossip up a golem
{
  const { level } = makeLevel();
  const vs = [];
  for (let i = 0; i < 5; i++) vs.push(spawn(level, i * 2 - 4, 0));
  const now = level.gameTime;
  for (const v of vs) v.mem.lastSlept = now - 100;
  check('they want a golem', vs.every((v) => v.wantsToSpawnGolem(now)));
  vs[0].spawnGolemIfNeeded(now, 5);
  const gs = golems(level);
  check('a golem is summoned', gs.length === 1);
  const g = gs[0];
  check('within 8 across', !!g && Math.abs(g.x - vs[0].x) <= 9 && Math.abs(g.z - vs[0].z) <= 9 && g.y === 64, g && `${g.x.toFixed(1)},${g.y},${g.z.toFixed(1)}`);
  check('they have all seen it', vs.every((v) => !v.wantsToSpawnGolem(now)));
  vs[1].spawnGolemIfNeeded(now, 5);
  check('no second golem while one was seen lately', golems(level).length === 1);
  check('not a player\'s golem', g && !g.playerCreated);
}

// --- too few, or none slept
{
  const { level } = makeLevel();
  const vs = [];
  for (let i = 0; i < 4; i++) vs.push(spawn(level, i * 2 - 4, 0));
  const now = level.gameTime;
  for (const v of vs) v.mem.lastSlept = now - 100;
  vs[0].spawnGolemIfNeeded(now, 5);
  check('four villagers are too few to gossip one up', golems(level).length === 0);
  vs[0].spawnGolemIfNeeded(now, 3);
  check('but enough when they panic (three)', golems(level).length === 1);
}
{
  const { level } = makeLevel();
  const vs = [];
  for (let i = 0; i < 5; i++) vs.push(spawn(level, i * 2 - 4, 0));
  const now = level.gameTime;
  for (const v of vs) v.mem.lastSlept = now - 30000;
  vs[0].spawnGolemIfNeeded(now, 5);
  check('villagers that haven\'t slept in a day don\'t call one', golems(level).length === 0);
}

// --- panicking villagers call for a golem (every 100 ticks of the panic)
{
  const { level } = makeLevel();
  const vs = [];
  for (let i = 0; i < 3; i++) vs.push(spawn(level, i * 2 - 2, 0));
  for (const v of vs) v.mem.lastSlept = level.gameTime;
  while (level.gameTime < 75) tick(level, 1);
  for (const v of vs) v.hurt(1, 'generic');
  let t = 0;
  while (!golems(level).length && level.gameTime < 101) { tick(level, 1); t++; }
  check('three villagers panicking summon a golem on the hundredth tick', golems(level).length === 1 && level.gameTime === 100, `at ${level.gameTime}; panic ${vs.map((v) => v.brain.isActive('panic')).join()}`);
}
// --- zombies go after villagers, and villagers run
{
  const { level } = makeLevel();
  level.dayTime = 18000;
  const v = spawn(level, 0, 0);
  const z = new monsters.Zombie(level);
  z.moveTo(0.5, 64, 6.5, 0, 0);
  level.addEntity(z);
  let t = 0, panicked = false;
  while (t < 200 && z.target !== v) { tick(level, 1); t++; panicked ||= v.brain.isActive('panic'); }
  check('a zombie goes after a villager', z.target === v, `after ${t} ticks`);
  check('the villager panics', panicked);
}

// --- a golem sees off a zombie, and never a creeper
{
  const { level, sounds } = makeLevel();
  level.dayTime = 18000;
  const g = new golemMod.IronGolem(level);
  g.moveTo(0.5, 64, 0.5, 0, 0);
  level.addEntity(g);
  const z = new monsters.Zombie(level);
  z.moveTo(6.5, 64, 6.5, 0, 0);
  level.addEntity(z);
  const c = new monsters.Creeper(level);
  c.moveTo(-5.5, 64, 0.5, 0, 0);
  level.addEntity(c);
  let t = 0;
  while (z.isAlive && t < 600) { tick(level, 5); t += 5; }
  check('kills the zombie', !z.isAlive, `after ${t} ticks`);
  check('swung at it with the attack sound', sounds.includes('entity.iron_golem.attack'));
  tick(level, 200);
  check('leaves the creeper alone', c.isAlive && g.target !== c, `target ${g.target?.type}`);
}

// --- mending, crackiness, no fall damage
{
  const { level, sounds } = makeLevel();
  const g = new golemMod.IronGolem(level);
  g.moveTo(0.5, 64, 0.5, 0, 0);
  level.addEntity(g);
  check('100 health, iron-heavy', g.maxHealth === 100 && g.knockbackResistance() === 1 && g.attackDamage === 15);
  check('uncracked at full health', g.crackiness() === 'none');
  g.health = 70;
  check('low cracks under 75%', g.crackiness() === 'low');
  g.health = 45;
  check('medium under 50%', g.crackiness() === 'medium');
  g.health = 20;
  check('high under 25%', g.crackiness() === 'high');
  const p = new playerMod.Player(level);
  p.gameMode = 'survival';
  p.inventory.setSelectedItem(ItemStack.of('iron_ingot', 2));
  check('an ingot mends 25', g.interact(p, p.inventory.selectedItem) && g.health === 45 && p.inventory.selectedItem.count === 1);
  check('with the repair sound', sounds.includes('entity.iron_golem.repair'));
  g.health = 100;
  check('nothing to mend: the ingot isn\'t used', !g.interact(p, p.inventory.selectedItem) && p.inventory.selectedItem.count === 1);
  g.moveTo(0.5, 90, 0.5, 0, 0);
  let t = 0;
  while (!g.onGround && t < 200) { tick(level, 1); t++; }
  check('a 26-block fall doesn\'t hurt it', g.health === 100 && g.onGround, `${g.health}`);
  // a hit that cracks it further plays the damage sound
  sounds.length = 0;
  g.hurt(30, 'generic');
  check('breaking up plays the crack', sounds.includes('entity.iron_golem.damage'));
}

// --- a player-made golem never turns on players
{
  const { level } = makeLevel();
  const g = new golemMod.IronGolem(level);
  g.playerCreated = true;
  const p = new playerMod.Player(level);
  p.gameMode = 'survival';
  check('player-made golem can\'t attack players', !g.canAttack(p));
  const g2 = new golemMod.IronGolem(level);
  check('a village golem can', g2.canAttack(p));
}

// --- save and load
{
  const { level } = makeLevel();
  const g = new golemMod.IronGolem(level);
  g.moveTo(0.5, 64, 0.5, 0, 0);
  g.playerCreated = true;
  g.health = 33;
  const d = g.save();
  const g2 = spawner.loadEntity(d, level);
  check('saves its health and maker', g2 && g2.type === 'iron_golem' && g2.health === 33 && g2.playerCreated === true);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

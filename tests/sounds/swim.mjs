// Headless checks for mobs' swimming sounds (node tests/sounds/swim.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/entity/player.ts', '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/textures/mobs.ts',
  '/src/entity/polarBear.ts', '/src/entity/ai/pathfinder.ts', '/src/entity/monsters.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, playerMod, spawner, itemMod, biomes, mobs, P, PF, monsters] = mods;
const { ItemStack } = itemMod;
const { S, getBlock, BLOCKS, STATE_BLOCK } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

function makeLevel(biome = 'plains') {
  const world = new worldMod.World();
  for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) {
    const c = new chunkMod.Chunk(cx, cz);
    c.biomes.fill(biomes.BIOME_ID[biome]);
    world.chunks.set(c.key, c);
  }
  const level = new levelMod.Level(world, 'test');
  const sounds = [];
  level.sound = { play: (n, x, y, z, v, p) => sounds.push({ n, v, p }), playUI() {} };
  level.particles = { spawn() {}, blockBreak() {}, spell() {}, poof() {}, entityEffect() {}, blockParticle() {} };
  const st = S('stone'), gs = S('grass_block');
  for (let x = -60; x <= 60; x++) for (let z = -60; z <= 60; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 58; y <= 62; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, gs);
    c.heightmap[((z & 15) << 4) | (x & 15)] = 64;
  }
  level.dayTime = 6000;
  level.difficulty = 'normal';
  return { world, level, sounds };
}
function playerAt(level, x, y, z, mode = 'survival') {
  const p = new playerMod.Player(level);
  p.setGameMode(mode);
  p.moveTo(x + 0.5, y, z + 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  return p;
}
const mobAt = (level, type, x, y, z) => { const m = spawner.createMob(type, level); m.moveTo(x + 0.5, y, z + 0.5, 0, 0); m.finalizeSpawn('egg'); level.addEntity(m); return m; };
const settle = (level, n) => { for (let i = 0; i < n; i++) level.tick(); };
const nameAt = (w, x, y, z) => BLOCKS[STATE_BLOCK[w.getState(x, y, z)]].name;



const { world, level, sounds } = makeLevel();
// a pool three deep
for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) for (let y = 61; y <= 63; y++) world.setState(x, y, z, S('water'));
playerAt(level, 20, 64, 20, 'creative');
const heard = {};
for (const type of ['cow', 'zombie', 'squid']) {
  const m = spawner.createMob(type, level);
  m.moveTo(0.5, 62, 0.5, 0, 0);
  level.addEntity(m);
  sounds.length = 0;
  for (let i = 0; i < 200; i++) {
    m.dx = 0.12; m.dz = 0.05;
    if (m.x > 6) m.moveTo(-6.5, m.y, 0.5, 0, 0);
    level.tick();
  }
  heard[type] = [...new Set(sounds.map((s) => s.n).filter((n) => n.includes('swim')))];
  m.remove?.() ?? (m.removed = true);
}
check('a cow swimming: entity.generic.swim', heard.cow.join() === 'entity.generic.swim', heard.cow.join());
check('a zombie swimming: entity.hostile.swim', heard.zombie.join() === 'entity.hostile.swim', heard.zombie.join());
check('a squid: not a sound', heard.squid.length === 0, heard.squid.join());
{
  const { mods: [, , A], close: close2 } = await loadModules(['/src/world/blocks.ts', '/src/item/item.ts', '/src/audio/synth.ts']);
  check('the sounds are there', !!A.SOUNDS['entity.generic.swim'] && !!A.SOUNDS['entity.hostile.swim']);
  await close2();
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

// Headless checks for villagers hiding when the bell rings (node tests/villager/bell.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/villager.ts']);
const [, levelMod, worldMod, chunkMod, blockMod, vil] = mods;
const { S, getBlock } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
level.sound = { play() {}, playUI() {} };
level.particles = { spawn() {}, blockBreak() {} };
const put = (x, y, z, st) => world.getChunk(x >> 4, z >> 4).setState(x & 15, y, z & 15, st);
{ const gs = S('grass_block'); for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) { put(x, 63, z, gs); world.getChunk(x >> 4, z >> 4).heightmap[((z & 15) << 4) | (x & 15)] = 64; } }
const bed = (x, z) => { world.setState(x, 64, z, getBlock('red_bed').state({ part: 'head', facing: 'north' })); world.setState(x, 64, z + 1, getBlock('red_bed').state({ part: 'foot', facing: 'north' })); };
bed(12, 0);
bed(-12, 6);
level.dayTime = 1000;
const v = new vil.Villager(level);
v.moveTo(0.5, 64, 0.5, 0, 0);
v.finalizeSpawn('egg');
level.addEntity(v);
for (let i = 0; i < 60; i++) level.tick();
// a bell on a block of stone, rung by redstone
world.setState(3, 64, 3, S('stone'));
world.setState(3, 65, 3, getBlock('bell').state({ attachment: 'floor', facing: 'north' }));
level.setBlock(4, 65, 3, S('redstone_block'));
check('hears the bell', v.heardBellTime !== null, `${v.heardBellTime}`);
level.tick();
level.tick();
check('goes to hide', v.brain.isActive('hide'), `${v.brain.activeNonCore()}`);
// (once whatever walk it was on is over)
for (let i = 0; i < 100 && !v.mem.hidingPlace; i++) level.tick();
check('picks a bed to hide by', !!v.mem.hidingPlace && ['12,64,0', '-12,64,6'].includes(v.mem.hidingPlace.join()), `${v.mem.hidingPlace}`);
// (it hides for 300 ticks from the bell, however long it took to pick its bed: look just before that's up)
const heard = v.heardBellTime;
let reached = false;
while (level.gameTime < heard + 290) { level.tick(); const hp = v.mem.hidingPlace; if (hp && Math.hypot(v.x - hp[0] - 0.5, v.z - hp[2] - 0.5) < 3) reached = true; }
check('runs to it', reached, `at ${v.x.toFixed(1)},${v.z.toFixed(1)}`);
check('still hiding', v.brain.isActive('hide'));
while (level.gameTime < heard + 330) level.tick();
check('15 s after the bell it comes out', !v.brain.isActive('hide') && v.heardBellTime === null && !v.mem.hidingPlace, `${v.brain.activeNonCore()}`);
// far away (over 32 blocks): unheard
const w2 = new vil.Villager(level);
w2.moveTo(38.5, 64, 38.5, 0, 0);
w2.finalizeSpawn('egg');
level.addEntity(w2);
level.setBlock(4, 65, 3, 0);
level.tick();
level.setBlock(4, 65, 3, S('redstone_block'));
check('a villager 50 blocks off doesn\'t hear it', w2.heardBellTime === null && v.heardBellTime !== null, `${w2.heardBellTime} ${v.heardBellTime} at 3,65,3: ${blockMod.BLOCKS[blockMod.STATE_BLOCK[world.getState(3, 65, 3)]].name}, 3,64,3: ${blockMod.BLOCKS[blockMod.STATE_BLOCK[world.getState(3, 64, 3)]].name}`);
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

// Headless checks for the villager's brain (node tests/villager/brain.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/villager.ts', '/src/entity/monsters.ts']);
const [, levelMod, worldMod, chunkMod, blockMod, vil, monsters] = mods;
const { S, getBlock, BLOCKS, STATE_BLOCK } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
const sounds = [];
level.sound = { play: (n) => sounds.push(n), playUI() {} };
const name = (x, y, z) => BLOCKS[STATE_BLOCK[world.getState(x, y, z)]].name;
const prop = (x, y, z, p) => { const st = world.getState(x, y, z); return BLOCKS[STATE_BLOCK[st]].get(st, p); };
{ const gs = S('grass_block'); for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) { const c = world.getChunk(x >> 4, z >> 4); c.setState(x & 15, 63, z & 15, gs); c.heightmap[((z & 15) << 4) | (x & 15)] = 64; } }
const tick = (n) => { for (let i = 0; i < n; i++) level.tick(); };

// a grindstone (weaponsmith) and a bed
world.setState(8, 64, 0, getBlock('grindstone').state({ face: 'floor', facing: 'north' }));
world.setState(-8, 64, 0, getBlock('red_bed').state({ part: 'head', facing: 'north' }));
world.setState(-8, 64, 1, getBlock('red_bed').state({ part: 'foot', facing: 'north' }));
level.dayTime = 1000;
const v = new vil.Villager(level);
v.moveTo(0.5, 64, 0.5, 0, 0);
v.finalizeSpawn('egg');
level.addEntity(v);
check('a plains villager, jobless', v.villagerType === 'plains' && v.profession === 'none');
tick(200);
check('claims the bed as home', v.mem.home?.join() === '-8,64,0', String(v.mem.home));
check('eyes the grindstone', v.mem.potentialJobSite?.join() === '8,64,0' || v.mem.jobSite?.join() === '8,64,0', `${v.mem.potentialJobSite} ${v.mem.jobSite}`);
let t = 0;
while (v.profession === 'none' && t < 1400) { tick(20); t += 20; }
check('becomes a weaponsmith at the grindstone', v.profession === 'weaponsmith', `after ${t} ticks, at ${v.x.toFixed(1)},${v.z.toFixed(1)}`);
check('job site is the grindstone', v.mem.jobSite?.join() === '8,64,0');
check('two novice offers', v.getOffers().length === 2, v.getOffers().map((o) => `${o.baseCostA.count} ${o.baseCostA.id} -> ${o.result.count} ${o.result.item.id}`).join('; '));
check('a second villager can\'t take the same bed', !level.poi.hasSpace(-8, 64, 0) && !level.poi.hasSpace(8, 64, 0));

// work time: it goes to its grindstone
level.dayTime = 3000;
tick(600);
const dj = Math.hypot(v.x - 8.5, v.z - 0.5);
check('at work near the grindstone', dj < 10, `${dj.toFixed(1)} away (activity ${v.brain.activeNonCore()})`);
// night: home to bed
level.dayTime = 12500;
t = 0;
while (!v.isSleeping() && t < 2400) { tick(20); t += 20; }
check('asleep in its bed at night', v.isSleeping() && v.sleepingPos?.join() === '-8,64,0', `after ${t} ticks, at ${v.x.toFixed(1)},${v.y.toFixed(2)},${v.z.toFixed(1)} (${v.brain.activeNonCore()})`);
check('the bed shows occupied', prop(-8, 64, 0, 'occupied') === true);
level.dayTime = 1000;
tick(40);
check('wakes in the morning, bed freed', !v.isSleeping() && prop(-8, 64, 0, 'occupied') === false, `${v.brain.activeNonCore()}`);

// a zombie close by: panic and run
level.dayTime = 1000;
level.difficulty = 'easy';
const zb = new monsters.Zombie(level);
zb.moveTo(v.x + 4, 64, v.z, 0, 0);
zb.goalSelector.tick = zb.targetSelector.tick = zb.goalSelector.tickRunningGoals = zb.targetSelector.tickRunningGoals = () => {};
zb.isSunBurnTick = () => false;
level.addEntity(zb);
// (a frozen zombie: the villager runs until it's more than 8 away, then calms down, all within a second or two)
const d0 = Math.hypot(v.x - zb.x, v.z - zb.z);
let panicked = false, far = d0;
for (let i = 0; i < 80; i++) { tick(1); panicked ||= v.brain.isActive('panic'); if (v.brain.isActive('panic')) far = Math.max(far, Math.hypot(v.x - zb.x, v.z - zb.z)); }
check('panics with a zombie 4 away', panicked, `${v.brain.activeNonCore()} hostile=${v.mem.nearestHostile?.type}`);
check('runs away', far > 7.5, `${d0.toFixed(1)} -> ${far.toFixed(1)}`);
zb.remove();
tick(100);
check('calms down once it\'s gone', !v.brain.isActive('panic'), `${v.brain.activeNonCore()}`);

// a closed room with a wooden door: out to work through it, shutting it behind
for (let x = 18; x <= 24; x++) for (let z = -3; z <= 3; z++) for (let y = 64; y <= 66; y++) {
  const edge = x === 18 || x === 24 || z === -3 || z === 3;
  world.setState(x, y, z, edge || y === 66 ? S('oak_planks') : 0);
}
const door = getBlock('oak_door');
world.setState(24, 64, 0, door.state({ half: 'lower', facing: 'east' }));
world.setState(24, 65, 0, door.state({ half: 'upper', facing: 'east' }));
const w2 = new vil.Villager(level);
w2.moveTo(20.5, 64, 0.5, 0, 0);
level.addEntity(w2);
// its workplace outside (a grindstone out east)
world.setState(30, 64, 0, getBlock('grindstone').state({ face: 'floor', facing: 'north' }));
level.dayTime = 3000;
let opened = false, out = false;
for (let i = 0; i < 1500 && !out; i++) {
  tick(1);
  if (prop(24, 64, 0, 'open')) opened = true;
  if (w2.x > 25) out = true;
}
check('opens the door to get out', opened && out, `opened=${opened} x=${w2.x.toFixed(1)} job=${w2.mem.jobSite} pot=${w2.mem.potentialJobSite}`);
tick(60);
check('shuts it behind', prop(24, 64, 0, 'open') === false && prop(24, 65, 0, 'open') === false, `x=${w2.x.toFixed(1)}`);
check('door sounds', sounds.includes('block.wooden_door.open') && sounds.includes('block.wooden_door.close'));

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

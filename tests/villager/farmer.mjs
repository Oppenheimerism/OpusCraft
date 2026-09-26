// Headless checks for the farmer's day: harvest, sow, bone meal, compost and bake (node tests/villager/farmer.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/villager.ts', '/src/item/item.ts']);
const [, levelMod, worldMod, chunkMod, blockMod, vil, itemMod] = mods;
const { S, getBlock, BLOCKS, STATE_BLOCK } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
const sounds = [];
level.sound = { play: (n) => sounds.push(n), playUI() {} };
level.particles = { spawn() {}, blockBreak() {} };
const put = (x, y, z, st) => { const c = world.getChunk(x >> 4, z >> 4); c.setState(x & 15, y, z & 15, st); };
const name = (x, y, z) => BLOCKS[STATE_BLOCK[world.getState(x, y, z)]].name;
{ const gs = S('grass_block'); for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) { put(x, 63, z, gs); world.getChunk(x >> 4, z >> 4).heightmap[((z & 15) << 4) | (x & 15)] = 64; } }
// the field: 5x5 farmland beside the composter, water in the middle; ripe wheat on half, the rest bare
const farmland = getBlock('farmland').state({ moisture: 7 });
const wheat = getBlock('wheat');
const field = [];
for (let x = 2; x <= 6; x++) for (let z = -2; z <= 2; z++) {
  if (x === 4 && z === 0) { put(x, 63, z, S('water')); continue; }
  put(x, 63, z, farmland);
  field.push([x, z]);
  if ((x + z) % 2 === 0) put(x, 64, z, wheat.state({ age: 7 }));
}
const ripe0 = field.filter(([x, z]) => name(x, 64, z) === 'wheat').length;
world.setState(0, 64, 0, getBlock('composter').state({ level: 0 }));
level.dayTime = 2500;
const v = new vil.Villager(level);
v.moveTo(0.5, 64, 2.5, 0, 0);
v.finalizeSpawn('egg');
level.addEntity(v);
v.addToInventory(ItemStack.of('wheat', 7));
v.addToInventory(ItemStack.of('wheat_seeds', 14));
v.addToInventory(ItemStack.of('bone_meal', 6));
let t = 0;
while (v.profession !== 'farmer' && t < 2000) { level.tick(); t++; }
check('takes the composter: a farmer', v.profession === 'farmer' && v.mem.jobSite?.join() === '0,64,0', `after ${t} ticks`);
// a working day (the clock held in work time)
let bread = false, composted = false, planted = false, boned = false, harvested = false;
for (let i = 0; i < 6000; i++) {
  level.dayTime = 3000;
  level.tick();
  bread ||= v.countItem('bread') > 0;
  composted ||= getBlock('composter').get(world.getState(0, 64, 0), 'level') > 0;
  planted ||= sounds.includes('item.crop.plant');
  boned ||= v.countItem('bone_meal') < 6;
  harvested ||= field.some(([x, z]) => (x + z) % 2 === 0 && name(x, 64, z) === 'wheat' && wheat.get(world.getState(x, 64, z), 'age') < 7) || field.filter(([x, z]) => name(x, 64, z) === 'wheat' && wheat.get(world.getState(x, 64, z), 'age') === 7).length < ripe0;
  if (bread && composted && planted && boned && harvested) break;
}
check('notices its fields', !!v.mem.secondaryJobSite && v.mem.secondaryJobSite.length > 0, `${v.mem.secondaryJobSite?.length}`);
check('harvests ripe wheat', harvested);
check('sows the bare farmland', planted, `seeds left ${v.countItem('wheat_seeds')}`);
check('bakes bread from its wheat', bread, `wheat ${v.countItem('wheat')} bread ${v.countItem('bread')}`);
check('composts its spare seeds', composted);
check('feeds the crops bone meal', boned, `bone meal ${v.countItem('bone_meal')}`);
// only a farmer: a librarian with seeds leaves the fields alone
{
  const w2 = new vil.Villager(level);
  check('others can\'t harvest (farmers only)', w2.profession !== 'farmer');
}
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

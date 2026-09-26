// Headless checks for villager food, breeding, sharing, bed-jumping and showing trades (node tests/villager/family.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 400000).unref();
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/villager.ts', '/src/entity/player.ts', '/src/item/item.ts', '/src/entity/itemEntity.ts', '/src/entity/trading.ts']);
const [, levelMod, worldMod, chunkMod, blockMod, vil, playerMod, itemMod, itemEnt, trading] = mods;
const { S, getBlock } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
function makeLevel() {
  const world = new worldMod.World();
  for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  const level = new levelMod.Level(world, 'test');
  level.sound = { play() {}, playUI() {} };
  const parts = [];
  level.particles = { spawn: (k) => parts.push(k), blockBreak() {} };
  { const gs = S('grass_block'); for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) { const c = world.getChunk(x >> 4, z >> 4); c.setState(x & 15, 63, z & 15, gs); c.heightmap[((z & 15) << 4) | (x & 15)] = 64; } }
  level.dayTime = 1000;
  return { world, level, parts };
}
const bed = (world, x, z) => { world.setState(x, 64, z, getBlock('red_bed').state({ part: 'head', facing: 'north' })); world.setState(x, 64, z + 1, getBlock('red_bed').state({ part: 'foot', facing: 'north' })); };
const spawn = (level, x, z) => { const v = new vil.Villager(level); v.moveTo(x + 0.5, 64, z + 0.5, 0, 0); v.finalizeSpawn('egg'); level.addEntity(v); return v; };
const tick = (level, n) => { for (let i = 0; i < n; i++) level.tick(); };
const villagers = (level) => level.entities.filter((e) => e.type === 'villager' && !e.removed);

// --- picking up food
{
  const { level } = makeLevel();
  const v = spawn(level, 0, 0);
  const it = new itemEnt.ItemEntity(level, ItemStack.of('bread', 5));
  // (right beside it: vanilla GoToWantedItem only goes for things within 4, and a stroll can take it further first)
  it.moveTo(v.x + 1, 64, v.z, 0, 0);
  it.pickupDelay = 0;
  level.addEntity(it);
  let t = 0;
  while (v.countItem('bread') === 0 && t < 400) { tick(level, 10); t += 10; }
  check('walks over and picks up bread', v.countItem('bread') === 5 && it.removed, `after ${t} ticks`);
  const junk = new itemEnt.ItemEntity(level, ItemStack.of('cobblestone', 5));
  check('doesn\'t want cobblestone', !v.wantsToPickUp(junk.stack));
  check('a farmer wants bone meal, others don\'t', !v.wantsToPickUp(ItemStack.of('bone_meal', 1)) && (v.setProfession('farmer'), v.wantsToPickUp(ItemStack.of('bone_meal', 1))));
}

// --- breeding with a spare bed
{
  const { level, parts } = makeLevel();
  bed(level.world, -6, 4); bed(level.world, -3, 4); bed(level.world, 0, 4);
  const a = spawn(level, -2, -2), b = spawn(level, 2, -2);
  a.addToInventory(ItemStack.of('bread', 3));
  b.addToInventory(ItemStack.of('bread', 3));
  check('fed parents can breed', a.canBreed() && b.canBreed());
  let t = 0;
  while (villagers(level).length < 3 && t < 12000) { tick(level, 20); t += 20; }
  const kids = villagers(level).filter((v) => v.isBaby());
  check('a baby is born', kids.length === 1, `after ${t} ticks; hearts ${parts.filter((k) => k === 'heart').length}`);
  const kid = kids[0];
  check('parents ate their bread', a.countItem('bread') === 0 && b.countItem('bread') === 0, `${a.countItem('bread')} ${b.countItem('bread')}`);
  check('parents rest 6000 ticks', a.age > 5000 && b.age > 5000, `${a.age} ${b.age}`);
  check('the baby has the spare bed', !!kid && !!kid.mem.home && kid.mem.home.join() !== a.mem.home?.join() && kid.mem.home.join() !== b.mem.home?.join(), `${kid?.mem.home} a:${a.mem.home} b:${b.mem.home}`);
  check('baby is jobless', kid?.profession === 'none');
  // the baby bounces on beds now and then (idle time)
  let jumped = false, onBed = false;
  const y0 = kid.y;
  for (let i = 0; i < 11000 && !jumped; i++) {
    level.tick();
    const st = level.world.getState(Math.floor(kid.x), Math.floor(kid.y), Math.floor(kid.z));
    if (blockMod.BLOCKS[blockMod.STATE_BLOCK[st]].name.endsWith('_bed')) { onBed = true; if (kid.dy > 0.1) jumped = true; }
  }
  check('the baby jumps on a bed', jumped, `onBed ${onBed} nearestBed ${kid.mem.nearestBed}`);
}

// --- no spare bed: angry, no baby
{
  const { level, parts } = makeLevel();
  bed(level.world, -6, 4); bed(level.world, 0, 4);
  const a = spawn(level, -2, -2), b = spawn(level, 2, -2);
  a.addToInventory(ItemStack.of('bread', 3));
  b.addToInventory(ItemStack.of('bread', 3));
  let t = 0;
  while (!parts.includes('angry_villager') && t < 12000) { tick(level, 20); t += 20; }
  check('no spare bed: angry faces', parts.includes('angry_villager'), `after ${t} ticks`);
  check('and no baby', villagers(level).length === 2);
}

// --- sharing food: one with plenty tosses half to one with none
{
  const { level } = makeLevel();
  // (penned in: on open ground two villagers can stroll out of each other's reach for good)
  const stone = S('stone');
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) if (Math.abs(x) === 6 || Math.abs(z) === 6) for (let y = 64; y <= 65; y++) level.world.getChunk(x >> 4, z >> 4).setState(x & 15, y, z & 15, stone);
  const a = spawn(level, -2, 0), b = spawn(level, 2, 0);
  a.addToInventory(ItemStack.of('bread', 40));
  let t = 0;
  while (b.countItem('bread') === 0 && t < 12000) { tick(level, 20); t += 20; }
  check('shares bread with a hungry villager', b.countItem('bread') > 0, `after ${t} ticks: a ${a.countItem('bread')} b ${b.countItem('bread')}`);
}

// --- showing trades to a player holding an emerald
{
  const { level } = makeLevel();
  const v = spawn(level, 0, 0);
  v.setProfession('librarian');
  v.xp = 1; // (traded before: it keeps its job without a lectern)
  v.offers = [new trading.MerchantOffer({ id: 'emerald', count: 1 }, null, ItemStack.of('bookshelf', 1), 12, 1, 0.05), new trading.MerchantOffer({ id: 'emerald', count: 1 }, null, ItemStack.of('lantern', 1), 12, 1, 0.05)];
  const p = new playerMod.Player(level);
  p.moveTo(0.5, 64, 2.5, 180, 0);
  level.player = p;
  level.addEntity(p);
  p.gameMode = 'survival';
  p.inventory.main[p.inventory.selected] = ItemStack.of('emerald', 5);
  const held = new Set();
  for (let i = 0; i < 400; i++) { level.tick(); p.moveTo(v.x, 64, v.z + 2, 180, 0); if (v.mainHand) held.add(v.mainHand.item.id); }
  check('holds up what an emerald buys, in turn', held.has('bookshelf') && held.has('lantern'), [...held].join());
  p.inventory.main[p.inventory.selected] = null;
  for (let i = 0; i < 100; i++) { level.tick(); p.moveTo(v.x, 64, v.z + 2, 180, 0); }
  check('puts it away when the emerald goes', !v.mainHand, String(v.mainHand?.item.id));
}
await close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);

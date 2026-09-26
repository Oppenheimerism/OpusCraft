// Headless checks for the redstone basics (node tests/redstone/basics.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/game/blockRules.ts',
  '/src/game/blockBehavior.ts', '/src/entity/itemEntity.ts', '/src/item/item.ts', '/src/entity/monsters.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, rules, behavior, itemEnt, itemMod, monsters] = mods;
const { S, getBlock, BLOCKS, STATE_BLOCK } = blockMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
let sounds = [];
level.sound = { play: (n, x, y, z, v, p) => sounds.push(`${n}@${v}/${(+p).toFixed(2)}`), playUI() {} };
const name = (x, y, z) => BLOCKS[STATE_BLOCK[world.getState(x, y, z)]].name;
const prop = (x, y, z, p) => { const st = world.getState(x, y, z); return BLOCKS[STATE_BLOCK[st]].get(st, p); };
const tick = (n) => { for (let i = 0; i < n; i++) level.tick(); };
const use = (x, y, z) => { const st = world.getState(x, y, z); return behavior.behaviorOf(st).use(level, x, y, z, st, {}); };
const place = (block, x, y, z, face, yaw = 0, pitch = 0) => {
  const st = rules.placementState(getBlock(block), { world, x, y, z, face, hitY: 0.5, yaw, pitch, sneaking: false, clickedState: 0 });
  if (st !== null) level.setBlock(x, y, z, st);
  return st;
};
for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) level.setBlock(x, 63, z, S('stone'), false);

// --- a lever on a wall powers a door on the wall's far side ---
level.setBlock(0, 64, 0, S('stone'), false);
const lst = place('lever', 0, 64, -1, 2); // clicked the wall's north face
check('lever hangs on the wall', lst !== null && prop(0, 64, -1, 'face') === 'wall' && prop(0, 64, -1, 'facing') === 'north');
const door = getBlock('oak_door');
level.setBlock(0, 65, 1, door.state({ half: 'upper', facing: 'north' }), false);
level.setBlock(0, 64, 1, door.state({ half: 'lower', facing: 'north' }));
check('door starts shut', prop(0, 64, 1, 'open') === false);
sounds = [];
use(0, 64, -1);
check('lever on', prop(0, 64, -1, 'powered') === true);
check('door opened by the lever through the wall', prop(0, 64, 1, 'open') === true && prop(0, 64, 1, 'powered') === true);
check('upper half follows', prop(0, 65, 1, 'open') === true && prop(0, 65, 1, 'powered') === true);
check('sounds: lever click 0.3/0.6 and door open', sounds.includes('block.lever.click@0.3/0.60') && sounds.some((s) => s.startsWith('block.wooden_door.open')), sounds.join(' '));
sounds = [];
use(0, 64, -1);
check('lever off, door shut', prop(0, 64, -1, 'powered') === false && prop(0, 64, 1, 'open') === false && prop(0, 65, 1, 'open') === false);
check('lever off click 0.5', sounds.includes('block.lever.click@0.3/0.50'), sounds.join(' '));
// powered lever broken → door shuts
use(0, 64, -1);
level.destroyBlock(0, 64, -1, false);
check('lever broken: door shuts', prop(0, 64, 1, 'open') === false && prop(0, 64, 1, 'powered') === false);
// the wall broken under a lever: the lever pops off
level.setBlock(0, 64, -1, lst);
level.setBlock(0, 64, 0, 0);
check('lever pops off without its wall', name(0, 64, -1) === 'air');

// --- a stone button on the floor opens a trapdoor next to it for 20 ticks ---
const bst = place('stone_button', 3, 64, 0, 1, 0, 30); // clicked the top of the floor
check('button on the floor', bst !== null && prop(3, 64, 0, 'face') === 'floor', bst && prop(3, 64, 0, 'facing'));
const td = getBlock('oak_trapdoor');
level.setBlock(4, 64, 0, td.state({ facing: 'north', half: 'bottom' }));
use(3, 64, 0);
check('button pressed, trapdoor open', prop(3, 64, 0, 'powered') === true && prop(4, 64, 0, 'open') === true);
tick(19);
check('still pressed after 19 ticks', prop(3, 64, 0, 'powered') === true);
tick(1);
check('released after 20 ticks, trapdoor shut', prop(3, 64, 0, 'powered') === false && prop(4, 64, 0, 'open') === false);

// --- a wooden pressure plate lights the lamp beneath it; stone plates ignore items ---
level.setBlock(-4, 63, 0, S('redstone_lamp'));
level.setBlock(-4, 64, 0, S('oak_pressure_plate'));
check('lamp starts dark', prop(-4, 63, 0, 'lit') === false);
const it = new itemEnt.ItemEntity(level, itemMod.ItemStack.of('stick'));
it.moveTo(-3.5, 64.5, 0.5);
level.addEntity(it);
tick(15);
check('item on the plate presses it', prop(-4, 64, 0, 'powered') === true, `item y ${it.y.toFixed(3)}`);
check('lamp lit', prop(-4, 63, 0, 'lit') === true);
it.removed = true;
tick(20);
check('plate released once the item is gone', prop(-4, 64, 0, 'powered') === false);
tick(4);
check('lamp out 4 ticks later', prop(-4, 63, 0, 'lit') === false);
level.setBlock(-6, 64, 0, S('stone_pressure_plate'));
const it2 = new itemEnt.ItemEntity(level, itemMod.ItemStack.of('stick'));
it2.moveTo(-5.5, 64.5, 0.5);
level.addEntity(it2);
tick(15);
check('stone plate ignores items', prop(-6, 64, 0, 'powered') === false);
it2.removed = true;
const zb = new monsters.Zombie(level);
zb.moveTo(-5.5, 64, 0.5, 0, 0);
level.addEntity(zb);
tick(3);
check('stone plate feels a zombie', prop(-6, 64, 0, 'powered') === true);
zb.removed = true;

// --- weighted plates count ---
level.setBlock(6, 64, 3, S('light_weighted_pressure_plate'));
level.setBlock(6, 64, 5, S('heavy_weighted_pressure_plate'));
for (const z of [3, 5]) for (let i = 0; i < 3; i++) { const e = new itemEnt.ItemEntity(level, itemMod.ItemStack.of('stick')); e.moveTo(6.5, 64.2, z + 0.5); level.addEntity(e); }
tick(10);
check('light plate: 3 items → 3', prop(6, 64, 3, 'power') === 3, String(prop(6, 64, 3, 'power')));
check('heavy plate: 3 items → 1', prop(6, 64, 5, 'power') === 1, String(prop(6, 64, 5, 'power')));

// --- TNT beside a redstone block primes; an iron door placed by one opens ---
level.setBlock(0, 64, 5, S('redstone_block'));
const n0 = level.entities.length;
level.setBlock(1, 64, 5, S('tnt'));
check('powered TNT primes', name(1, 64, 5) === 'air' && level.entities.some((e) => e.type === 'tnt'), `${level.entities.length - n0} new`);
const ist = place('iron_door', -1, 64, 5, 1, 90);
check('iron door placed by power opens', ist !== null && getBlock('iron_door').get(ist, 'open') === true && getBlock('iron_door').get(ist, 'powered') === true);

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

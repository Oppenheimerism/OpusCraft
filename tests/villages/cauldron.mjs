// Headless checks for the cauldrons (node tests/villages/cauldron.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/game/blockRules.ts',
  '/src/game/blockBehavior.ts', '/src/item/item.ts', '/src/entity/player.ts', '/src/entity/monsters.ts', '/src/core/rng.ts', '/src/inventory/recipes.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, rules, behavior, itemMod, playerMod, monsters, rng, recipes] = mods;
const { S, getBlock, BLOCKS, STATE_BLOCK, EMISSION, COLLISION } = blockMod;
const { ItemStack, ITEMS, itemForBlock } = itemMod;
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
for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) level.setBlock(x, 63, z, S('stone'), false);
const player = new playerMod.Player(level);
player.moveTo(0.5, 64, -5.5, 0, 0);
const inv = player.inventory;
const hold = (id, n = 1) => { inv.main[inv.selected] = id ? ItemStack.of(id, n) : null; };
const held = () => inv.main[inv.selected];
const useItemOn = (x, y, z) => {
  const st = world.getState(x, y, z);
  return behavior.behaviorOf(st).useItemOn(level, x, y, z, st, held(), { player, face: 1, hx: x + 0.5, hy: y + 1, hz: z + 0.5, hand: 'main' });
};

level.setBlock(0, 64, 0, S('cauldron'));
check('cauldron shape: legs, floor and walls', COLLISION[world.getState(0, 64, 0)].length === 13);
hold('water_bucket');
sounds = [];
check('water bucket fills it', useItemOn(0, 64, 0) === 'success' && name(0, 64, 0) === 'water_cauldron' && prop(0, 64, 0, 'level') === 3);
check('an empty bucket back, and the splash', held()?.item.id === 'bucket' && sounds[0] === 'item.bucket.empty@1/1.00', sounds.join(' '));
check('the bucket scoops a full one out', useItemOn(0, 64, 0) === 'success' && name(0, 64, 0) === 'cauldron' && held()?.item.id === 'water_bucket');
level.setBlock(0, 64, 0, getBlock('water_cauldron').state({ level: 2 }));
hold('bucket');
check('not from a part-full one', useItemOn(0, 64, 0) === 'pass' && held()?.item.id === 'bucket');
hold('lava_bucket');
check('lava poured over the water replaces it', useItemOn(0, 64, 0) === 'success' && name(0, 64, 0) === 'lava_cauldron' && EMISSION[world.getState(0, 64, 0)] === 15);
hold('bucket', 3);
sounds = [];
check('lava scooped into one of three buckets', useItemOn(0, 64, 0) === 'success' && name(0, 64, 0) === 'cauldron' && held()?.count === 2 && inv.main.some((s) => s?.item.id === 'lava_bucket'), sounds.join(' '));
check('lava fill sound', sounds.includes('item.bucket.fill_lava@1/1.00'));
// creative keeps the bucket
player.gameMode = 'creative';
hold('water_bucket');
useItemOn(0, 64, 0);
check('creative: keeps the water bucket (and gets an empty one)', held()?.item.id === 'water_bucket' && inv.main.some((s) => s?.item.id === 'bucket') && name(0, 64, 0) === 'water_cauldron');
player.gameMode = 'survival';
// washing dyed leather
const boots = ItemStack.of('leather_boots');
boots.tag = { dyedColor: 0x3355ff };
inv.main[inv.selected] = boots;
check('dyed boots washed, a level used', useItemOn(0, 64, 0) === 'success' && held().tag?.dyedColor === undefined && prop(0, 64, 0, 'level') === 2);
check('undyed boots pass', useItemOn(0, 64, 0) === 'pass' && prop(0, 64, 0, 'level') === 2);
// a burning zombie in the water is put out and uses a level
const z = new monsters.Zombie(level);
z.moveTo(0.5, 64.25, 0.5, 0, 0);
level.addEntity(z);
z.igniteForSeconds(8);
tick(1);
check('burning zombie put out', !z.isOnFire() && prop(0, 64, 0, 'level') === 1, `${z.remainingFireTicks} ${prop(0, 64, 0, 'level')}`);
z.igniteForSeconds(8);
tick(1);
check('the last level goes: empty cauldron', !z.isOnFire() && name(0, 64, 0) === 'cauldron');
z.igniteForSeconds(8);
tick(1);
check('an empty cauldron does not put it out', z.isOnFire());
z.removed = true;
// lava cauldron burns
level.setBlock(3, 64, 0, S('lava_cauldron'));
const z2 = new monsters.Zombie(level);
z2.moveTo(3.5, 64.25, 0.5, 0, 0);
level.addEntity(z2);
const hp = z2.health;
tick(2);
check('lava cauldron sets things alight and burns', z2.isOnFire() && z2.health < hp, `${z2.health}`);
z2.removed = true;
// drops and items
const r = new rng.Rand(1);
check('all drop a cauldron (with a pickaxe)', ['cauldron', 'water_cauldron', 'lava_cauldron'].every((n) => rules.blockDrops(S(n), ITEMS.get('iron_pickaxe'), r).map((s) => s.item.id).join() === 'cauldron'));
check('nothing by hand', rules.blockDrops(S('water_cauldron'), null, r).length === 0);
check('pick block: a cauldron', itemForBlock('water_cauldron')?.id === 'cauldron' && itemForBlock('lava_cauldron')?.id === 'cauldron');
check('cauldron item is a flat sprite', ITEMS.get('cauldron')?.texture === 'cauldron' && ITEMS.get('cauldron')?.creativeTab === 'functional');
check('no items for the filled ones', !ITEMS.has('water_cauldron') && !ITEMS.has('lava_cauldron'));
check('cauldron recipe', recipes.RECIPES.some((x) => x.result === 'cauldron'));

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

// Headless checks for flower pots (node tests/villages/flowerpot.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/game/blockRules.ts',
  '/src/game/blockBehavior.ts', '/src/item/item.ts', '/src/entity/player.ts', '/src/core/rng.ts', '/src/inventory/recipes.ts',
  '/src/game/villageBlocks.ts', '/src/world/blocksVillage.ts', '/src/textures/blocks.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, rules, behavior, itemMod, playerMod, rng, recipes, , bv, tex] = mods;
const { S, getBlock, BLOCKS, BLOCK_BY_NAME, STATE_BLOCK, OUTLINE, COLLISION, STATE_VIEWS } = blockMod;
const { ItemStack, ITEMS } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
level.sound = { play() {}, playUI() {} };
const name = (x, y, z) => BLOCKS[STATE_BLOCK[world.getState(x, y, z)]].name;
for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) level.setBlock(x, 63, z, S('stone'), false);
const player = new playerMod.Player(level);
player.moveTo(0.5, 64, -3.5, 0, 0);
const inv = player.inventory;
const hold = (id, n = 1) => { inv.main[inv.selected] = id ? ItemStack.of(id, n) : null; };
const held = () => inv.main[inv.selected];
const ctx = (x, y, z) => ({ player, face: 1, hx: x + 0.5, hy: y + 1, hz: z + 0.5, hand: 'main' });
const useItemOn = (x, y, z) => { const st = world.getState(x, y, z); return behavior.behaviorOf(st).useItemOn(level, x, y, z, st, held(), ctx(x, y, z)); };
const use = (x, y, z) => { const st = world.getState(x, y, z); return behavior.behaviorOf(st).use(level, x, y, z, st, ctx(x, y, z)); };
const count = (id) => inv.main.reduce((n, s) => n + (s && s.item.id === id ? s.count : 0), 0);

// the pots there are
const potted = bv.POTTABLE.filter((p) => BLOCK_BY_NAME.has(p));
// (31 with bamboo, which came with the panda: world/blocksBamboo.ts; (the wither) 32 with the wither rose: world/blocksWither.ts)
check('a pot for every plant the world has', potted.length === 31 + (BLOCK_BY_NAME.has('wither_rose') ? 1 : 0) && potted.every((p) => BLOCK_BY_NAME.has(bv.pottedName(p))), `${potted.length}`);
check('names as vanilla', BLOCK_BY_NAME.has('potted_azalea_bush') && BLOCK_BY_NAME.has('potted_flowering_azalea_bush') && BLOCK_BY_NAME.has('potted_dead_bush'));
check('no potted items', potted.every((p) => !ITEMS.get(bv.pottedName(p))));
check('pick block gives the plant', ['potted_azalea_bush:azalea', 'potted_flowering_azalea_bush:flowering_azalea', 'potted_dead_bush:dead_bush', 'potted_poppy:poppy', 'flower_pot:flower_pot']
  .every((s) => { const [b, i] = s.split(':'); return itemMod.itemForBlock(b)?.id === i; }));
check('potted fern is tinted with the grass', getBlock('potted_fern').tint === 'grass');
// every texture the models use is drawn
const missing = new Set();
for (const n of ['flower_pot', ...potted.map(bv.pottedName)]) {
  const b = getBlock(n);
  const v = b.s.model(STATE_VIEWS[b.defaultState]);
  for (const e of v.model.elements) for (const fc of Object.values(e.faces)) if (!tex.BLOCK_TEXTURES[fc.tex]) missing.add(fc.tex);
  if (!tex.BLOCK_TEXTURES[v.model.particle]) missing.add(v.model.particle);
}
check('every texture drawn', missing.size === 0, [...missing].join(' '));

// a pot
level.setBlock(0, 64, 0, S('flower_pot'));
check('a small pot, broken in a blink', getBlock('flower_pot').hardness === 0 && COLLISION[S('flower_pot')][0].join() === [5, 0, 5, 11, 6, 11].map((v) => v / 16).join());
hold('stone', 5);
check('not a plant: passes on', useItemOn(0, 64, 0) === 'pass');
check('an empty pot: the click is spent, no swing', use(0, 64, 0) === 'consume' && name(0, 64, 0) === 'flower_pot');
hold('poppy', 3);
check('a poppy goes in', useItemOn(0, 64, 0) === 'success' && name(0, 64, 0) === 'potted_poppy' && held()?.count === 2);
check('the same shape with a plant in it', COLLISION[world.getState(0, 64, 0)][0].join() === COLLISION[S('flower_pot')][0].join());
check('a full pot takes no second plant', useItemOn(0, 64, 0) === 'consume' && held()?.count === 2 && name(0, 64, 0) === 'potted_poppy');
hold('stone', 5);
check('with anything else, the block has its turn', useItemOn(0, 64, 0) === 'pass');
hold(null);
check('taken out by hand', use(0, 64, 0) === true && name(0, 64, 0) === 'flower_pot' && count('poppy') === 1);
// saplings, mushrooms, cactus, azalea
for (const p of ['oak_sapling', 'red_mushroom', 'cactus', 'azalea', 'crimson_roots', 'fern']) {
  hold(p);
  const r = useItemOn(0, 64, 0);
  check(`${p} goes in`, r === 'success' && name(0, 64, 0) === bv.pottedName(p) && !held());
  hold(null);
  use(0, 64, 0);
}
// the bush models are more than a cross
const bush = getBlock('potted_azalea_bush').s.model(STATE_VIEWS[getBlock('potted_azalea_bush').defaultState]).model;
check('azalea bush: pot, bush and stem', bush.elements.length === 5 + 5 + 2);
const cactus = getBlock('potted_cactus').s.model(STATE_VIEWS[getBlock('potted_cactus').defaultState]).model;
check('cactus: a stub four across', cactus.elements.length === 6 && cactus.elements[5].from.join() === '6,4,6');
// creative: the plant stays in the hand
player.gameMode = 'creative';
hold('dandelion');
useItemOn(0, 64, 0);
check('creative: the plant is kept', name(0, 64, 0) === 'potted_dandelion' && held()?.count === 1);
player.gameMode = 'survival';
// full inventory: the plant drops at the player's feet
for (let i = 0; i < 36; i++) inv.main[i] = ItemStack.of('stone', 64);
const thrown = [];
player.dropHandler = (s) => thrown.push(s.item.id);
use(0, 64, 0);
const dropped = thrown.join();
check('full inventory: it drops', dropped === 'dandelion' && name(0, 64, 0) === 'flower_pot', dropped);
for (let i = 0; i < 36; i++) inv.main[i] = null;
// loot
const r = new rng.Rand(1);
const drop = (n) => rules.blockDrops(S(n), null, r).map((s) => s.item.id).join();
check('the pot drops itself', drop('flower_pot') === 'flower_pot');
check('a potted plant drops the pot and the plant', drop('potted_poppy') === 'flower_pot,poppy' && drop('potted_azalea_bush') === 'flower_pot,azalea');
// breaking one in the world
level.setBlock(2, 64, 2, S('potted_cornflower'));
const n1 = level.entities.length;
level.destroyBlock(2, 64, 2, true, null);
check('broken: both come out', level.entities.slice(n1).map((e) => e.stack?.item.id).sort().join() === 'cornflower,flower_pot');
// item, recipe
check('the pot item is flat', ITEMS.get('flower_pot')?.texture === 'flower_pot' && ITEMS.get('flower_pot')?.creativeTab === 'functional');
check('recipe: three bricks', recipes.RECIPES.some((x) => x.result === 'flower_pot'));

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

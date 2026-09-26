// Headless checks for the lectern and the job site tables (node tests/villages/workstations.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/game/blockRules.ts',
  '/src/game/blockBehavior.ts', '/src/item/item.ts', '/src/entity/player.ts', '/src/world/blockEntity.ts', '/src/core/rng.ts', '/src/inventory/recipes.ts',
  '/src/game/villageBlocks.ts', '/src/game/redstone/signal.ts', '/src/audio/synth.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, rules, behavior, itemMod, playerMod, beMod, rng, recipes, village, signal, synth] = mods;
const { S, getBlock, BLOCKS, STATE_BLOCK, OUTLINE, COLLISION, EMISSION } = blockMod;
const { ItemStack, ITEMS } = itemMod;
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
const place = (block, x, y, z, face, yaw = 0, pitch = 0) => {
  const st = rules.placementState(getBlock(block), { world, x, y, z, face, hitY: 0.5, yaw, pitch, sneaking: false, clickedState: 0 });
  if (st !== null) level.setBlock(x, y, z, st);
  return st;
};
for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) level.setBlock(x, 63, z, S('stone'), false);
const player = new playerMod.Player(level);
player.moveTo(0.5, 64, -5.5, 0, 0);
const inv = player.inventory;
const hold = (id, n = 1) => { inv.main[inv.selected] = id ? ItemStack.of(id, n) : null; };
const held = () => inv.main[inv.selected];
const ctx = (x, y, z) => ({ player, face: 1, hx: x + 0.5, hy: y + 1, hz: z + 0.5, hand: 'main' });
const useItemOn = (x, y, z) => { const st = world.getState(x, y, z); return behavior.behaviorOf(st).useItemOn(level, x, y, z, st, held(), ctx(x, y, z)); };
const use = (x, y, z) => { const st = world.getState(x, y, z); return behavior.behaviorOf(st).use(level, x, y, z, st, ctx(x, y, z)); };
const opened = [];
village.setVillageMenuHook((kind, x, y, z) => opened.push(`${kind}@${x},${y},${z}`));

// --- lectern ---
place('lectern', 0, 64, 0, 1, 0);
check('lectern faces the player', prop(0, 64, 0, 'facing') === 'north');
check('stands on its post, the board is only for looking at', COLLISION[world.getState(0, 64, 0)].every((b) => b[4] <= 14 / 16) && OUTLINE[world.getState(0, 64, 0)].some((b) => b[4] === 18 / 16));
const be = world.getBlockEntity(0, 64, 0);
check('lectern block entity', be instanceof beMod.LecternBlockEntity);
hold('stone', 5);
check('other things go past it (skip to the item)', useItemOn(0, 64, 0) === 'skip');
check('an empty lectern: the click is spent', use(0, 64, 0) === 'consume' && opened.length === 0);
hold('writable_book');
sounds = [];
check('the book goes on', useItemOn(0, 64, 0) === 'success' && prop(0, 64, 0, 'has_book') === true && be.book?.item.id === 'writable_book' && !held());
check('the book sound', sounds.includes('item.book.put@1/1.00'), sounds.join(' '));
hold('writable_book');
check('a second book passes', useItemOn(0, 64, 0) === 'pass' && held()?.count === 1);
check('its book opens to read (the game hook)', use(0, 64, 0) === true && opened[0] === 'lectern@0,64,0');
// a page turned: a 2-tick pulse of 15 into the block below
level.setBlock(0, 63, 1, S('redstone_lamp'));
village.lecternPageTurned(level, 0, 64, 0);
check('page turned: powered', prop(0, 64, 0, 'powered') === true && signal.hasNeighborSignal(world, 0, 63, 0));
tick(2);
check('the pulse ends two ticks on', prop(0, 64, 0, 'powered') === false);
// broken: the book comes off with it
const n0 = level.entities.length;
level.destroyBlock(0, 64, 0, true, ITEMS.get('iron_axe'));
const dropped = level.entities.slice(n0).map((e) => e.stack?.item.id).sort().join(',');
check('broken: the lectern and its book', dropped === 'lectern,writable_book', dropped);

// --- the job site tables ---
for (const n of ['cartography_table', 'fletching_table', 'smithing_table', 'loom', 'stonecutter', 'brewing_stand']) {
  level.setBlock(3, 64, 3, S(n));
  opened.length = 0;
  const r = behavior.behaviorOf(world.getState(3, 64, 3))?.use?.(level, 3, 64, 3, world.getState(3, 64, 3), ctx(3, 64, 3));
  const wants = n !== 'fletching_table';
  check(`${n}: ${wants ? 'its menu hook' : 'nothing to open'}`, wants ? r === true && opened[0] === `${n}@3,64,3` : r === undefined && opened.length === 0);
}
place('loom', 5, 64, 5, 1, 90);
check('loom faces the player', prop(5, 64, 5, 'facing') === 'east', prop(5, 64, 5, 'facing'));
place('stonecutter', 6, 64, 5, 1, 0);
check('stonecutter: a 9 px slab', COLLISION[world.getState(6, 64, 5)][0][4] === 9 / 16 && prop(6, 64, 5, 'facing') === 'north');
// brewing stand arms follow its bottle slots
level.setBlock(5, 64, 0, S('brewing_stand'));
const bs = world.getBlockEntity(5, 64, 0);
check('brewing stand: 5 slots, a glimmer of light', bs instanceof beMod.BrewingStandBlockEntity && bs.container.size === 5 && EMISSION[world.getState(5, 64, 0)] === 1);
bs.container.items[1] = ItemStack.of('glass_bottle');
tick(1);
check('a bottle shows on arm 1 only', prop(5, 64, 0, 'has_bottle_1') === true && prop(5, 64, 0, 'has_bottle_0') === false && prop(5, 64, 0, 'has_bottle_2') === false);
bs.container.items[4] = ItemStack.of('blaze_powder', 2);
tick(1);
check('blaze powder tops up the fuel', bs.fuel === 20 && bs.container.items[4]?.count === 1);
bs.container.items[1] = null;
tick(1);
check('the bottle gone', prop(5, 64, 0, 'has_bottle_1') === false);
// drops
const r = new rng.Rand(1);
const drop = (n, tool) => rules.blockDrops(S(n), tool ? ITEMS.get(tool) : null, r).map((s) => s.item.id).join();
check('tables drop by hand', ['cartography_table', 'fletching_table', 'smithing_table', 'loom', 'lectern'].every((n) => drop(n) === n));
check('stonecutter and brewing stand want a pickaxe', drop('stonecutter') === '' && drop('stonecutter', 'wooden_pickaxe') === 'stonecutter' && drop('brewing_stand') === '' && drop('brewing_stand', 'wooden_pickaxe') === 'brewing_stand');
// items, recipes
check('book and quill: stacks to 1', ITEMS.get('writable_book')?.maxStack === 1);
for (const n of ['lectern', 'cartography_table', 'fletching_table', 'smithing_table', 'loom', 'stonecutter', 'brewing_stand', 'writable_book'])
  check(`recipe: ${n}`, recipes.RECIPES.some((x) => x.result === n));
check('wooden ones burn 300 ticks', ['lectern', 'loom', 'cartography_table', 'fletching_table', 'smithing_table'].every((n) => recipes.fuelTime(ItemStack.of(n)) === 300) && recipes.fuelTime(ItemStack.of('stonecutter')) === 0);
check('brewing stand item is flat', ITEMS.get('brewing_stand')?.texture === 'brewing_stand');
for (const n of ['item.book.put', 'item.book.page_turn']) {
  const g = synth.SOUNDS[n];
  let ok = !!g;
  if (g) for (let v = 0; v < g.variants; v++) {
    const pcm = g.generate(v, 22050);
    let peak = 0;
    for (const x of pcm) peak = Math.max(peak, Math.abs(x));
    ok &&= pcm.length > 2000 && peak > 0.3;
  }
  check(`sound ${n}`, ok);
}

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

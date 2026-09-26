// Headless checks for the stonecutter's menu (node tests/menus/stonecutter.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/item/item.ts', '/src/entity/player.ts', '/src/inventory/stonecutterMenu.ts', '/src/inventory/stonecutting.ts', '/src/game/villageBlocks.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, itemMod, playerMod, menuMod, sc] = mods;
const { S } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
let sounds = [];
level.sound = { play: (n) => sounds.push(n), playUI() {} };
level.setBlock(0, 64, 0, S('stonecutter'));
const player = new playerMod.Player(level);
player.moveTo(0.5, 64, -2.5, 0, 0);
const inv = player.inventory;

console.log('recipes:', sc.STONECUTTING.length);
const list = (id) => sc.stonecuttingRecipesFor(ItemStack.of(id)).map((r) => r.result + (r.count > 1 ? 'x' + r.count : '')).join(' ');
console.log('stone ->', list('stone'));
console.log('cobbled_deepslate ->', list('cobbled_deepslate'));
check('stone lists 7, in description-id order', list('stone') === 'chiseled_stone_bricks stone_brick_slabx2 stone_brick_stairs stone_brick_wall stone_bricks stone_slabx2 stone_stairs');
check('dirt lists nothing', list('dirt') === '');

const m = new menuMod.StonecutterMenu(player, [0, 64, 0]);
let heard = 0;
m.slotUpdateListener = () => heard++;
check('38 slots (input, result, 36 inventory)', m.slots.length === 38);
inv.main[0] = ItemStack.of('stone', 10);
// shift-click the stone into the input
m.clicked(29, 0, 'quick_move');
check('shift-click moves stone into the input', m.slots[0].item?.count === 10 && !inv.main[0] && heard > 0);
check('recipes listed, none picked', m.numRecipes() === 7 && m.selectedRecipeIndex === -1 && !m.slots[1].hasItem());
m.clickMenuButton(5); // stone_slab x2
check('pick stone slab: result 2 slabs', m.slots[1].item?.item.id === 'stone_slab' && m.slots[1].item?.count === 2);
m.clickMenuButton(40);
check('an empty spot changes nothing', m.selectedRecipeIndex === 5);
// take one result by clicking
sounds = [];
m.clicked(1, 0, 'pickup');
check('taken: carried 2 slabs, one stone used, result ready again', m.carried?.count === 2 && m.slots[0].item?.count === 9 && m.slots[1].item?.count === 2);
check('the saw sounds', sounds.join() === 'ui.stonecutter.take_result', sounds.join());
// a right click takes the whole result too (ResultContainer)
m.carried = null;
m.clicked(1, 1, 'pickup');
check('right click takes both slabs', m.carried?.count === 2 && m.slots[0].item?.count === 8);
m.carried = null;
// shift-click the result: cuts all of the input
sounds = [];
for (let i = 0; i < 36; i++) inv.main[i] = null;
level.gameTime++;
m.clicked(1, 0, 'quick_move');
const slabs = inv.main.reduce((n, s) => n + (s?.item.id === 'stone_slab' ? s.count : 0), 0);
check('shift-click cuts all 8 stone into 16 slabs', slabs === 16 && !m.slots[0].hasItem() && !m.slots[1].hasItem(), `slabs ${slabs}`);
check('one sound for the lot', sounds.length === 1, sounds.join());
check('empty input resets the list', m.numRecipes() === 0 && m.selectedRecipeIndex === -1 && !m.hasInputItem());
// a different stone type resets the choice; the same one keeps it
m.slots[0].set(ItemStack.of('andesite', 3));
m.clickMenuButton(0);
const pick = m.slots[1].item?.item.id;
m.slots[0].set(ItemStack.of('andesite', 5));
check('same item, more of it: choice kept', m.selectedRecipeIndex === 0 && m.slots[1].item?.item.id === pick, pick);
m.slots[0].set(ItemStack.of('granite', 5));
check('another block: choice cleared', m.selectedRecipeIndex === -1 && !m.slots[1].hasItem() && m.numRecipes() === 6);
// shift-click from the inventory: a block with no recipe goes hotbar <-> inventory
inv.main[9] = ItemStack.of('dirt', 4);
m.clicked(2, 0, 'quick_move');
check('dirt goes from the inventory to the hotbar', !inv.main[9] && inv.main.slice(0, 9).some((s) => s?.item.id === 'dirt'));
// closing: the input comes back, the result is gone
m.clickMenuButton(1);
m.removed();
check('closing gives the granite back', inv.main.some((s) => s?.item.id === 'granite' && s.count === 5) && !m.slots[0].hasItem() && !m.slots[1].hasItem());
check('still valid near the block', m.stillValid(player));
level.setBlock(0, 64, 0, 0);
check('not once it is gone', !m.stillValid(player));
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

// Headless checks for the smithing table's menu (node tests/menus/smithing.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/item/item.ts', '/src/entity/player.ts', '/src/inventory/smithingMenu.ts', '/src/inventory/smithing.ts', '/src/inventory/recipes.ts',
  '/src/game/villageBlocks.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, itemMod, playerMod, menuMod, sm, rec] = mods;
const { S } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
let sounds = [];
level.sound = { play: (n, x, y, z, v, p) => sounds.push([n, p]), playUI() {} };
level.setBlock(0, 64, 0, S('smithing_table'));
const player = new playerMod.Player(level);
player.moveTo(0.5, 64, -2.5, 0, 0);
const inv = player.inventory;

console.log('smithing recipes:', sm.SMITHING.length);
check('nine netherite upgrades', sm.SMITHING.length === 9);
const copy = rec.RECIPES.find((r) => r.result === 'netherite_upgrade_smithing_template');
check('the template copies: 7 diamonds, netherrack and a template make 2', !!copy && copy.count === 2 && copy.pattern.join('|') === '#S#|#C#|###');

const m = new menuMod.SmithingMenu(player, [0, 64, 0]);
let results = [];
m.onResultChanged = (s) => results.push(s?.item.id ?? null);
check('40 slots (3 inputs, result, 36 inventory)', m.slots.length === 40);
// a worn, enchanted, named diamond sword
const sword = ItemStack.of('diamond_sword');
sword.damage = 321;
sword.tag = { customName: 'Old Faithful', enchantments: { sharpness: 3 } };
inv.main[9] = ItemStack.of('netherite_upgrade_smithing_template', 3);
inv.main[10] = sword;
inv.main[11] = ItemStack.of('netherite_ingot', 5);
inv.main[12] = ItemStack.of('dirt', 4);
// shift-clicks from the inventory (slots 4.. are inventory rows 9..35, 31..39 the hotbar)
const invSlot = (i) => 4 + (i - 9);
m.clicked(invSlot(9), 0, 'quick_move');
check('shift-click: template to its slot', m.slots[0].item?.item.id === 'netherite_upgrade_smithing_template' && m.slots[0].item.count === 3);
m.clicked(invSlot(10), 0, 'quick_move');
check('shift-click: the sword to the base slot', m.slots[1].item?.item.id === 'diamond_sword');
check('no result yet', !m.slots[3].hasItem());
m.clicked(invSlot(11), 0, 'quick_move');
check('shift-click: the ingots to the addition slot', m.slots[2].item?.count === 5);
const r = m.slots[3].item;
check('result: a netherite sword', r?.item.id === 'netherite_sword', r?.item.id);
check('it keeps the wear, the name and the enchantments', r?.damage === 321 && r?.tag?.customName === 'Old Faithful' && r?.tag?.enchantments?.sharpness === 3);
check('the screen heard the result', results.at(-1) === 'netherite_sword');
m.clicked(invSlot(12), 0, 'quick_move');
check('dirt goes to the hotbar', !inv.main[12] && inv.main.slice(0, 9).some((s) => s?.item.id === 'dirt'));
// take it
sounds = [];
m.clicked(3, 0, 'pickup');
check('taken: one template and one ingot used, the sword gone', m.carried?.item.id === 'netherite_sword' && m.slots[0].item?.count === 2 && m.slots[2].item?.count === 4 && !m.slots[1].hasItem());
check('the smithing table clinks', sounds.length === 1 && sounds[0][0] === 'block.smithing_table.use' && sounds[0][1] >= 0.9 && sounds[0][1] < 1.0, JSON.stringify(sounds));
check('no result left', !m.slots[3].hasItem() && results.at(-1) === null);
m.carried = null;
// a chestplate through shift-click on the result
const chest = ItemStack.of('diamond_chestplate');
m.slots[1].set(chest);
sounds = [];
m.clicked(3, 0, 'quick_move');
check('shift-click the result: a netherite chestplate in the inventory', inv.main.some((s) => s?.item.id === 'netherite_chestplate') && !m.slots[1].hasItem() && m.slots[0].item?.count === 1 && m.slots[2].item?.count === 3);
check('one clink', sounds.length === 1);
// placing: only what a recipe takes
check('a stick is no template', !m.slots[0].mayPlace(ItemStack.of('stick')));
check('an iron sword is no base', !m.slots[1].mayPlace(ItemStack.of('iron_sword')));
check('a diamond is no addition', !m.slots[2].mayPlace(ItemStack.of('diamond')));
// closing gives the inputs back
m.slots[1].set(ItemStack.of('diamond_hoe'));
m.removed();
check('closing gives back the template, ingots and hoe', inv.main.some((s) => s?.item.id === 'netherite_upgrade_smithing_template' && s.count === 1) && inv.main.some((s) => s?.item.id === 'netherite_ingot' && s.count === 3) && inv.main.some((s) => s?.item.id === 'diamond_hoe') && !m.slots[0].hasItem());
check('still valid near the table', m.stillValid(player));
level.setBlock(0, 64, 0, 0);
check('not once it is gone', !m.stillValid(player));
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

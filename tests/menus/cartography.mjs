// Headless checks for the cartography table's menu (node tests/menus/cartography.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/item/item.ts', '/src/entity/player.ts', '/src/inventory/cartographyMenu.ts', '/src/game/maps.ts', '/src/game/mapData.ts',
  '/src/item/hoverText.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, itemMod, playerMod, cm, maps, md, ht] = mods;
const { S } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
let sounds = [];
level.sound = { play: (n, x, y, z, v, p) => sounds.push([n, x, y, z, v, p]), playUI() {} };
level.setBlock(0, 64, 0, S('cartography_table'));
const player = new playerMod.Player(level);
player.moveTo(0.5, 64, -2.5, 0, 0);
const inv = player.inventory;
for (let i = 0; i < 36; i++) inv.main[i] = null;
const n = (id, c = 1) => ItemStack.of(id, c);
const store = md.mapStorage(level);
const map0 = maps.createMap(level, 0, 0, 0, true, false);
const d0 = store.get(0);
d0.colors.fill(5);
const mapOf = (s) => store.get(s.tag.mapId);

const m = new cm.CartographyTableMenu(player, [0, 64, 0]);
check('slots: map, paper/map/glass, result, then 36 of the inventory', m.slots.length === 39 && m.mapSlot.x === 15 && m.mapSlot.y === 15 && m.additionalSlot.y === 52 && m.resultSlot.x === 145 && m.resultSlot.y === 39);
check('the slots take only their own', m.mapSlot.mayPlace(map0) && !m.mapSlot.mayPlace(n('map')) && m.additionalSlot.mayPlace(n('paper')) && m.additionalSlot.mayPlace(n('map')) && m.additionalSlot.mayPlace(n('glass_pane')) && !m.additionalSlot.mayPlace(n('glass')) && !m.resultSlot.mayPlace(map0));
m.mapSlot.set(map0.copyWithCount(3));
check('a map alone: nothing', !m.resultSlot.item);
m.additionalSlot.set(n('paper', 2));
let r = m.resultSlot.item;
check('with paper: the map, to be zoomed out', r?.item.id === 'filled_map' && r.count === 1 && r.tag.mapId === 0 && r.tag.mapPostProcessing === 'scale');
m.additionalSlot.set(n('glass_pane', 2));
r = m.resultSlot.item;
check('with a glass pane: the map, to be locked', r?.count === 1 && r.tag.mapPostProcessing === 'lock');
check('its tooltip says so', JSON.stringify(ht.hoverText(r)) === JSON.stringify(['§7Id #0', '§7Locked']));
m.additionalSlot.set(n('map', 2));
r = m.resultSlot.item;
check('with an empty map: two of it', r?.count === 2 && r.tag.mapId === 0 && !r.tag.mapPostProcessing);
m.additionalSlot.set(null);
check('the second slot emptied: the result goes', !m.resultSlot.item);

// taking: a zoomed-out copy
m.additionalSlot.set(n('paper', 2));
sounds = [];
m.clicked(2, 0, 'pickup');
const zoomed = m.carried;
check('taken: a new map (id 1), a step further out, of the same place', zoomed?.tag?.mapId === 1 && !zoomed.tag.mapPostProcessing && mapOf(zoomed).scale === 1 && mapOf(zoomed).centerX === 64 && mapOf(zoomed).colors.every((c) => c === 0));
check('one map and one paper used', m.mapSlot.item?.count === 2 && m.additionalSlot.item?.count === 1);
check('the table\'s sound, at the table', sounds.length === 1 && sounds[0][0] === 'ui.cartography_table.take_result' && sounds[0][1] === 0.5 && sounds[0][2] === 64.5 && sounds[0][4] === 1 && sounds[0][5] === 1, JSON.stringify(sounds));
check('the next one is ready', m.resultSlot.item?.tag?.mapPostProcessing === 'scale');
check('the original map untouched', d0.scale === 0 && !d0.locked);
m.carried = null;
// locking
m.additionalSlot.set(n('glass_pane', 1));
level.gameTime++;
m.clicked(2, 0, 'pickup');
const locked = m.carried;
check('locked: a new map (id 2), a locked copy of the picture', locked?.tag?.mapId === 2 && mapOf(locked).locked && mapOf(locked).colors.every((c) => c === 5) && !locked.tag.mapPostProcessing);
check('the glass pane used, the result gone with it', !m.additionalSlot.item && !m.resultSlot.item);
m.carried = null;
// a locked map can't be locked again or zoomed out, but can be copied
m.mapSlot.set(locked.copy());
m.additionalSlot.set(n('paper'));
check('a locked map with paper: nothing', !m.resultSlot.item);
m.additionalSlot.set(n('glass_pane'));
check('...with a glass pane: nothing', !m.resultSlot.item);
m.additionalSlot.set(n('map'));
check('...with an empty map: two', m.resultSlot.item?.count === 2 && m.resultSlot.item.tag.mapId === 2);
// as far out as it goes
const far = maps.createMap(level, 0, 0, 4, true, false);
m.mapSlot.set(far);
m.additionalSlot.set(n('paper'));
check('a map at scale 4 with paper: nothing', !m.resultSlot.item);
// shift-clicking copies: as many as the inputs allow, one sound
m.mapSlot.set(map0.copyWithCount(3));
m.additionalSlot.set(n('map', 2));
for (let i = 0; i < 36; i++) inv.main[i] = null;
sounds = [];
level.gameTime++;
m.clicked(2, 0, 'quick_move');
const copies = inv.main.filter((s) => s?.tag?.mapId === 0).reduce((a, s) => a + s.count, 0);
check('shift-clicked: four copies, until the empty maps ran out', copies === 4 && m.mapSlot.item?.count === 1 && !m.additionalSlot.item && !m.resultSlot.item, `${copies} ${m.mapSlot.item?.count}`);
check('...with one sound', sounds.length === 1);
// shift-clicking in
m.mapSlot.set(null);
for (let i = 0; i < 36; i++) inv.main[i] = null;
inv.main[9] = map0.copy();
inv.main[10] = n('paper', 5);
inv.main[11] = n('stone', 3);
inv.main[0] = n('glass_pane', 4);
const idx = (s) => (s < 9 ? 30 + s : 3 + s - 9);
m.clicked(idx(9), 0, 'quick_move');
m.clicked(idx(10), 0, 'quick_move');
check('shift-click: the map and the paper to their slots', m.mapSlot.item?.tag?.mapId === 0 && m.additionalSlot.item?.item.id === 'paper' && m.resultSlot.item?.tag?.mapPostProcessing === 'scale');
m.clicked(idx(0), 0, 'quick_move');
check('...a glass pane won\'t go on the paper: stays', inv.main[0]?.item.id === 'glass_pane' && m.additionalSlot.item?.item.id === 'paper');
m.clicked(idx(11), 0, 'quick_move');
check('anything else: inventory to hotbar', inv.main[1]?.item.id === 'stone' && !inv.main[11]);
check('the result isn\'t gathered up by a double click', m.canTakeItemForPickAll(m.resultSlot.item, m.resultSlot) === false && m.canTakeItemForPickAll(null, m.mapSlot) === true);
check('valid near the table', m.stillValid(player));
player.moveTo(20.5, 64, 0.5, 0, 0);
check('not 20 blocks away', !m.stillValid(player));
player.moveTo(0.5, 64, -2.5, 0, 0);
// closing
const before = store.lastId;
m.removed();
check('closed: the map and paper back to the player', inv.main.some((s) => s?.tag?.mapId === 0 && !s.tag.mapPostProcessing) && inv.main.some((s) => s?.item.id === 'paper' && s.count === 5) && !m.mapSlot.item && !m.additionalSlot.item);
check('no zoomed map handed out, no id used', !inv.main.some((s) => s?.tag?.mapPostProcessing) && store.lastId === before && !m.resultSlot.item);
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

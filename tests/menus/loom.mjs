// Headless checks for the loom's menu (node tests/menus/loom.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/item/item.ts', '/src/entity/player.ts', '/src/inventory/loomMenu.ts', '/src/world/bannerPatterns.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, itemMod, playerMod, lm, bp] = mods;
const { S } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
let sounds = [];
level.sound = { play: (n, x, y, z, v, p) => sounds.push([n, v, p]), playUI() {} };
level.setBlock(0, 64, 0, S('loom'));
const player = new playerMod.Player(level);
player.moveTo(0.5, 64, -2.5, 0, 0);
const inv = player.inventory;
for (let i = 0; i < 36; i++) inv.main[i] = null;
const n = (id, c = 1) => ItemStack.of(id, c);

const m = new lm.LoomMenu(player, [0, 64, 0]);
let heard = 0;
m.slotUpdateListener = () => heard++;
check('slots: banner, dye, pattern, result, then 36 of the inventory', m.slots.length === 40 && m.bannerSlot.x === 13 && m.dyeSlot.x === 33 && m.patternSlot.y === 45 && m.resultSlot.x === 143 && m.resultSlot.y === 58);
check('the slots take only their own', m.bannerSlot.mayPlace(n('white_banner')) && !m.bannerSlot.mayPlace(n('white_wool')) && m.dyeSlot.mayPlace(n('red_dye')) && !m.dyeSlot.mayPlace(n('red_banner')) && m.patternSlot.mayPlace(n('globe_banner_pattern')) && !m.patternSlot.mayPlace(n('paper')) && !m.resultSlot.mayPlace(n('white_banner')));
check('empty slots show their icons', m.bannerSlot.noItemIcon() === 'slot_banner' && m.dyeSlot.noItemIcon() === 'slot_dye' && m.patternSlot.noItemIcon() === 'slot_banner_pattern');
m.bannerSlot.set(n('white_banner', 3));
check('a banner alone: nothing on offer', m.selectablePatterns.length === 0 && !m.resultSlot.item && heard > 0);
m.dyeSlot.set(n('red_dye', 2));
check('a banner and a dye: the 34 patterns, none picked', m.selectablePatterns.length === 34 && m.selectedBannerPatternIndex === -1 && !m.resultSlot.item);
check('in the loom\'s order', m.selectablePatterns[0] === 'square_bottom_left' && m.selectablePatterns[33] === 'bricks');
check('a pick out of range does nothing', m.clickMenuButton(40) === false && m.selectedBannerPatternIndex === -1);
check('pick the fifth: stripe_bottom', m.clickMenuButton(4) && m.selectedBannerPatternIndex === 4);
let r = m.resultSlot.item;
check('the result: one white banner with a red base', r?.item.id === 'white_banner' && r.count === 1 && r.tag?.patterns?.length === 1 && r.tag.patterns[0].pattern === 'stripe_bottom' && r.tag.patterns[0].color === 'red', JSON.stringify(r?.tag));
sounds = [];
m.clicked(3, 0, 'pickup');
check('taken: in hand', m.carried?.tag?.patterns?.[0]?.pattern === 'stripe_bottom');
check('one banner and one dye used', m.bannerSlot.item?.count === 2 && m.dyeSlot.item?.count === 1);
check('the pick stays, the next one is ready', m.selectedBannerPatternIndex === 4 && m.resultSlot.item?.tag?.patterns?.[0]?.pattern === 'stripe_bottom');
check('the loom sounds', sounds.length === 1 && sounds[0][0] === 'ui.loom.take_result' && sounds[0][1] === 1 && sounds[0][2] === 1, JSON.stringify(sounds));
inv.main[20] = m.carried;
m.carried = null;
// shift-clicking the result takes as many as the dye allows (one left), sounding once a tick
sounds = [];
m.clicked(3, 0, 'pickup');
check('taken again in the same tick: no second sound', sounds.length === 0 && m.carried?.count === 1);
check('the dye ran out: the pick forgotten', m.selectedBannerPatternIndex === -1 && !m.resultSlot.item && !m.dyeSlot.item);
inv.main[21] = m.carried;
m.carried = null;
m.dyeSlot.set(n('red_dye', 1));
m.bannerSlot.set(n('white_banner', 2));
m.clickMenuButton(4);
level.gameTime++;
m.clicked(3, 0, 'quick_move');
const woven = inv.main.filter((s) => s?.item.id === 'white_banner' && s.tag?.patterns?.length === 1);
check('shift-click: the last dye used, into the inventory', !m.dyeSlot.item && m.bannerSlot.item?.count === 1 && woven.reduce((a, s) => a + s.count, 0) === 3, JSON.stringify(inv.main.filter(Boolean).map((s) => [s.item.id, s.count])));
check('the dye gone: nothing picked, no result', m.selectedBannerPatternIndex === -1 && !m.resultSlot.item && m.selectablePatterns.length === 0);
check('one sound for the shift-click, a tick later', sounds.length === 1);
// several at once: one sound
m.bannerSlot.set(n('white_banner', 5));
m.dyeSlot.set(n('red_dye', 3));
m.clickMenuButton(4);
sounds = [];
level.gameTime++;
m.clicked(3, 0, 'quick_move');
check('shift-click with three dyes: three woven, one sound', m.bannerSlot.item?.count === 2 && !m.dyeSlot.item && sounds.length === 1, `${m.bannerSlot.item?.count} ${sounds.length}`);
m.bannerSlot.set(n('white_banner', 1));
// a pattern item offers just its pattern, picked for you
m.dyeSlot.set(n('blue_dye', 4));
m.clickMenuButton(10);
m.patternSlot.set(n('globe_banner_pattern'));
check('a globe pattern: the globe alone, picked', m.selectablePatterns.length === 1 && m.selectablePatterns[0] === 'globe' && m.selectedBannerPatternIndex === 0 && m.resultSlot.item?.tag?.patterns?.[0]?.pattern === 'globe');
m.patternSlot.set(null);
check('taken out again: the list is back, the pick forgotten', m.selectablePatterns.length === 34 && m.selectedBannerPatternIndex === -1 && !m.resultSlot.item);
m.clickMenuButton(24);
m.dyeSlot.set(n('black_dye', 4));
check('another dye keeps the pick, recoloured', m.selectedBannerPatternIndex === 24 && m.resultSlot.item?.tag?.patterns?.[0]?.color === 'black' && m.resultSlot.item.tag.patterns[0].pattern === 'rhombus');
// six layers is the loom's limit
const full = n('white_banner');
full.tag = { patterns: ['stripe_top', 'stripe_bottom', 'cross', 'border', 'circle', 'bricks'].map((p) => ({ pattern: p, color: 'red' })) };
m.bannerSlot.set(full);
check('a banner of six layers: no result, no pick', !m.resultSlot.item && m.selectedBannerPatternIndex === -1);
check('(the menu itself would still weave on a pick, as vanilla\'s; the screen shows no patterns to pick)', m.clickMenuButton(0) === true && !!m.resultSlot.item);
full.tag.patterns.pop();
m.bannerSlot.set(full);
m.clickMenuButton(2);
check('five layers: a sixth goes on', m.resultSlot.item?.tag?.patterns?.length === 6);
// shift-clicking from the inventory
m.bannerSlot.set(null);
m.dyeSlot.set(null);
for (let i = 0; i < 36; i++) inv.main[i] = null;
inv.main[9] = n('lime_banner', 2);
inv.main[10] = n('green_dye', 5);
inv.main[11] = n('flower_banner_pattern');
inv.main[12] = n('stone', 10);
inv.main[0] = n('stick', 3);
const idx = (invSlot) => (invSlot < 9 ? 31 + invSlot : 4 + invSlot - 9);
m.clicked(idx(9), 0, 'quick_move');
m.clicked(idx(10), 0, 'quick_move');
m.clicked(idx(11), 0, 'quick_move');
check('shift-click: banner, dye and pattern to their slots', m.bannerSlot.item?.item.id === 'lime_banner' && m.dyeSlot.item?.item.id === 'green_dye' && m.patternSlot.item?.item.id === 'flower_banner_pattern');
check('...and the flower picked for you', m.resultSlot.item?.tag?.patterns?.[0]?.pattern === 'flower');
m.clicked(idx(12), 0, 'quick_move');
check('anything else: inventory to hotbar', inv.main[1]?.item.id === 'stone' && !inv.main[12]);
m.clicked(idx(0), 0, 'quick_move');
check('and hotbar to inventory', !inv.main[0] && inv.main.slice(9).some((s) => s?.item.id === 'stick'));
m.clicked(1, 0, 'quick_move');
check('the dye back to the inventory', !m.dyeSlot.item && inv.main.some((s) => s?.item.id === 'green_dye'));
// still valid only near the loom
check('valid near the loom', m.stillValid(player));
player.moveTo(20.5, 64, 0.5, 0, 0);
check('not 20 blocks away', !m.stillValid(player));
player.moveTo(0.5, 64, -2.5, 0, 0);
// closing gives back the inputs (the result was a preview)
m.dyeSlot.set(n('green_dye', 1));
m.removed();
check('closed: banner, dye and pattern back to the player', inv.main.some((s) => s?.item.id === 'lime_banner') && inv.main.some((s) => s?.item.id === 'flower_banner_pattern') && !m.bannerSlot.item && !m.patternSlot.item);
check('no woven banner handed out', !inv.main.some((s) => s?.item.id === 'lime_banner' && s.tag?.patterns));
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

// Headless checks for maps (node tests/menus/maps.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/item/item.ts', '/src/entity/player.ts', '/src/game/maps.ts', '/src/game/mapData.ts', '/src/world/mapColors.ts',
  '/src/item/hoverText.ts', '/src/inventory/customRecipes.ts', '/src/inventory/menus.ts', '/src/world/dimension.ts', '/src/game/itemBehavior.ts',
  '/src/render/mapRenderer.ts', '/src/textures/mapTextures.ts', '/src/textures/font.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, itemMod, playerMod, maps, md, mc, ht, cr, menus, dims, ib, mr, mt, font] = mods;
const { S } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

// a flat world, x and z -80..79: grass on dirt on stone, with a few things to see
function makeWorld(dim) {
  const world = new worldMod.World();
  if (dim) world.dim = dim;
  for (let cx = -5; cx <= 4; cx++) for (let cz = -5; cz <= 4; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
  return world;
}
function fill(world, x, z, top, below, fromY, toY) {
  const c = world.getChunk(x >> 4, z >> 4);
  for (let y = fromY; y <= toY; y++) c.setState(x & 15, y, z & 15, y === toY ? top : below);
}
function setCol(world, x, z, list) {
  // list: [y, state] pairs, rest of 48..70 air
  const c = world.getChunk(x >> 4, z >> 4);
  for (let y = 40; y <= 70; y++) c.setState(x & 15, y, z & 15, 0);
  for (const [y, st] of list) c.setState(x & 15, y, z & 15, st);
}
const world = makeWorld();
const STONE = S('stone'), DIRT = S('dirt'), GRASS = S('grass_block'), WATER = S('water');
for (let x = -80; x < 80; x++) for (let z = -80; z < 80; z++) {
  const c = world.getChunk(x >> 4, z >> 4);
  for (let y = 48; y <= 63; y++) c.setState(x & 15, y, z & 15, y === 63 ? GRASS : y >= 60 ? DIRT : STONE);
}
const col = (x, z, top, depthTo, under) => setCol(world, x, z, [...Array.from({ length: 64 - depthTo }, (_, i) => [depthTo + i, top]), [depthTo - 1, under]]);
for (let x = 20; x <= 25; x++) for (let z = -10; z <= -5; z++) col(x, z, WATER, 62, DIRT);
for (let x = 30; x <= 35; x++) for (let z = -10; z <= -5; z++) col(x, z, WATER, 50, STONE);
for (let x = 40; x <= 45; x++) for (let z = -10; z <= -5; z++) col(x, z, WATER, 58, STONE);
for (let x = -30; x <= -20; x++) for (let z = -30; z <= -20; z++) setCol(world, x, z, [[62, DIRT], [63, DIRT], [64, DIRT], [65, DIRT], [66, GRASS]]);
world.getChunk(0, 0).setState(5, 64, 5, S('glass'));
world.getChunk(0, 0).setState(6, 64, 5, S('short_grass'));
setCol(world, 50, 50, [[62, STONE], [63, S('lava')]]);
for (let x = 0; x <= 3; x++) for (let z = 60; z <= 63; z++) setCol(world, x, z, []);

const level = new levelMod.Level(world, 'test');
let sounds = [];
level.sound = { play: (n, x, y, z, v, p) => sounds.push([n, v, p, x, z]), playUI() {} };
level.particles = { blockBreak() {}, spawn() {} };
const player = new playerMod.Player(level);
player.moveTo(10.5, 64, 20.5, 0, 0);
player.gameMode = 'survival';
const inv = player.inventory;
for (let i = 0; i < 36; i++) inv.main[i] = null;
const use = (stack) => { inv.main[inv.selected] = stack; inv.activeHand = 'main'; return ib.itemBehaviorOf(stack.item.id).use(level, player, stack); };

// using an empty map
sounds = [];
const r = use(ItemStack.of('map', 3));
check('using an empty map works', r === 'success');
check('one empty map used', inv.main[0]?.item.id === 'map' && inv.main[0].count === 2);
const made = inv.main.find((s) => s?.item.id === 'filled_map');
check('a filled map with id 0 goes into the inventory', made && made.tag?.mapId === 0 && made.count === 1);
check('the cartography table\'s sound, at the player', sounds.length === 1 && sounds[0][0] === 'ui.cartography_table.take_result' && sounds[0][1] === 1 && sounds[0][2] === 1 && sounds[0][3] === player.x, JSON.stringify(sounds));
const store = md.mapStorage(level);
const d0 = store.get(0);
check('its data: centred on the grid (0, 0), scale 0, the overworld, tracking, not unlimited, unlocked', d0 && d0.centerX === 0 && d0.centerZ === 0 && d0.scale === 0 && d0.dimension === 'overworld' && d0.trackingPosition && !d0.unlimitedTracking && !d0.locked);
check('nothing drawn yet', d0.colors.every((c) => c === 0));
inv.main[0].count = 1;
use(inv.main[0]);
check('the last empty map: the filled one (id 1) takes its place in the hand', inv.main[0]?.item.id === 'filled_map' && inv.main[0].tag?.mapId === 1);
player.gameMode = 'creative';
const blank = ItemStack.of('map', 1);
inv.selected = 4;
use(blank);
check('creative: the empty map stays, the new one (id 2) goes in the inventory', inv.main[4] === blank && blank.count === 1 && inv.main.some((s) => s?.tag?.mapId === 2));
player.gameMode = 'survival';
check('the ids run on: last id 2', store.lastId === 2);
// centring
const far = md.MapItemSavedData.createFresh(-65, 200, 0, true, false, 'overworld');
check('centres snap to the scale\'s grid (-65, 200 at scale 0 → -128, 256)', far.centerX === -128 && far.centerZ === 256, `${far.centerX} ${far.centerZ}`);
const far2 = md.MapItemSavedData.createFresh(300, -1, 2, true, false, 'overworld');
check('...and at scale 2 (300, -1 → 192, 192: the cell -64..447)', far2.centerX === 192 && far2.centerZ === 192, `${far2.centerX} ${far2.centerZ}`);

// drawing: hold map 0 and let the inventory tick
for (let i = 0; i < 36; i++) inv.main[i] = null;
inv.selected = 0;
inv.main[0] = made;
for (let t = 0; t < 20; t++) inv.tick(player);
const px = (d, bx, bz) => d.colors[(bx - d.centerX + 64) + (bz - d.centerZ + 64) * 128];
const P = (c, b) => (c << 2) | b;
check('held: the ground under the player is grass, flat (normal)', px(d0, 10, 20) === P(1, 1), px(d0, 10, 20));
check('the whole map is drawn (within 128 blocks)', d0.colors.every((c) => c !== 0), d0.colors.filter((c) => c === 0).length);
check('glass is looked through', px(d0, 5, 5) === P(1, 1), px(d0, 5, 5));
check('grass on top shows as plants, a step up (bright)', px(d0, 6, 5) === P(7, 2), px(d0, 6, 5));
check('...and the pixel south of it a step down (dark)', px(d0, 6, 6) === P(1, 0), px(d0, 6, 6));
check('shallow water (2 deep): bright', [20, 21, 22].every((x) => px(d0, x, -7) === P(12, 2)), [20, 21, 22].map((x) => px(d0, x, -7)).join());
check('water 6 deep: normal', [40, 41, 42].every((x) => px(d0, x, -7) === P(12, 1)), [40, 41, 42].map((x) => px(d0, x, -7)).join());
check('water 14 deep: dark', [30, 31, 32].every((x) => px(d0, x, -7) === P(12, 0)), [30, 31, 32].map((x) => px(d0, x, -7)).join());
check('lava shows as fire', px(d0, 50, 50) === P(4, 1), px(d0, 50, 50));
check('a hill\'s north edge is bright, its south edge dark', px(d0, -25, -30) === P(1, 2) && px(d0, -25, -19) === P(1, 0), `${px(d0, -25, -30)} ${px(d0, -25, -19)}`);
check('an empty column shows bedrock (stone), dark after the ground', px(d0, 1, 60) === P(11, 0) && (px(d0, 1, 61) >> 2) === 11, `${px(d0, 1, 60)} ${px(d0, 1, 61)}`);
check('the colours check out', mc.colorFromPackedId(P(1, 1)) === 0xff6d9930 >>> 0 && mc.colorFromPackedId(0) === 0, mc.colorFromPackedId(P(1, 1)).toString(16));
// the player's marker
let dec = [...d0.decorations.values()];
check('the player is marked: at (21, 41) half-pixels, facing south (0)', dec.length === 1 && dec[0].type === 'player' && dec[0].x === 21 && dec[0].y === 41 && dec[0].rot === 0, JSON.stringify(dec));
player.yaw = 90;
inv.tick(player);
dec = [...d0.decorations.values()];
check('facing west: a quarter turn (4)', dec[0].rot === 4, JSON.stringify(dec));
player.yaw = -135;
inv.tick(player);
check('facing north-east: -6', [...d0.decorations.values()][0].rot === -6, JSON.stringify([...d0.decorations.values()]));
player.yaw = 0;
player.moveTo(100.5, 64, 20.5, 0, 0);
inv.tick(player);
dec = [...d0.decorations.values()];
check('off the map (within 320): a dot on its east edge', dec[0].type === 'player_off_map' && dec[0].x === 127 && dec[0].y === 41 && dec[0].rot === 0, JSON.stringify(dec));
player.moveTo(-500.5, 64, 20.5, 0, 0);
inv.tick(player);
check('far off a map that doesn\'t track without limit: no marker', d0.decorations.size === 0);
const unl = new md.MapItemSavedData(0, 0, 0, true, true, false, 'overworld');
unl.addDecoration('player', level, 'p', -500.5, 20.5, 0, null);
dec = [...unl.decorations.values()];
check('...one that does: the smaller dot on its west edge', dec[0].type === 'player_off_limits' && dec[0].x === -128);
player.moveTo(10.5, 64, 20.5, 0, 0);
// only the hands draw
const before = d0.colorVersion;
world.getChunk(0, 1).setState(10, 63, 4, S('stone'));
inv.main[0] = null;
inv.main[3] = made;
for (let t = 0; t < 20; t++) inv.tick(player);
check('in another hotbar slot: marked, but not drawn', d0.colorVersion === before && d0.decorations.size === 1);
inv.main[3] = null;
inv.offhand = made;
for (let t = 0; t < 20; t++) inv.tick(player);
check('in the off hand: drawn (the stone shows)', (px(d0, 10, 20) >> 2) === 11 && d0.colorVersion > before);
inv.offhand = null;
inv.main[0] = made;
// the tooltip
check('tooltip: "Id #0"', JSON.stringify(ht.hoverText(made)) === JSON.stringify(['§7Id #0']), JSON.stringify(ht.hoverText(made)));
const renamed = made.copy();
renamed.tag.customName = 'Home';
check('renamed: no id line', JSON.stringify(ht.hoverText(renamed)) === '[]', JSON.stringify(ht.hoverText(renamed)));
// cloning
const grid = (items) => { const g = new Array(9).fill(null); items.forEach(([i, s]) => (g[i] = s)); return g; };
let res = cr.customRecipeFor(grid([[0, made], [4, ItemStack.of('map')], [8, ItemStack.of('map')]]), 3);
check('cloning: a filled map and two empty ones make three of it', res?.result.item.id === 'filled_map' && res.result.count === 3 && res.result.tag.mapId === 0);
check('...not in the 2×2 grid', cr.customRecipeFor([made, ItemStack.of('map'), null, null], 2) === null);
check('...nor with something else in', cr.customRecipeFor(grid([[0, made], [4, ItemStack.of('map')], [8, ItemStack.of('paper')]]), 3) === null);
check('...nor with two filled maps', cr.customRecipeFor(grid([[0, made], [1, made.copy()], [4, ItemStack.of('map')]]), 3) === null);
// extending
const ring = (map) => grid([0, 1, 2, 3, 5, 6, 7, 8].map((i) => [i, ItemStack.of('paper')]).concat([[4, map]]));
res = cr.customRecipeFor(ring(made), 3);
check('extending: a map ringed with paper, to be zoomed out when taken', res?.result.tag.mapId === 0 && res.result.tag.mapPostProcessing === 'scale' && res.result.count === 1);
const cm = new menus.CraftingMenu(player, [0, 64, 0]);
ring(made.copy()).forEach((s, i) => cm.craft.set(i, s));
check('the crafting table offers it', cm.result.items[0]?.tag?.mapPostProcessing === 'scale');
cm.clicked(0, 0, 'pickup');
const zoomed = cm.carried;
const dz = store.get(zoomed?.tag?.mapId);
check('taken: a new map (id 3) one step out, the same place, nothing drawn, no leftover order', zoomed?.tag?.mapId === 3 && !zoomed.tag.mapPostProcessing && dz?.scale === 1 && dz.centerX === 64 && dz.centerZ === 64 && dz.colors.every((c) => c === 0), `${zoomed?.tag?.mapId} ${dz?.scale} ${dz?.centerX} ${dz?.centerZ}`);
check('the paper and the map used up', cm.craft.items.every((s) => s === null));
cm.carried = null;
ring(made.copy()).forEach((s, i) => cm.craft.set(i, s));
cm.clicked(0, 0, 'quick_move');
const moved = inv.main.find((s) => s?.item.id === 'filled_map' && s.tag?.mapId !== 0);
check('shift-clicked: zoomed out too (id 4)', moved?.tag?.mapId === 4 && !moved.tag.mapPostProcessing && store.get(4)?.scale === 1, JSON.stringify(moved?.tag));
const big = ItemStack.of('filled_map');
big.tag = { mapId: store.freeMapId() };
store.set(big.tag.mapId, new md.MapItemSavedData(0, 0, 4, true, false, false, 'overworld'));
check('a map at scale 4 can\'t be zoomed out', cr.customRecipeFor(ring(big), 3) === null);
// locking
const toLock = made.copy();
toLock.tag.mapPostProcessing = 'lock';
check('about to be locked: the tooltip says so', JSON.stringify(ht.hoverText(toLock)) === JSON.stringify(['§7Id #0', '§7Locked']), JSON.stringify(ht.hoverText(toLock)));
maps.onCraftedPostProcess(toLock, level);
const dl = store.get(toLock.tag.mapId);
check('locked: a new map, a locked copy of the picture', toLock.tag.mapId === 6 && dl?.locked && dl.colors.every((c, i) => c === d0.colors[i]) && !toLock.tag.mapPostProcessing);
check('the locked map\'s tooltip', JSON.stringify(ht.hoverText(toLock)) === JSON.stringify(['§7Id #6', '§7Locked']));
inv.main[0] = toLock;
world.getChunk(0, 1).setState(11, 63, 4, S('stone'));
const lv = dl.colorVersion;
for (let t = 0; t < 20; t++) inv.tick(player);
check('a locked map doesn\'t draw', dl.colorVersion === lv && (px(dl, 11, 20) >> 2) === 1);
check('...but still marks its holder', dl.decorations.size === 1);
// saving
const saved = d0.save();
const back = md.MapItemSavedData.load(saved);
check('saved and loaded: the same map', back.centerX === d0.centerX && back.scale === 0 && back.dimension === 'overworld' && back.colors.every((c, i) => c === d0.colors[i]) && !back.locked && back.decorations.size === 0);
check('the scale is kept to 0..4 and short colours dropped', md.MapItemSavedData.load({ ...saved, scale: 9, colors: new Uint8Array(5) }).scale === 4 && md.MapItemSavedData.load({ ...saved, colors: new Uint8Array(5) }).colors.every((c) => c === 0));
check('dirty after drawing, for the save', d0.dirty);

// banner markers (vanilla MapItem.useOn → toggleBanner, checkBanners)
const useOn = (stack, x, y, z) => { inv.activeHand = 'main'; return ib.itemBehaviorOf('filled_map').useOn(level, player, stack, { x, y, z, face: 1, hx: x + 0.5, hy: y + 1, hz: z + 0.5 }); };
inv.main[0] = made;
inv.selected = 0;
level.setBlock(12, 64, 22, S('red_banner'));
check('used on anything else: nothing', useOn(made, 12, 63, 22) === 'pass');
player.swinging = false;
check('used on a banner: marked', useOn(made, 12, 64, 22) === 'success' && d0.bannerMarkers.has('banner-12,64,22') && player.swinging);
let bdec = d0.decorations.get('banner-12,64,22');
check('...a red banner marker at the block\'s middle (25, 45 half-pixels), turned half round (8), no name', bdec?.type === 'banner_red' && bdec.x === 25 && bdec.y === 45 && bdec.rot === 8 && bdec.name === null, JSON.stringify(bdec));
check('...counted with the player\'s', d0.trackedDecorationCount === 2, d0.trackedDecorationCount);
check('used again: unmarked', useOn(made, 12, 64, 22) === 'success' && !d0.bannerMarkers.size && !d0.decorations.has('banner-12,64,22') && d0.trackedDecorationCount === 1);
level.setBlock(14, 64, 22, S('light_blue_wall_banner'));
world.getBlockEntity(14, 64, 22).customName = 'Home';
useOn(made, 14, 64, 22);
bdec = d0.decorations.get('banner-14,64,22');
check('a named wall banner: its colour and name', bdec?.type === 'banner_light_blue' && bdec.name === 'Home', JSON.stringify(bdec));
useOn(made, 12, 64, 22);
check('two marked', d0.bannerMarkers.size === 2);
const idless = ItemStack.of('filled_map');
check('a map with no id used on a banner: still a success (vanilla), nothing marked', useOn(idless, 12, 64, 22) === 'success');
const elsewhere = maps.createMap(level, 1000, 0, 0, true, false);
check('a banner off the map: fails', useOn(elsewhere, 12, 64, 22) === 'fail' && !md.mapStorage(level).get(elsewhere.tag.mapId).bannerMarkers.size);
// saving keeps them (vanilla puts them back at the block's corner)
const bsaved = md.MapItemSavedData.load(d0.save());
const bback = bsaved.decorations.get('banner-14,64,22');
check('saved and loaded: marked again, a half pixel off (at the block\'s corner)', bsaved.bannerMarkers.size === 2 && bback?.type === 'banner_light_blue' && bback.x === 28 && bback.y === 44 && bback.rot === 8 && bback.name === 'Home' && bsaved.trackedDecorationCount === 2, JSON.stringify(bback));
// a locked copy keeps them, and can still be marked (vanilla doesn't check)
const lockedB = made.copy();
maps.lockMap(level, lockedB);
const dlb = store.get(lockedB.tag.mapId);
check('a locked copy keeps the markers', dlb.locked && dlb.bannerMarkers.size === 2 && dlb.decorations.has('banner-14,64,22'));
level.setBlock(16, 64, 22, S('black_banner'));
check('...and can still be marked', useOn(lockedB, 16, 64, 22) === 'success' && dlb.decorations.get('banner-16,64,22')?.type === 'banner_black');
// a banner changed or broken comes off as the map sweeps over it
world.getBlockEntity(14, 64, 22).customName = 'Away';
level.setBlock(12, 64, 22, 0);
for (let t = 0; t < 20; t++) inv.tick(player);
check('renamed or broken: unmarked as the map passes over', !d0.bannerMarkers.size && !d0.decorations.has('banner-12,64,22') && !d0.decorations.has('banner-14,64,22') && d0.trackedDecorationCount === 1, [...d0.bannerMarkers.keys()].join());
check('...but not from a locked map', dlb.bannerMarkers.size === 3);
// changed: the old mark replaced by the new
world.getBlockEntity(14, 64, 22).customName = undefined;
useOn(made, 14, 64, 22);
level.setBlock(14, 64, 22, 0);
level.setBlock(14, 64, 22, S('lime_wall_banner'));
check('a different banner in the same place: marked in its place, not unmarked', useOn(made, 14, 64, 22) === 'success' && d0.decorations.get('banner-14,64,22')?.type === 'banner_lime' && d0.trackedDecorationCount === 2);
// the limit
d0.trackedDecorationCount = 256;
level.setBlock(18, 64, 22, S('white_banner'));
check('256 markers: no more', useOn(made, 18, 64, 22) === 'fail' && !d0.bannerMarkers.has('banner-18,64,22'));
d0.trackedDecorationCount = 2;
// how names are laid out (vanilla MapRenderer): 4 under the marker, centred, 2/3 size, squeezed to 25 pixels at most
const home = { type: 'banner_red', x: 10, y: -20, rot: 8, name: 'Home' };
let lay = mr.nameLayout(home, font.textWidth('Home'));
check('a short name: 2/3 size, centred 4 pixels under', font.textWidth('Home') === 24 && Math.abs(lay.scale - 2 / 3) < 1e-9 && Math.abs(lay.x - (69 - 8)) < 1e-9 && lay.y === 58, JSON.stringify(lay));
const longName = 'The Village by the Sea';
lay = mr.nameLayout({ ...home, name: longName }, font.textWidth(longName));
check('a long one squeezed to 25 pixels', Math.abs(lay.scale * font.textWidth(longName) - 25) < 1e-9 && Math.abs(lay.x - (69 - 12.5)) < 1e-9, JSON.stringify(lay));
const atlas = mt.decorationAtlas();
const redAt = atlas.uv.banner_red, texel = (u, x, y) => { const i = (y * atlas.tex.w + Math.round(u * atlas.tex.w) + x) * 4; return [...atlas.tex.data.slice(i, i + 4)]; };
check('every banner colour has a marker, in its colour', mt.DECORATION_LIST.length === 21 && Object.keys(atlas.uv).length === 21 && texel(redAt[0], 3, 2).join() !== texel(atlas.uv.banner_blue[0], 3, 2).join() && texel(redAt[0], 3, 2)[3] === 255);

// the Nether: noise, a spinning marker, half the reach
const nworld = makeWorld(dims.THE_NETHER);
for (let x = -80; x < 80; x++) for (let z = -80; z < 80; z++) nworld.getChunk(x >> 4, z >> 4).setState(x & 15, 40, z & 15, S('netherrack'));
const nlevel = new levelMod.Level(nworld, 'test');
nlevel.sound = level.sound;
const np = new playerMod.Player(nlevel);
np.moveTo(0.5, 41, 0.5, 0, 0);
for (let i = 0; i < 36; i++) np.inventory.main[i] = null;
const nmap = maps.createMap(nlevel, 0, 0, 0, true, false);
np.inventory.main[0] = nmap;
nlevel.dayTime = 1000;
for (let t = 0; t < 20; t++) np.inventory.tick(np);
const nd = md.mapStorage(nlevel).get(nmap.tag.mapId);
const noise = (bx, bz) => { let i3 = (bx + Math.imul(bz, 231871)) | 0; i3 = (Math.imul(Math.imul(i3, i3), 31287121) + Math.imul(i3, 11)) | 0; return ((i3 >> 20) & 1) === 0 ? 10 : 11; };
const sample = [[0, 0], [10, -7], [-30, 20], [40, 12]];
check('the Nether: dirt and stone noise, flat', sample.every(([x, z]) => px(nd, x, z) === P(noise(x, z), 1)), sample.map(([x, z]) => `${px(nd, x, z)}/${P(noise(x, z), 1)}`).join(' '));
check('...out to 64 only', px(nd, 63, 30) === 0 && px(nd, -63, -63) === 0 && px(nd, 60, 0) !== 0);
const l = 100;
check('the marker spins with the time of day', [...nd.decorations.values()][0].rot === (((Math.imul(Math.imul(l, l), 34187121) + Math.imul(l, 121)) >> 15) & 15));
nlevel.setBlock(3, 41, 3, S('green_banner'));
nlevel.dayTime = 1230;
ib.itemBehaviorOf('filled_map').useOn(nlevel, np, nmap, { x: 3, y: 41, z: 3, face: 1, hx: 3.5, hy: 42, hz: 3.5 });
const l2 = 123;
check('...and so does a banner\'s, turned as it was marked', nd.decorations.get('banner-3,41,3')?.rot === (((Math.imul(Math.imul(l2, l2), 34187121) + Math.imul(l2, 121)) >> 15) & 15), JSON.stringify(nd.decorations.get('banner-3,41,3')));
world.dim = dims.THE_NETHER;
inv.main[0] = made;
world.getChunk(0, 1).setState(12, 63, 4, S('stone'));
const ov = d0.colorVersion;
for (let t = 0; t < 20; t++) inv.tick(player);
check('an overworld map carried in the Nether doesn\'t draw', d0.colorVersion === ov);
world.dim = dims.OVERWORLD;

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);

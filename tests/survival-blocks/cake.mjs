// Headless checks for the cake and the candle cakes (node tests/survival-blocks/cake.mjs): the blocks (bites, shapes,
// strength, wool, forced solid, broken by pistons, light), the item (one to a stack, its sprite, the food tab), the
// recipe and its buckets left behind, the faces it's drawn with, eating it (hungry or creative only; 2 food and 0.4
// saturation a slice; EAT; the last slice), a comparator reading it, a candle going in (only an uneaten cake; not used
// up in creative), the candle cakes lit (flint and steel, a fire charge, a dispenser, a burning arrow) and put out (a
// hand on the candle, splashed water, a wind burst), eating one (the candle dropped), what they drop, what keeps them
// up, picking them, their flame, and their states kept in a saved chunk.
import { load, check, exitWithStatus, flatLevel, ticks, place } from '../redstone2/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();

const { m, close } = await load([
  '/src/entity/player.ts', '/src/game/interaction.ts', '/src/game/cake.ts', '/src/world/blocksCake.ts', '/src/game/candles.ts', '/src/inventory/menus.ts',
  '/src/textures/blocks.ts', '/src/textures/items.ts', '/src/audio/synth.ts', '/src/game/redstone/piston.ts', '/src/game/banners.ts',
  '/src/world/mapColors.ts', '/src/game/redstone/comparator.ts', '/src/game/redstone/dispenseItems.ts', '/src/game/windBurst.ts',
  '/src/entity/thrownPotion.ts', '/src/entity/arrow.ts', '/src/storage/worldStore.ts', '/src/game/villageBlocks.ts', '/src/game/redstone/components.ts',
]);
const { S, getBlock, BLOCKS, STATE_BLOCK, OUTLINE, COLLISION, EMISSION, LAYER, Layer, ItemStack } = m;
const G = 64;
const name = (level, x, y, z) => BLOCKS[STATE_BLOCK[level.getState(x, y, z)]].name;
const prop = (level, x, y, z, k) => {
  const st = level.getState(x, y, z);
  return BLOCKS[STATE_BLOCK[st]].get(st, k);
};
const COLORS = ['', 'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
const CANDLE_CAKES = COLORS.map((c) => (c ? `${c}_candle_cake` : 'candle_cake'));

// ---------------------------------------------------------------------------
// the blocks
{
  const cake = getBlock('cake');
  check('cake: bites 0..6 (7 states)', cake.props.map((p) => p.name).join() === 'bites' && cake.stateCount === 7);
  check('cake: strength 0.5, no tool, wool', cake.hardness === 0.5 && cake.resistance === 0.5 && !cake.requiresTool && cake.sound === 'wool');
  const box = (bs) => JSON.stringify(bs.map((b) => b.map((v) => Math.round(v * 16))));
  const shapesOk = [0, 1, 2, 3, 4, 5, 6].every((b) => box(OUTLINE[cake.state({ bites: b })]) === `[[${1 + 2 * b},0,1,15,8,15]]` && box(COLLISION[cake.state({ bites: b })]) === `[[${1 + 2 * b},0,1,15,8,15]]`);
  check('cake: eaten from the west, 2 pixels a slice, 8 high', shapesOk);
  check('cake: forced solid (a cake stands on a cake), broken by pistons', m.legacySolid(cake.defaultState) && m.pushReaction(cake.defaultState) === 'destroy');
  check('cake: map colour none (not drawn on maps)', m.unmappedBlocks().filter((n) => /cake/.test(n)).length === 0);
  check('candle cakes: one for each candle, 17', CANDLE_CAKES.every((n) => m.BLOCK_BY_NAME.has(n)));
  const cc = getBlock('red_candle_cake');
  check('candle cake: lit or not (2 states)', cc.props.map((p) => p.name).join() === 'lit' && cc.stateCount === 2);
  check('candle cake: light 3 while lit, none out', CANDLE_CAKES.every((n) => EMISSION[getBlock(n).state({ lit: true })] === 3 && EMISSION[getBlock(n).state({ lit: false })] === 0));
  check('candle cake: the cake and the candle for its shape', box(OUTLINE[cc.defaultState]) === '[[1,0,1,15,8,15],[7,8,7,9,14,9]]' && box(COLLISION[cc.defaultState]) === '[[1,0,1,15,8,15],[7,8,7,9,14,9]]');
  check('candle cake: as the cake is (strength, wool, solid, pistons)', cc.hardness === 0.5 && cc.sound === 'wool' && m.legacySolid(cc.defaultState) && m.pushReaction(cc.defaultState) === 'destroy');
  check('candle cake: drawn cut out (the wick)', LAYER[cc.defaultState] === Layer.CUTOUT && LAYER[cake.defaultState] === Layer.SOLID);
  const md = (st) => JSON.stringify(BLOCKS[STATE_BLOCK[st]].s.model(BLOCKS[STATE_BLOCK[st]].view(st)));
  check('models: a whole cake\'s sides all frosted, a bitten one\'s cut face the inside', !md(cake.defaultState).includes('cake_inner') && md(cake.state({ bites: 3 })).includes('cake_inner'));
  check('models: the candle cake\'s candle is its candle, lit or not', md(cc.state({ lit: false })).includes('"red_candle"') && md(cc.state({ lit: true })).includes('red_candle_lit') && md(getBlock('candle_cake').defaultState).includes('"candle"'));
}

// ---------------------------------------------------------------------------
// the item, the recipe, the faces, the sounds
{
  const it = m.ITEMS.get('cake');
  check('item: one to a stack, its sprite, the food tab', it?.maxStack === 1 && it.texture === 'cake' && it.creativeTab === 'food' && m.ITEM_TEXTURES['cake']?.().w === 16);
  const at = m.ITEM_LIST.indexOf(it);
  check('item: listed after the cookie', m.ITEM_LIST[at - 1]?.id === 'cookie');
  check('item: places the cake', it.block?.name === 'cake');
  check('candle cakes: no item of their own; they pick as a cake', CANDLE_CAKES.every((n) => !m.ITEMS.get(n) && m.itemForBlock(n)?.id === 'cake' && m.behaviorOf(getBlock(n).defaultState).cloneItem(getBlock(n).defaultState) === 'cake'));
  const r = m.RECIPES.filter((x) => x.result === 'cake');
  check('recipe: 3 milk, 2 sugar, an egg, 3 wheat', r.length === 1 && r[0].pattern.join('|') === 'AAA|BEB|CCC' && r[0].key.A === 'milk_bucket' && r[0].key.B === 'sugar' && r[0].key.E === 'egg' && r[0].key.C === 'wheat' && r[0].count === 1);
  // (crafted at a table: the three buckets stay behind)
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const p = new m.Player(level);
  p.moveTo(0.5, G, 0.5, 0, 0);
  level.player = p;
  level.addEntity(p);
  const menu = new m.CraftingMenu(p, [0, G, 0]);
  ['milk_bucket', 'milk_bucket', 'milk_bucket', 'sugar', 'egg', 'sugar', 'wheat', 'wheat', 'wheat'].forEach((id, i) => menu.craft.set(i, ItemStack.of(id)));
  check('crafting: the table shows a cake', menu.result.items[0]?.item.id === 'cake' && menu.result.items[0].count === 1);
  menu.quickMoveStack(p, 0);
  check('crafting: made, the three buckets left in the grid, the rest used up', p.inventory.main.some((s) => s?.item.id === 'cake') && [0, 1, 2].every((i) => menu.craft.get(i)?.item.id === 'bucket') && [3, 4, 5, 6, 7, 8].every((i) => !menu.craft.get(i)));
  const faces = ['cake_top', 'cake_side', 'cake_bottom', 'cake_inner'].map((n) => m.BLOCK_TEXTURES[n]?.());
  check('faces: top, side, bottom and inside, opaque', faces.every((t) => t?.w === 16 && t.h === 16 && [...t.data].every((v, i) => i % 4 !== 3 || v === 255)));
  const side = faces[1];
  let same = true;
  for (let i = 0; i < 16 * 8 * 4; i++) if (side.data[i] !== side.data[i + 16 * 8 * 4]) same = false;
  check('faces: the side drawn in the lower half (the cake is 8 high), the upper the same again', same);
  const t = m.SOUNDS['block.cake.add_candle'];
  check('sounds: a candle going in, three takes', t?.variants === 3 && t.generate(1, 22050).some((v) => Math.abs(v) > 0.2));
  check('compost: a cake goes in a composter', m.isCompostable('cake'));
}

// ---------------------------------------------------------------------------
// a level to eat in
const { level, world } = flatLevel(m, -2, -2, 1, 1);
const sounds = [], motes = [], events = [];
level.sound = { play: (n, x, y, z, v, p) => sounds.push({ n, x, y, z, v, p }), playUI() {} };
level.particles = new Proxy({}, { get: (_t, k) => (...a) => (k === 'spawn' ? motes.push(a) : undefined) });
const gameEvent = level.gameEvent.bind(level);
level.gameEvent = (e, x, y, z, ctx) => {
  events.push({ e, x, y, z, entity: ctx?.entity });
  gameEvent(e, x, y, z, ctx);
};
const p = new m.Player(level);
p.setGameMode('survival');
p.moveTo(0.5, G, -2.5, 0, 30);
level.player = p;
level.addEntity(p);
const inter = new m.Interaction(level, p);
/** `p` right-clicks (x, y, z) holding `stack` (null: nothing), where the click lands `hy` above the block's foot */
const click = (x, y, z, stack = null, hy = 0.5, face = 2) => {
  p.inventory.main[0] = stack;
  p.inventory.selected = 0;
  return inter['useOnBlock']({ x, y, z, face, hx: x + 0.5, hy: y + hy, hz: z + 0.02, state: level.getState(x, y, z), dist: 3 }, stack, true, false);
};
const placeCake = (x, z) => {
  const s = ItemStack.of('cake');
  p.inventory.main[0] = s;
  p.inventory.selected = 0;
  return inter['placeBlock']({ x, y: G - 1, z, face: 1, hx: x + 0.5, hy: G, hz: z + 0.5, state: level.getState(x, G - 1, z), dist: 3 }, s);
};
const items = () => level.entities.filter((e) => e.type === 'item' && !e.removed);
const clearItems = () => items().forEach((e) => e.remove());
const itemId = (e) => e.stack?.item.id ?? e.item?.item.id;

// ---------------------------------------------------------------------------
// placing and eating
{
  check('place: on stone', placeCake(0, 0) && name(level, 0, G, 0) === 'cake' && prop(level, 0, G, 0, 'bites') === 0);
  check('place: a cake on a cake (forced solid)', inter['placeBlock']({ x: 0, y: G, z: 0, face: 1, hx: 0.5, hy: G + 0.5, hz: 0.5, state: level.getState(0, G, 0), dist: 3 }, ItemStack.of('cake')) && name(level, 0, G + 1, 0) === 'cake');
  level.setBlock(0, G + 1, 0, 0);
  // (a full player: nothing)
  p.food.level = 20;
  p.food.saturation = 5;
  events.length = 0;
  check('eat: not hungry, nothing happens', !click(0, G, 0) && prop(level, 0, G, 0, 'bites') === 0 && !events.some((e) => e.e === 'eat'));
  p.food.level = 10;
  p.food.saturation = 1;
  sounds.length = 0;
  check('eat: hungry, a slice gone', click(0, G, 0) && prop(level, 0, G, 0, 'bites') === 1);
  check('eat: 2 food, 0.4 saturation', p.food.level === 12 && Math.abs(p.food.saturation - 1.4) < 1e-9, `${p.food.level} ${p.food.saturation}`);
  check('eat: EAT, by the player; no sound (vanilla has none)', events.some((e) => e.e === 'eat' && e.entity === p) && !sounds.some((s) => /eat|burp/.test(s.n)));
  // (saturation never above the food level)
  p.food.level = 1;
  p.food.saturation = 0.9;
  click(0, G, 0);
  check('eat: saturation never past the food level', p.food.level === 3 && Math.abs(p.food.saturation - 1.3) < 1e-9 && prop(level, 0, G, 0, 'bites') === 2);
  p.food.level = 0;
  for (let i = 0; i < 4; i++) click(0, G, 0);
  check('eat: seven slices in all', prop(level, 0, G, 0, 'bites') === 6 && p.food.level === 8);
  events.length = 0;
  click(0, G, 0);
  check('eat: the last slice, the cake gone; BLOCK_DESTROY', name(level, 0, G, 0) === 'air' && events.some((e) => e.e === 'block_destroy' && e.entity === p) && p.food.level === 10);
  check('eat: nothing dropped', items().length === 0);
  // (creative: eats whatever its hunger)
  placeCake(0, 0);
  p.setGameMode('creative');
  p.food.level = 20;
  check('creative: eats even when full', click(0, G, 0) && prop(level, 0, G, 0, 'bites') === 1);
  p.setGameMode('survival');
}

// ---------------------------------------------------------------------------
// a comparator reading it
{
  level.setBlock(0, G, 0, S('cake'));
  const beh = () => m.behaviorOf(level.getState(0, G, 0));
  check('comparator: 14 whole, 2 less a slice', [0, 1, 2, 3, 4, 5, 6].every((b) => beh().analogOutput(level, 0, G, 0, getBlock('cake').state({ bites: b })) === 14 - 2 * b));
  check('comparator: a candle cake reads 14', CANDLE_CAKES.every((n) => m.behaviorOf(getBlock(n).defaultState).analogOutput(level, 0, G, 0, getBlock(n).defaultState) === 14));
  // (a real one: its back to the cake)
  place(m, level, 'comparator', 0, G, 1, { props: { facing: 'north', mode: 'compare', powered: false } });
  m.behaviorOf(level.getState(0, G, 1)).setPlacedBy(level, 0, G, 1, level.getState(0, G, 1), { gameMode: 'survival' });
  // (what comes out of its front: tests/redstone2/comparator.mjs's reading)
  const out = () => m.getSignal(level.world, 0, G, 1, 2);
  ticks(level, 4);
  const whole = out();
  p.food.level = 5;
  click(0, G, 0);
  click(0, G, 0);
  ticks(level, 4);
  check('comparator: a real one reads 14, then 10 after two slices', whole === 14 && out() === 10, `${whole} ${out()}`);
  level.setBlock(0, G, 1, 0);
  level.setBlock(0, G, 0, 0);
}

// ---------------------------------------------------------------------------
// candles in, lit and put out
{
  placeCake(0, 0);
  const candles = ItemStack.of('red_candle', 3);
  sounds.length = events.length = 0;
  check('candle: into an uneaten cake: the red candle cake', click(0, G, 0, candles) && name(level, 0, G, 0) === 'red_candle_cake' && prop(level, 0, G, 0, 'lit') === false);
  check('candle: one used, its sound, BLOCK_CHANGE', candles.count === 2 && sounds.some((s) => s.n === 'block.cake.add_candle' && s.v === 1 && s.p === 1) && events.some((e) => e.e === 'block_change' && e.entity === p));
  // (on a bitten cake it won't go: the cake's eaten instead, if hungry)
  placeCake(2, 0);
  p.food.level = 5;
  click(2, G, 0);
  const c2 = ItemStack.of('blue_candle', 2);
  p.food.level = 20;
  click(2, G, 0, c2);
  check('candle: not into a bitten cake', name(level, 2, G, 0) === 'cake' && c2.count === 2);
  p.food.level = 5;
  click(2, G, 0, ItemStack.of('blue_candle', 2));
  check('candle: a bitten cake is eaten instead, when hungry', name(level, 2, G, 0) === 'cake' && prop(level, 2, G, 0, 'bites') === 2);
  // (creative: the candle isn't used up)
  placeCake(-2, 0);
  p.setGameMode('creative');
  const c3 = ItemStack.of('lime_candle', 1);
  click(-2, G, 0, c3);
  check('candle: in creative, not used up', name(level, -2, G, 0) === 'lime_candle_cake' && c3.count === 1);
  p.setGameMode('survival');
  // (lit by flint and steel, and a fire charge)
  sounds.length = events.length = 0;
  const fs = ItemStack.of('flint_and_steel');
  p.food.level = 5;
  check('lit: flint and steel lights it (not eaten, hungry as it is)', click(0, G, 0, fs, 0.8) && prop(level, 0, G, 0, 'lit') === true && name(level, 0, G, 0) === 'red_candle_cake' && p.food.level === 5);
  check('lit: its sound, BLOCK_CHANGE, the flint and steel worn', sounds.some((s) => s.n === 'item.flintandsteel.use') && events.some((e) => e.e === 'block_change') && fs.damage === 1);
  check('lit: light 3 in the world', (level.world.getLight(0, G, 0) & 15) === 3, String(level.world.getLight(0, G, 0) & 15));
  const fc = ItemStack.of('fire_charge', 2);
  check('lit: a fire charge lights one too, used up', click(-2, G, 0, fc, 0.8) && prop(level, -2, G, 0, 'lit') === true && fc.count === 1);
  // (the flame over its wick)
  motes.length = 0;
  for (let i = 0; i < 20; i++) m.behaviorOf(level.getState(0, G, 0)).animateTick(level, 0, G, 0, level.getState(0, G, 0));
  const flames = motes.filter((a) => a[0] === 'small_flame');
  check('flame: a small flame over the wick each tick', flames.length === 20 && flames.every((a) => a[1] === 0.5 && a[2] === G + 1 && a[3] === 0.5));
  // (put out by an empty hand on the candle)
  sounds.length = events.length = 0;
  motes.length = 0;
  p.food.level = 5;
  check('out: an empty hand on the candle puts it out (not eaten)', click(0, G, 0, null, 0.8) && prop(level, 0, G, 0, 'lit') === false && p.food.level === 5);
  check('out: its hiss and smoke, BLOCK_CHANGE', sounds.some((s) => s.n === 'block.candle.extinguish') && motes.some((a) => a[0] === 'smoke') && events.some((e) => e.e === 'block_change' && e.entity === p));
  // (unlit, nothing to put out: an empty hand on the candle eats it)
  clearItems();
  level.setBlock(-2, G, 0, getBlock('lime_candle_cake').state({ lit: false }));
  check('out: unlit, an empty hand on the candle eats it instead', click(-2, G, 0, null, 0.8) && name(level, -2, G, 0) === 'cake' && prop(level, -2, G, 0, 'bites') === 1 && items().some((e) => itemId(e) === 'lime_candle'));
  clearItems();
}

// ---------------------------------------------------------------------------
// eating a candle cake; lighting and dowsing it every other way
{
  clearItems();
  // (lit, a hand on the cake part eats it: the candle drops, a cake with a slice gone is left)
  level.setBlock(0, G, 0, getBlock('red_candle_cake').state({ lit: true }));
  p.food.level = 5;
  check('eat: an empty hand on the cake part of a lit one eats it', click(0, G, 0, null, 0.3) && name(level, 0, G, 0) === 'cake' && prop(level, 0, G, 0, 'bites') === 1 && p.food.level === 7);
  check('eat: its candle dropped', items().length === 1 && itemId(items()[0]) === 'red_candle');
  clearItems();
  // (holding something, even on the candle: eaten)
  level.setBlock(0, G, 0, getBlock('green_candle_cake').state({ lit: true }));
  check('eat: something in hand, even on the candle: eaten', click(0, G, 0, ItemStack.of('dirt', 3), 0.8) && name(level, 0, G, 0) === 'cake' && items().some((e) => itemId(e) === 'green_candle'));
  clearItems();
  level.setBlock(0, G, 0, getBlock('green_candle_cake').state({ lit: false }));
  p.food.level = 20;
  check('eat: not hungry, an unlit one stays as it is', !click(0, G, 0, null, 0.3) && name(level, 0, G, 0) === 'green_candle_cake' && !items().length);
  // (a dispenser's flint and steel, a burning arrow)
  check('dispenser: its flint and steel lights one (as candles)', m.lightCandle(level, 0, G, 0) && prop(level, 0, G, 0, 'lit') === true);
  check('dispenser: one already lit: nothing to light', !m.lightCandle(level, 0, G, 0));
  level.setBlock(0, G, 0, getBlock('green_candle_cake').state({ lit: false }));
  const arrow = { isOnFire: () => true };
  m.behaviorOf(level.getState(0, G, 0)).projectileHit(level, 0, G, 0, level.getState(0, G, 0), { face: 2, px: 0.5, py: G + 0.8, pz: 0 }, arrow);
  check('arrow: a burning arrow lights it', prop(level, 0, G, 0, 'lit') === true);
  // (a splash of water, a wind burst)
  check('water: splashed water puts it out', m.extinguishCandle(level, 0, G, 0) && prop(level, 0, G, 0, 'lit') === false);
  level.setBlock(0, G, 0, getBlock('green_candle_cake').state({ lit: true }));
  m.triggerBlock(level, 0, G, 0);
  check('wind: a wind burst blows it out', prop(level, 0, G, 0, 'lit') === false);
  level.setBlock(2, G, 0, getBlock('white_candle').state({ candles: 3, lit: true }));
  m.triggerBlock(level, 2, G, 0);
  check('wind: and lit candles', prop(level, 2, G, 0, 'lit') === false && prop(level, 2, G, 0, 'candles') === 3);
}

// ---------------------------------------------------------------------------
// breaking, support, saving
{
  clearItems();
  const rand = { nextFloat: () => 0.5, nextInt: () => 0, nextDouble: () => 0.5 };
  const drops = (n, st, silk) => m.blockDrops(st ?? getBlock(n).defaultState, null, rand, silk).map((s) => `${s.item.id}x${s.count}`).join();
  check('drops: a cake nothing, even with silk touch', drops('cake') === '' && drops('cake', getBlock('cake').state({ bites: 3 }), true) === '');
  check('drops: a candle cake its candle', CANDLE_CAKES.every((n) => drops(n) === `${n.slice(0, -5)}x1` && drops(n, null, true) === `${n.slice(0, -5)}x1`));
  // (the block under it gone)
  level.setBlock(4, G, 4, S('cake'));
  level.setBlock(4, G - 1, 4, 0);
  check('support: a cake with nothing under it goes, dropping nothing', name(level, 4, G, 4) === 'air' && !items().length);
  level.setBlock(4, G - 1, 4, S('stone'));
  level.setBlock(4, G, 4, S('purple_candle_cake'));
  level.setBlock(4, G - 1, 4, 0);
  check('support: a candle cake goes, dropping its candle', name(level, 4, G, 4) === 'air' && items().some((e) => itemId(e) === 'purple_candle'));
  level.setBlock(4, G - 1, 4, S('stone'));
  check('support: nothing solid, no place for one', !m.behaviorOf(S('cake')).canSurvive(level.world, 4, G + 3, 4, S('cake')) && m.behaviorOf(S('cake')).canSurvive(level.world, 4, G, 4, S('cake')));
  // (kept in a saved chunk by name, bites and lit)
  level.setBlock(5, G, 5, getBlock('cake').state({ bites: 4 }));
  level.setBlock(6, G, 5, getBlock('black_candle_cake').state({ lit: true }));
  const c = level.world.getChunk(0, 0);
  const saved = structuredClone(m.serializeChunk('w', c, [], ''));
  const back = m.deserializeChunk(saved);
  const st = (x, z) => back.blocks[m.colIndex(x, G, z)];
  check('save: a bitten cake and a lit candle cake kept as they were', st(5, 5) === getBlock('cake').state({ bites: 4 }) && st(6, 5) === getBlock('black_candle_cake').state({ lit: true }));
}

await exitWithStatus(close);

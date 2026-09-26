// Shulker boxes (headless): node tests/end/shulkerbox.mjs
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();
const { mods: [, blockMod, worldMod, chunkMod, dimMod, levelMod, bb, itemMod, playerMod, recMod, synthMod, texMod, rulesMod, mesher, shulkerMod, beMod, sbeMod, menuMod, customMod, hoverMod, interMod, explMod, itemEntMod, shTex, dynMod], close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/dimension.ts', '/src/game/level.ts',
  '/src/game/blockBehavior.ts', '/src/item/item.ts', '/src/entity/player.ts', '/src/inventory/recipes.ts', '/src/audio/synth.ts',
  '/src/textures/blocks.ts', '/src/game/blockRules.ts', '/src/render/mesher.ts', '/src/game/shulkerBox.ts', '/src/world/blockEntity.ts',
  '/src/world/shulkerBoxEntity.ts', '/src/inventory/shulkerBoxMenu.ts', '/src/inventory/customRecipes.ts', '/src/item/hoverText.ts',
  '/src/game/interaction.ts', '/src/game/explosion.ts', '/src/entity/itemEntity.ts', '/src/textures/shulker.ts', '/src/world/dynamicShapes.ts',
]);
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const { S, BLOCKS, STATE_BLOCK, getBlock, COLLISION, OPACITY, FACE_OCC } = blockMod;
const { ItemStack, ITEMS } = itemMod;
const name = (st) => BLOCKS[STATE_BLOCK[st]].name;
const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
const BOXES = ['shulker_box', ...COLORS.map((c) => `${c}_shulker_box`)];

// --- blocks, items, recipe, textures
check('17 boxes', BOXES.every((n) => blockMod.BLOCK_BY_NAME.has(n)));
check('strength 2, stone, pickaxe but no tool needed', BOXES.every((n) => getBlock(n).hardness === 2 && getBlock(n).resistance === 2 && getBlock(n).sound === 'stone' && getBlock(n).tool === 'pickaxe' && !getBlock(n).requiresTool));
check('six facings, up by default', getBlock('shulker_box').stateCount === 6 && getBlock('red_shulker_box').get(getBlock('red_shulker_box').defaultState, 'facing') === 'up');
check('full collision, light dimmed by 1, hides no neighbour faces', JSON.stringify(COLLISION[S('shulker_box')]) === '[[0,0,0,1,1,1]]' && OPACITY[S('shulker_box')] === 1 && FACE_OCC[S('shulker_box')] === 0);
check('items: one to a stack, colored tab', BOXES.every((n) => ITEMS.get(n)?.maxStack === 1 && ITEMS.get(n).creativeTab === 'colored'));
check('shulker shell item', ITEMS.get('shulker_shell')?.maxStack === 64 && ITEMS.get('shulker_shell').texture === 'shulker_shell');
check('recipe: shell over chest over shell', recMod.RECIPES.some((r) => r.result === 'shulker_box' && r.pattern.join('|') === '-|#|-' && r.key['-'] === 'shulker_shell' && r.key['#'] === 'chest'));
{
  const missing = [];
  let solid = true;
  for (const n of BOXES)
    for (const t of [n, `${n}_top`, `${n}_bottom`]) {
      const f = texMod.BLOCK_TEXTURES[t];
      if (typeof f !== 'function') { missing.push(t); continue; }
      const im = f();
      for (let i = 3; i < im.data.length; i += 4) if (im.data[i] !== 255) solid = false;
    }
  check('block atlas textures for each box (side, top, bottom), solid', missing.length === 0 && solid, missing.join());
  const t = shTex.shulkerTexture(null);
  const a = (x, y) => t.data[(y * 64 + x) * 4 + 3];
  check('64x64 shell: lid, base, head filled; the unused corners clear', t.w === 64 && a(20, 5) === 255 && a(40, 5) === 255 && a(5, 20) === 255 && a(20, 30) === 255 && a(5, 46) === 255 && a(8, 54) === 255 && a(3, 60) === 255 && a(3, 3) === 0 && a(60, 3) === 0 && a(40, 58) === 0);
  const white = shTex.shulkerTexture('white'), red = shTex.shulkerTexture('red');
  const px = (im, x, y) => (im.data[(y * 64 + x) * 4] << 16) | (im.data[(y * 64 + x) * 4 + 1] << 8) | im.data[(y * 64 + x) * 4 + 2];
  check('each colour its own shell, the same head', px(white, 24, 20) !== px(red, 24, 20) && px(white, 8, 60) === px(red, 8, 60));
  // (where the lid's skirt lies over the base's top, both draw the same)
  let same = true;
  for (let x = 0; x < 64; x++) for (let r = 0; r < 4; r++) if (px(red, x, 16 + 8 + r) !== px(red, x, 44 + r)) same = false;
  check("the lid's skirt and the base's top agree (no z-fighting)", same);
}
{
  const rect = { u0: 0, v0: 0, u1: 1, v1: 1 };
  let err = null;
  try { mesher.initMesher(new Proxy({}, { get: () => rect })); } catch (e) { err = e; }
  check('models bake', !err, err?.message);
  const q = (st) => mesher.getStateModels(st).variants.reduce((a, v) => a + v.quads.length, 0);
  check('the block meshes nothing (drawn by its renderer)', q(S('shulker_box')) === 0 && q(S('red_shulker_box', { facing: 'north' })) === 0);
  const it = mesher.getItemModels(getBlock('blue_shulker_box'));
  check('the item: the shut box', it && it.variants[0].quads.length === 6);
}
check('sounds: open, close', !!synthMod.SOUNDS['block.shulker_box.open'] && !!synthMod.SOUNDS['block.shulker_box.close']);
{
  const o = synthMod.SOUNDS['block.shulker_box.open'].generate(0, 44100), c = synthMod.SOUNDS['block.shulker_box.close'].generate(0, 44100);
  let pk = 0;
  for (const v of [...o, ...c]) pk = Math.max(pk, Math.abs(v));
  check('they render', o.length > 10000 && c.length > 10000 && pk > 0.5 && [...o, ...c].every(Number.isFinite), `${o.length} ${c.length} ${pk.toFixed(2)}`);
}

// --- a world
const world = new worldMod.World();
world.reset(dimMod.OVERWORLD ?? dimMod.THE_END);
for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
for (let x = -30; x < 30; x++) for (let z = -30; z < 30; z++) world.setState(x, 59, z, S('stone'));
const level = new levelMod.Level(world, '42');
const log = { sounds: [] };
level.sound = { play: (n, x, y, z, v, p) => log.sounds.push({ n, x, y, z, v, p }), playUI: () => {} };
level.particles = { blockBreak() {}, blockHit() {}, spawn() {} };
const tick = (n = 1) => { for (let i = 0; i < n; i++) level.tick(); };
const player = new playerMod.Player(level);
player.moveTo(0.5, 60, -3.5, 0, 0);
level.player = player;
level.addEntity(player);
player.gameMode = 'survival';
const items = () => level.entities.filter((e) => e.type === 'item' && !e.removed);
const clearItems = () => items().forEach((e) => e.remove());
const useCtx = (face = 1) => ({ player, face, hx: 0.5, hy: 60.5, hz: 0.5, hand: 'main' });
let opened = [];
shulkerMod.setShulkerBoxMenuHook((m) => opened.push(m));

// placement: facing is the face clicked
{
  const b = getBlock('red_shulker_box');
  const ctx = (face) => ({ world, x: 0, y: 60, z: 0, face, hitY: 0.5, yaw: 0, pitch: 0, sneaking: false, clickedState: S('stone') });
  check('placed on top: faces up; on a side: faces out of it', rulesMod.placementState(b, ctx(1)) === b.state({ facing: 'up' }) && rulesMod.placementState(b, ctx(2)) === b.state({ facing: 'north' }) && rulesMod.placementState(b, ctx(0)) === b.state({ facing: 'down' }));
}

level.setBlock(0, 60, 0, S('red_shulker_box'));
const be = world.getBlockEntity(0, 60, 0);
check('a shulker box block entity', be instanceof sbeMod.ShulkerBoxBlockEntity && be.container.size === 27 && be.id === 'shulker_box');

// --- the lid
{
  const use = bb.behaviorOf(world.getState(0, 60, 0)).use;
  log.sounds.length = 0;
  opened = [];
  const r = use(level, 0, 60, 0, world.getState(0, 60, 0), useCtx());
  check('opening it shows its menu, titled Shulker Box', r === true && opened.length === 1 && opened[0] instanceof menuMod.ShulkerBoxMenu && opened[0].title === 'Shulker Box');
  check('the open sound, at the box, quiet', log.sounds.some((s) => s.n === 'block.shulker_box.open' && s.v === 0.5 && s.x === 0.5 && s.y === 60.5));
  const prog = [];
  for (let i = 0; i < 12; i++) { tick(); prog.push(be.progress.toFixed(1)); }
  check('the lid rises a tenth a tick, open after ten', prog[0] === '0.1' && prog[9] === '1.0' && be.animationStatus === 'opened', prog.join(' '));
  // standing on it: its shape reaches up half a block with the lid
  const top = dynMod.dynamicCollision(world, 0, 60, 0, world.getState(0, 60, 0));
  check('while open its shape stands half a block taller', top && Math.abs(top[0][4] - 1.5) < 1e-9, JSON.stringify(top));
  log.sounds.length = 0;
  be.stopOpen(level);
  check('shutting: its sound', log.sounds.some((s) => s.n === 'block.shulker_box.close' && s.v === 0.5));
  const down = [];
  for (let i = 0; i < 11; i++) { tick(); down.push(be.progress.toFixed(1)); }
  check('the lid comes down a tenth a tick', down[0] === '0.9' && down[9] === '0.0' && be.animationStatus === 'closed', down.join(' '));
  check('shut: a plain block again', JSON.stringify(dynMod.dynamicCollision(world, 0, 60, 0, world.getState(0, 60, 0))) === '[[0,0,0,1,1,1]]');
  // a block over it keeps it shut; a top slab doesn't
  world.setState(0, 61, 0, S('stone'));
  opened = [];
  use(level, 0, 60, 0, world.getState(0, 60, 0), useCtx());
  check('a block in the way of the lid: it won\'t open', opened.length === 0 && be.animationStatus === 'closed');
  world.setState(0, 61, 0, S('stone_slab', { type: 'top' }));
  use(level, 0, 60, 0, world.getState(0, 60, 0), useCtx());
  check('a top slab over it leaves the lid room', opened.length === 1);
  be.stopOpen(level);
  tick(12);
  world.setState(0, 61, 0, S('stone_slab', { type: 'bottom' }));
  opened = [];
  use(level, 0, 60, 0, world.getState(0, 60, 0), useCtx());
  check('a bottom slab over it doesn\'t', opened.length === 0);
  world.setState(0, 61, 0, 0);
  // an entity standing on it rides the lid up
  player.moveTo(0.5, 61, 0.5, 0, 0);
  player.onGround = true;
  const y0 = player.y;
  be.startOpen(level);
  let maxY = y0;
  for (let i = 0; i < 12; i++) { tick(); maxY = Math.max(maxY, player.y); }
  check('whoever stands on it is lifted as the lid rises', maxY > y0 + 0.4, `${y0} → max ${maxY.toFixed(2)}, now ${player.y.toFixed(2)}`);
  check('and stands on the open lid', Math.abs(player.y - 61.5) < 0.05, player.y.toFixed(3));
  be.stopOpen(level);
  tick(15);
  check('and settles back when it shuts', Math.abs(player.y - 61) < 0.05, player.y.toFixed(3));
  player.moveTo(0.5, 60, -3.5, 0, 0);
}

// --- the menu: no nesting
{
  const m = new menuMod.ShulkerBoxMenu(player, be, 'Shulker Box');
  check('27 box slots, then the player\'s 36', m.slots.length === 63 && m.slots.slice(0, 27).every((s) => s instanceof menuMod.ShulkerBoxSlot));
  check('a box slot takes anything but a shulker box', m.slots[0].mayPlace(ItemStack.of('diamond')) && !m.slots[0].mayPlace(ItemStack.of('shulker_box')) && !m.slots[0].mayPlace(ItemStack.of('lime_shulker_box')));
  player.inventory.main[9] = ItemStack.of('green_shulker_box');
  player.inventory.main[10] = ItemStack.of('diamond', 5);
  const i9 = m.slots.findIndex((s) => s.container !== be.container && s.slot === 9), i10 = m.slots.findIndex((s) => s.container !== be.container && s.slot === 10);
  m.quickMoveStack(player, i9);
  m.quickMoveStack(player, i10);
  check('shift-click: the diamonds go in, the box stays out', be.container.items.some((s) => s?.item.id === 'diamond' && s.count === 5) && !be.container.items.some((s) => s?.item.id === 'green_shulker_box') && player.inventory.main[9]?.item.id === 'green_shulker_box');
  player.inventory.main[9] = null;
}

// --- breaking keeps the contents
{
  be.container.items[3] = ItemStack.of('iron_ingot', 32);
  be.container.items[20] = new ItemStack(ITEMS.get('diamond_sword'), 1, 7, { enchantments: { sharpness: 3 } });
  be.customName = 'Loot';
  clearItems();
  level.destroyBlock(0, 60, 0, true);
  const drops = items();
  const box = drops.find((e) => e.stack.item.id === 'red_shulker_box');
  check('broken, it drops itself — and nothing spills', drops.length === 1 && !!box, drops.map((e) => e.stack.item.id).join());
  const c = box?.stack.tag?.container ?? [];
  check('its item holds what it held, slot by slot', c.length === 3 && c.some((x) => x.slot === 3 && x.id === 'iron_ingot' && x.count === 32) && c.some((x) => x.slot === 20 && x.id === 'diamond_sword' && x.damage === 7 && x.tag?.enchantments?.sharpness === 3), JSON.stringify(c));
  check('and its name', box?.stack.tag?.customName === 'Loot');
  const lines = hoverMod.hoverText(box.stack);
  check('tooltip: what it holds', lines.length === 3 && lines.includes('Diamond x5') && lines.includes('Iron Ingot x32') && lines.includes('Diamond Sword x1'), JSON.stringify(lines));
  // placed again: all back in
  level.setBlock(5, 60, 5, S('red_shulker_box'));
  const be2 = world.getBlockEntity(5, 60, 5);
  be2.applyComponents(box.stack);
  check('placed again, it holds it all', be2.container.items[3]?.count === 32 && be2.container.items[20]?.item.id === 'diamond_sword' && be2.container.items[20].tag?.enchantments?.sharpness === 3 && be2.displayName() === 'Loot');
  // more than five: "and n more..."
  const many = ItemStack.of('shulker_box');
  many.tag = { container: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ slot: i, id: 'stone', count: i + 1 })) };
  const ml = hoverMod.hoverText(many);
  check('tooltip: the first five, then "and 3 more..."', ml.length === 6 && ml[0] === 'Stone x1' && ml[4] === 'Stone x5' && ml[5] === '§oand 3 more...', JSON.stringify(ml));
  check('an empty box: no lines', hoverMod.hoverText(ItemStack.of('shulker_box')).length === 0);
  // save and load
  const saved = JSON.parse(JSON.stringify(be2.save()));
  const re = beMod.loadBlockEntity(saved);
  check('saved and loaded: contents and name', re instanceof sbeMod.ShulkerBoxBlockEntity && re.container.items[3]?.count === 32 && re.customName === 'Loot' && re.container.items[20].tag?.enchantments?.sharpness === 3);
  // stacks of boxes with different contents don't stack
  check('boxes holding different things are different items', !box.stack.sameItem(ItemStack.of('red_shulker_box')));
}

// --- creative: a box with things in it still drops; an empty one doesn't
{
  const inter = new interMod.Interaction(level, player);
  player.gameMode = 'creative';
  clearItems();
  level.setBlock(8, 60, 8, S('blue_shulker_box'));
  world.getBlockEntity(8, 60, 8).container.items[0] = ItemStack.of('gold_ingot', 3);
  inter['destroyBlock'](8, 60, 8);
  const d = items();
  check('creative: broken with things in it, it drops (contents and all)', d.length === 1 && d[0].stack.item.id === 'blue_shulker_box' && d[0].stack.tag?.container?.[0]?.id === 'gold_ingot' && name(world.getState(8, 60, 8)) === 'air');
  clearItems();
  level.setBlock(8, 60, 8, S('blue_shulker_box'));
  inter['destroyBlock'](8, 60, 8);
  check('creative: an empty one just goes', items().length === 0 && name(world.getState(8, 60, 8)) === 'air');
  player.gameMode = 'survival';
  clearItems();
  level.setBlock(8, 60, 8, S('blue_shulker_box'));
  inter['destroyBlock'](8, 60, 8);
  check('survival: an empty one drops itself (by hand)', items().length === 1 && items()[0].stack.item.id === 'blue_shulker_box' && !items()[0].stack.tag);
}

// --- a blast: the box goes with what's in it
{
  clearItems();
  level.setBlock(-8, 60, -8, S('yellow_shulker_box'));
  world.getBlockEntity(-8, 60, -8).container.items[5] = ItemStack.of('emerald', 9);
  explMod.explode(level, null, -8.5, 60.5, -8.5, 3, false, 'tnt');
  const d = items();
  const box = d.find((e) => e.stack.item.id === 'yellow_shulker_box');
  check('TNT: the box drops with its contents, none spilled', !!box && box.stack.tag?.container?.[0]?.id === 'emerald' && !d.some((e) => e.stack.item.id === 'emerald'), d.map((e) => e.stack.item.id).join());
  // burnt as an item: it spills
  box.hurt(10, 'lava');
  const spilt = items().filter((e) => e.stack.item.id === 'emerald');
  check('a box item burnt up spills what it held', box.removed && spilt.length === 1 && spilt[0].stack.count === 9);
}

// --- dyeing and washing
{
  const r = (grid) => customMod.customRecipeFor(grid, 3)?.result ?? null;
  const box = ItemStack.of('shulker_box');
  box.tag = { container: [{ slot: 0, id: 'stone', count: 1 }], customName: 'Mine' };
  const out = r([box, null, null, null, ItemStack.of('lime_dye'), null, null, null, null]);
  check('box + dye → that colour, keeping what\'s in it', out?.item.id === 'lime_shulker_box' && out.count === 1 && out.tag?.container?.[0]?.id === 'stone' && out.tag.customName === 'Mine');
  check('a dyed one dyes again', r([ItemStack.of('red_shulker_box'), ItemStack.of('black_dye')])?.item.id === 'black_shulker_box');
  check('two dyes, two boxes or something else: no', !r([box, ItemStack.of('lime_dye'), ItemStack.of('red_dye')]) && !r([box, box.copy(), ItemStack.of('red_dye')]) && !r([box, ItemStack.of('lime_dye'), ItemStack.of('stick')]) && !r([box]));
  // the cauldron
  world.setState(3, 60, -3, S('water_cauldron', { level: 3 }));
  const dyed = ItemStack.of('purple_shulker_box');
  dyed.tag = { container: [{ slot: 4, id: 'apple', count: 2 }] };
  player.inventory.main[0] = dyed;
  player.inventory.selected = 0;
  const st = world.getState(3, 60, -3);
  const res = bb.behaviorOf(st).useItemOn(level, 3, 60, -3, st, dyed, useCtx());
  const held = player.inventory.main[0];
  check('a water cauldron washes the dye off, contents kept, for a level of water', res === 'success' && held?.item.id === 'shulker_box' && held.tag?.container?.[0]?.id === 'apple' && getBlock('water_cauldron').get(world.getState(3, 60, -3), 'level') === 2);
  const res2 = bb.behaviorOf(world.getState(3, 60, -3)).useItemOn(level, 3, 60, -3, world.getState(3, 60, -3), held, useCtx());
  check('an undyed one isn\'t washed', res2 !== 'success' || player.inventory.main[0]?.item.id === 'shulker_box');
  // (the cauldron's own uses still work)
  player.inventory.main[0] = ItemStack.of('glass_bottle');
  const res3 = bb.behaviorOf(world.getState(3, 60, -3)).useItemOn(level, 3, 60, -3, world.getState(3, 60, -3), player.inventory.main[0], useCtx());
  check('the cauldron still fills bottles', res3 === 'success');
}

// --- piglins guard them; hooks for pistons and dispensers
{
  check('dispenser hook: places the box in front, with its contents', (() => {
    const s = ItemStack.of('cyan_shulker_box');
    s.tag = { container: [{ slot: 1, id: 'arrow', count: 16 }] };
    world.setState(12, 60, 12, S('stone'));
    const ok = shulkerMod.dispenseShulkerBox(level, 12, 60, 12, 5, s);
    const st = world.getState(13, 60, 12);
    return ok && name(st) === 'cyan_shulker_box' && getBlock('cyan_shulker_box').get(st, 'facing') === 'up' && world.getBlockEntity(13, 60, 12).container.items[1]?.count === 16;
  })());
  check('dispenser hook: over a drop it faces the way the dispenser does', (() => {
    const ok = shulkerMod.dispenseShulkerBox(level, 12, 64, 12, 5, ItemStack.of('shulker_box'));
    return ok && getBlock('shulker_box').get(world.getState(13, 64, 12), 'facing') === 'east';
  })());
}

await close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);

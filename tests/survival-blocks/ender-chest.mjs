// Headless checks for the ender chest (node tests/survival-blocks/ender-chest.mjs): the block (facing, waterlogging,
// light 7, strength 22.5 and blast resistance 600, a pickaxe to get anything), 8 obsidian without silk touch, its
// recipe and item, opening it (not under a block that conducts redstone), each player's own 27 slots whichever ender
// chest they open, the lid and its sounds and game events, staying near it, piglins, its motes, the player's slots kept
// with the player (and not dropped when they die), the sheet it's drawn with and the model's lid.
import { load, check, exitWithStatus, flatLevel } from '../fixes/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();

const { m, close } = await load([
  '/src/item/item.ts', '/src/game/interaction.ts', '/src/game/openMenu.ts', '/src/inventory/menus.ts', '/src/inventory/container.ts',
  '/src/game/enderChest.ts', '/src/world/enderChestBlockEntity.ts', '/src/world/blocksEnderChest.ts', '/src/game/blockRules.ts',
  '/src/game/blockBehavior.ts', '/src/inventory/recipes.ts', '/src/game/playerData.ts', '/src/game/playerDeath.ts', '/src/audio/synth.ts',
  '/src/textures/enderChest.ts', '/src/textures/blocks.ts', '/src/world/mapColors.ts', '/src/entity/piglin.ts', '/src/render/enderChestRenderer.ts',
  '/src/net/chunkData.ts', '/src/world/blockEntity.ts', '/src/game/redstone/signal.ts', '/src/entity/itemEntity.ts',
]);
const { S, getBlock, BLOCKS, STATE_BLOCK, OUTLINE, COLLISION, FLAGS, F_WATERLOGGED, EMISSION, ItemStack } = m;

// ---------------------------------------------------------------------------
// the block
{
  const b = getBlock('ender_chest');
  check('block: facing and waterlogged (8 states)', b.props.map((p) => p.name).join() === 'facing,waterlogged' && b.stateCount === 8);
  check('block: strength 22.5, blast resistance 600', b.hardness === 22.5 && b.resistance === 600);
  check('block: a pickaxe, needed for drops', b.tool === 'pickaxe' && b.requiresTool === true);
  check('block: gives light 7', EMISSION[b.defaultState] === 7 && EMISSION[b.state({ facing: 'east', waterlogged: true })] === 7);
  check('block: sounds as stone', b.sound === 'stone');
  const box = (st) => JSON.stringify(st.map((bx) => bx.map((v) => Math.round(v * 16))));
  check('block: shape 1..15 wide, 14 high, for collision and outline', box(OUTLINE[b.defaultState]) === '[[1,0,1,15,14,15]]' && box(COLLISION[b.defaultState]) === '[[1,0,1,15,14,15]]');
  check('block: waterlogged holds water', (FLAGS[b.state({ waterlogged: true })] & F_WATERLOGGED) !== 0);
  check('block: map colour stone\'s', m.unmappedBlocks().indexOf('ender_chest') < 0);
  check('block: no comparator reading (vanilla has none)', !m.behaviorOf(b.defaultState)?.analogOutput);
  const it = m.ITEMS.get('ender_chest');
  check('item: places the block, 64 to a stack', it?.block?.name === 'ender_chest' && it.maxStack === 64);
  check('item: functional blocks tab', it?.creativeTab === 'functional');
  check('item: not a fuel (vanilla burns chests, not this)', m.fuelTime(ItemStack.of('ender_chest')) === 0 && m.fuelTime(ItemStack.of('chest')) === 300);
  check('item: picked as itself', m.itemForBlock('ender_chest')?.id === 'ender_chest');
  const r = m.RECIPES.filter((x) => x.result === 'ender_chest');
  check('recipe: 8 obsidian round an eye of ender make one', r.length === 1 && r[0].count === 1 && r[0].pattern.join('|') === '###|#E#|###' && r[0].key['#'] === 'obsidian' && r[0].key.E === 'ender_eye');
  // (drops: vanilla blocks/ender_chest)
  const rand = { nextFloat: () => 0.5, nextInt: () => 0, nextDouble: () => 0.5 };
  const pick = m.ITEMS.get('wooden_pickaxe'), dia = m.ITEMS.get('diamond_pickaxe');
  const drops = (tool, silk) => m.blockDrops(b.defaultState, tool, rand, silk).map((s) => `${s.item.id}x${s.count}`).join();
  check('drops: 8 obsidian mined with any pickaxe', drops(pick, false) === 'obsidianx8' && drops(dia, false) === 'obsidianx8');
  check('drops: itself with silk touch', drops(dia, true) === 'ender_chestx1');
  check('drops: nothing by hand or with an axe', drops(null, false) === '' && drops(m.ITEMS.get('diamond_axe'), true) === '');
  check('sounds: the lid\'s open and close exist and are heard', ['block.ender_chest.open', 'block.ender_chest.close'].every((k) => {
    const t = m.SOUNDS[k]?.generate(0, 22050);
    return t && t.length > 4000 && t.some((v) => Math.abs(v) > 0.2);
  }));
}

// ---------------------------------------------------------------------------
// the sheet it's drawn with, the item's faces and the model
{
  const t = m.enderChestTexture();
  check('texture: 64 x 64', t.w === 64 && t.h === 64);
  // (every face of vanilla ChestModel's boxes, box UV: opaque, nothing to see through)
  const faces = (u, v, w, h, d) => [[u + d, v, w, d], [u + d + w, v, w, d], [u, v + d, d, h], [u + d, v + d, w, h], [u + d + w, v + d, d, h], [u + 2 * d + w, v + d, w, h]];
  const holes = [];
  for (const [u, v, w, h, d] of [[0, 0, 14, 5, 14], [0, 19, 14, 10, 14], [0, 0, 2, 4, 1]])
    for (const [x0, y0, fw, fh] of faces(u, v, w, h, d))
      for (let y = y0; y < y0 + fh; y++) for (let x = x0; x < x0 + fw; x++) if (t.data[(y * 64 + x) * 4 + 3] !== 255) holes.push(`${x},${y}`);
  check('texture: every face of the lid, body and lock is solid', holes.length === 0, holes.slice(0, 5).join(' '));
  const names = ['ender_chest_top', 'ender_chest_bottom', 'ender_chest_side', 'ender_chest_front', 'ender_chest_lid_side', 'ender_chest_lid_front', 'ender_chest_latch'];
  check('texture: the item\'s faces are on the block atlas', names.every((n) => m.BLOCK_TEXTURES[n]?.().w === 16));
  const md = getBlock('ender_chest').s.itemModel;
  check('item model: body, lid and latch boxes', md?.elements?.length === 3);
  const cm = m.chestModel();
  check('model: vanilla ChestModel\'s parts', cm.bottom && cm.lid && cm.lock && cm.root);
  check('model: lid shut at 0, straight up at 1, eased between', m.lidAngle(0) === 0 && Math.abs(m.lidAngle(1) + Math.PI / 2) < 1e-9 && Math.abs(m.lidAngle(0.5) + (0.875 * Math.PI) / 2) < 1e-9);
}

// ---------------------------------------------------------------------------
// a level to try it in
const { world, level } = flatLevel(m, -2, -2, 1, 1);
const sounds = [], motes = [], events = [];
level.sound = { play: (n, x, y, z, v, p) => sounds.push({ n, x, y, z, v, p }), playUI() {} };
level.particles = new Proxy({}, { get: (_t, k) => (...a) => { if (k === 'spawn') motes.push(a); } });
const gameEvent = level.gameEvent.bind(level);
level.gameEvent = (e, x, y, z, ctx) => {
  events.push({ e, x, y, z, entity: ctx?.entity });
  gameEvent(e, x, y, z, ctx);
};
const mk = (x, z, yaw) => {
  const p = new m.Player(level);
  p.setGameMode('survival');
  p.moveTo(x, 64, z, yaw, 30);
  level.addEntity(p);
  return p;
};
const alex = mk(0.5, -2.5, 0), steve = mk(3.5, -2.5, 0);
level.player = alex;
const shown = [];
m.setShowMenu((p, menu) => {
  shown.push({ p, menu });
  return true;
});
const interOf = new Map([[alex, new m.Interaction(level, alex)], [steve, new m.Interaction(level, steve)]]);
const name = (x, y, z) => BLOCKS[STATE_BLOCK[level.getState(x, y, z)]].name;
const prop = (x, y, z, k) => {
  const st = level.getState(x, y, z);
  return BLOCKS[STATE_BLOCK[st]].get(st, k);
};
/** `p` places an ender chest on top of the block at (x, y - 1, z) */
const place = (p, x, y, z) => {
  const s = ItemStack.of('ender_chest', 2);
  p.inventory.main[0] = s;
  p.inventory.selected = 0;
  return interOf.get(p)['placeBlock']({ x, y: y - 1, z, face: 1, hx: x + 0.5, hy: y, hz: z + 0.5, state: level.getState(x, y - 1, z), dist: 3 }, s);
};
/** `p` uses the block at (x, y, z) with an empty hand (or `stack`) */
const use = (p, x, y, z, stack = null) => {
  p.inventory.main[0] = stack;
  p.inventory.selected = 0;
  return interOf.get(p)['useOnBlock']({ x, y, z, face: 2, hx: x + 0.5, hy: y + 0.5, hz: z + 0.02, state: level.getState(x, y, z), dist: 3 }, stack, true, false);
};
const runEvents = () => level['runBlockEvents']();
const lastMenu = () => shown.at(-1)?.menu ?? null;

// ---------------------------------------------------------------------------
// placing
{
  check('place: from the north looking south, it faces north (toward the player)', place(alex, 0, 64, 0) && name(0, 64, 0) === 'ender_chest' && prop(0, 64, 0, 'facing') === 'north');
  alex.yaw = 90;
  check('place: looking west, it faces east', place(alex, -1, 64, -1) && prop(-1, 64, -1, 'facing') === 'east');
  alex.yaw = 0;
  level.setBlock(4, 64, 0, S('water'));
  check('place: in water, waterlogged', place(steve, 4, 64, 0) && name(4, 64, 0) === 'ender_chest' && prop(4, 64, 0, 'waterlogged') === true);
  const be = world.getBlockEntity(0, 64, 0);
  check('place: its block entity, holding nothing itself', be instanceof m.EnderChestBlockEntity && be.container.size === 0);
  check('place: nothing of it saved but where it is', JSON.stringify(be.save()) === JSON.stringify({ id: 'ender_chest', x: 0, y: 64, z: 0, items: [], data: undefined }));
}

// ---------------------------------------------------------------------------
// opening it
const A = world.getBlockEntity(0, 64, 0), B = world.getBlockEntity(-1, 64, -1);
{
  sounds.length = events.length = 0;
  const n0 = shown.length;
  check('open: used by hand, a menu', use(alex, 0, 64, 0) && shown.length === n0 + 1 && shown[n0].p === alex);
  const menu = lastMenu();
  check('open: a chest\'s menu titled Ender Chest, 3 rows of 9 over the inventory', menu instanceof m.ChestMenu && menu.title === 'Ender Chest' && menu.rows === 3 && menu.slots.length === 63);
  check('open: its slots the player\'s own ender chest', menu.chest === m.enderChestOf(alex) && menu.slots[0].container === m.enderChestOf(alex).container && m.enderChestOf(alex).container.size === 27);
  check('open: the chest counts it as looking in, and is its active one', A.openers.has(alex) && A.openers.size === 1 && m.enderChestOf(alex).activeChest === A && m.enderChestOf(alex).isActiveChest(A));
  const op = sounds.filter((s) => s.n === 'block.ender_chest.open');
  check('open: its sound, at half volume, pitch 0.9 to 1', op.length === 1 && op[0].v === 0.5 && op[0].p >= 0.9 && op[0].p <= 1 && op[0].x === 0.5 && op[0].z === 0.5);
  check('open: CONTAINER_OPEN, by the player', events.some((e) => e.e === 'container_open' && e.entity === alex && e.x === 0.5 && e.y === 64.5));
  check('open: the lid waits for its block event', A.lidOpen === false);
  runEvents();
  const t0 = level.gameTime;
  check('lid: the block event starts it up', A.lidOpen === true && A.lidAt === t0 && A.lidFrom === 0);
  check('lid: a tenth of the way a tick', Math.abs(A.openness(t0 + 5) - 0.5) < 1e-9 && A.openness(t0 + 10) === 1 && A.openness(t0 + 30) === 1 && Math.abs(A.openness(t0 + 2.5) - 0.25) < 1e-9);
  // (what's put in it is the player's)
  menu.slots[0].set(ItemStack.of('diamond', 7));
  menu.slots[26].set(ItemStack.of('iron_pickaxe'));
  check('slots: put in through the menu, kept in the player\'s own', m.enderChestOf(alex).container.get(0)?.count === 7 && m.enderChestOf(alex).container.get(26)?.item.id === 'iron_pickaxe');
  // (the other player, at the same chest: its own slots, empty; the lid heard once)
  sounds.length = 0;
  steve.moveTo(0.5, 64, -2.5, 0, 30);
  check('two players: the second opens the same chest', use(steve, 0, 64, 0) && lastMenu().chest === m.enderChestOf(steve));
  const sm = lastMenu();
  check('two players: its slots are its own, empty', sm.slots.slice(0, 27).every((s) => !s.item) && m.enderChestOf(steve) !== m.enderChestOf(alex));
  check('two players: the lid heard only the once', !sounds.some((s) => s.n === 'block.ender_chest.open') && A.openers.size === 2);
  sm.slots[5].set(ItemStack.of('emerald', 3));
  check('two players: what one puts in, the other hasn\'t', !m.enderChestOf(alex).container.get(5) && m.enderChestOf(steve).container.get(5)?.count === 3);
  runEvents();
  // (the first leaves: the lid stays up for the second)
  events.length = 0;
  menu.removed();
  runEvents();
  check('close: one of two leaves, no sound, the lid stays up', !sounds.some((s) => s.n === 'block.ender_chest.close') && A.openers.size === 1 && A.lidOpen === true && m.enderChestOf(alex).activeChest === null);
  check('close: no CONTAINER_CLOSE yet', !events.some((e) => e.e === 'container_close'));
  level.gameTime += 10;
  sm.removed();
  const cl = sounds.filter((s) => s.n === 'block.ender_chest.close');
  check('close: the last one out, its sound, CONTAINER_CLOSE', cl.length === 1 && cl[0].v === 0.5 && A.openers.size === 0 && events.some((e) => e.e === 'container_close' && e.entity === steve));
  runEvents();
  const t1 = level.gameTime;
  check('lid: goes down from where it was', A.lidOpen === false && A.lidFrom === 1 && A.lidAt === t1 && Math.abs(A.openness(t1 + 3) - 0.7) < 1e-9 && A.openness(t1 + 10) === 0);
  // (another ender chest: the same slots)
  alex.moveTo(-1.5, 64, -3.5, 0, 30);
  check('any chest: another ender chest opens onto the same slots', use(alex, -1, 64, -1) && lastMenu().slots[0].item?.count === 7 && lastMenu().slots[26].item?.item.id === 'iron_pickaxe' && lastMenu().chest === m.enderChestOf(alex));
  check('any chest: that one is the active chest, and counts it', m.enderChestOf(alex).activeChest === B && B.openers.has(alex) && !A.openers.size);
  lastMenu().removed();
  runEvents();
  alex.moveTo(0.5, 64, -2.5, 0, 30);
}

// ---------------------------------------------------------------------------
// what stops it opening, and what closes it
{
  const n0 = shown.length;
  level.setBlock(0, 65, 0, S('stone'));
  check('blocked: under stone (a conductor), it won\'t open', use(alex, 0, 64, 0) === true && shown.length === n0 && !A.openers.size);
  level.setBlock(0, 65, 0, S('glass'));
  check('not blocked: under glass (not a conductor), it opens', use(alex, 0, 64, 0) && shown.length === n0 + 1);
  let menu = lastMenu();
  check('near: while in reach it stays open', menu.stillValid(alex));
  alex.moveTo(0.5, 64, -7.5, 0, 30);
  check('near: 7.5 blocks off, still (within 4 past the reach of 4.5)', menu.stillValid(alex));
  alex.moveTo(0.5, 64, -8.7, 0, 30);
  check('near: 8.7 blocks off, no longer valid', !menu.stillValid(alex));
  alex.moveTo(0.5, 64, -12.5, 0, 30);
  check('near: 12 blocks off, its menu no longer valid', !menu.stillValid(alex));
  menu.removed();
  runEvents();
  alex.moveTo(0.5, 64, -2.5, 0, 30);
  level.setBlock(0, 65, 0, 0);
  use(alex, 0, 64, 0);
  menu = lastMenu();
  runEvents();
  check('broken: open while it\'s there', menu.stillValid(alex) && A.openers.size === 1);
  level.setBlock(0, 64, 0, 0);
  check('broken: its menu no longer valid', !menu.stillValid(alex));
  menu.removed();
  check('broken: the player\'s slots untouched', m.enderChestOf(alex).container.get(0)?.count === 7);
  check('broken: its block entity gone', !world.getBlockEntity(0, 64, 0) && A.removed);
  // (put back for what follows)
  alex.yaw = 0;
  place(alex, 0, 64, 0);
}

// ---------------------------------------------------------------------------
// someone gone without closing it, and the lid told again
{
  const C = world.getBlockEntity(0, 64, 0);
  use(alex, 0, 64, 0);
  const menu = lastMenu();
  runEvents();
  check('recheck: open, lid up', C.openers.has(alex) && C.lidOpen);
  // (two block events in one tick, one close and one open again: the open's merged into the first, so the lid's shut)
  level.blockEvent(0, 64, 0, STATE_BLOCK[level.getState(0, 64, 0)], 1, 0);
  runEvents();
  check('recheck: a stray close leaves the lid down', !C.lidOpen);
  for (let i = 0; i < 5; i++) C.tick(level);
  runEvents();
  check('recheck: within 5 ticks the lid\'s told again, up for who\'s looking', C.lidOpen && C.openers.size === 1);
  // (the player removed from the level without its menu closing)
  const ghost = mk(1.5, -2.5, 0);
  interOf.set(ghost, new m.Interaction(level, ghost));
  use(ghost, 0, 64, 0);
  menu.removed();
  runEvents();
  check('recheck: a second opener keeps it up', C.openers.size === 1 && C.openers.has(ghost) && C.lidOpen);
  sounds.length = 0;
  ghost.remove();
  for (let i = 0; i < 5; i++) C.tick(level);
  runEvents();
  check('recheck: gone from the level, it no longer counts; the lid shuts, heard', C.openers.size === 0 && !C.lidOpen && sounds.some((s) => s.n === 'block.ender_chest.close'));
  // (a spectator can't use it, having no menu of its own to look into (vanilla getMenuProvider: none); nor would it
  // count as looking in (vanilla ContainerOpenersCounter leaves spectators out))
  steve.setGameMode('spectator');
  sounds.length = 0;
  C.startOpen(level, steve);
  check('spectator: never counts as looking in, no sound', !C.openers.size && !sounds.length);
  steve.setGameMode('survival');
}

// ---------------------------------------------------------------------------
// piglins, motes, a guest's copy of it
{
  const pg = new m.Piglin(level);
  pg.moveTo(3.5, 64, 2.5, 0, 0);
  level.addEntity(pg);
  pg['visibleLiving'] = [alex];
  use(alex, 0, 64, 0);
  check('piglins: one that sees it opened is angered at the player', pg.angryAt === alex);
  lastMenu().removed();
  runEvents();
  motes.length = 0;
  const st = level.getState(0, 64, 0);
  m.behaviorOf(st).animateTick(level, 0, 64, 0, st, level.random);
  check('motes: three portal motes a tick', motes.length === 3 && motes.every((a) => a[0] === 'portal'));
  check('motes: from a corner\'s column, drifting out that way', motes.every((a) => Math.abs(Math.abs(a[1] - 0.5) - 0.25) < 1e-9 && Math.abs(Math.abs(a[3] - 0.5) - 0.25) < 1e-9 && a[2] >= 64 && a[2] < 65 && Math.sign(a[4]) === Math.sign(a[1] - 0.5) && Math.sign(a[6]) === Math.sign(a[3] - 0.5)));
  const C = world.getBlockEntity(0, 64, 0);
  use(alex, 0, 64, 0);
  runEvents();
  const v = m.visibleBlockEntity(C);
  check('copy: a guest is sent the lid (open, from, since when)', v.data?.lid_open === 1 && v.data.lid_from === C.lidFrom && v.data.lid_at === C.lidAt && Array.isArray(v.items) && v.items.length === 0);
  const copy = m.loadBlockEntity(m.savedBlockEntity(v));
  check('copy: its copy draws the lid as the host\'s moves', copy instanceof m.EnderChestBlockEntity && copy.lidOpen && copy.openness(level.gameTime + 4) === C.openness(level.gameTime + 4));
  check('copy: but none of it is saved', C.save().data === undefined);
  lastMenu().removed();
  runEvents();
}

// ---------------------------------------------------------------------------
// kept with the player
{
  const inv = m.enderChestOf(alex);
  inv.container.set(3, (() => {
    const s = ItemStack.of('diamond_sword');
    s.damage = 123;
    return s;
  })());
  const saved = structuredClone(m.savePlayer(alex, 'overworld'));
  check('save: all 27 slots kept', Array.isArray(saved.enderItems) && saved.enderItems.length === 27);
  check('save: what\'s in them', saved.enderItems[0]?.[0] === 'diamond' && saved.enderItems[0][1] === 7 && saved.enderItems[26]?.[0] === 'iron_pickaxe' && saved.enderItems[3]?.[2] === 123 && saved.enderItems[1] === null);
  const back = new m.Player(level);
  m.loadPlayer(back, saved);
  const bc = m.enderChestOf(back).container;
  check('load: the same slots again', bc.get(0)?.item.id === 'diamond' && bc.get(0).count === 7 && bc.get(26)?.item.id === 'iron_pickaxe' && bc.get(3)?.damage === 123 && !bc.get(1));
  check('load: its own, not the one it was saved from', m.enderChestOf(back) !== inv && bc.get(0) !== inv.container.get(0));
  const old = structuredClone(saved);
  delete old.enderItems;
  const fresh = new m.Player(level);
  m.enderChestOf(fresh).container.set(0, ItemStack.of('dirt'));
  m.loadPlayer(fresh, old);
  check('load: a save from before ender chests, an empty one', m.enderChestOf(fresh).container.items.every((s) => !s));
  const other = structuredClone(m.savePlayer(steve, 'overworld'));
  check('save: each player\'s own', other.enderItems[5]?.[0] === 'emerald' && !other.enderItems[0]);
  // (dying: the inventory drops, the ender chest's slots don't)
  alex.inventory.main[4] = ItemStack.of('cobblestone', 20);
  const before = level.entities.filter((e) => e.type === 'item').length;
  m.dropDeathLoot(level, alex);
  const dropped = level.entities.filter((e) => e.type === 'item').slice(before).map((e) => e.item?.item.id ?? e.stack?.item.id);
  check('death: the inventory drops', dropped.includes('cobblestone'));
  check('death: none of the ender chest\'s', !dropped.includes('diamond') && !dropped.includes('iron_pickaxe') && !dropped.includes('diamond_sword'));
  m.resetForRespawn(alex, false);
  check('respawn: the ender chest\'s slots still there', inv.container.get(0)?.count === 7 && inv.container.get(3)?.damage === 123 && m.enderChestOf(alex) === inv);
}

m.setShowMenu(null);
await exitWithStatus(close);

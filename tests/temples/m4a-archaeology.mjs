// M4a: archaeology — the desert pyramid's suspicious sand (where it goes, its block entity and seeded loot table),
// the loot table itself (one roll with vanilla's seeded random), brushing with the brush through the game's own
// interaction (the strokes, the stages, the item out on the brushed side, the wear, the sounds), the count running
// back when brushing stops, falling and breaking, saving, and the brush's recipe.

import { load, check, flatLevel, place, prop, ticks, blockName, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/game/archaeology.ts', '/src/game/interaction.ts', '/src/entity/player.ts', '/src/inventory/recipes.ts', '/src/game/itemBehavior.ts',
  '/src/entity/fallingBlock.ts', '/src/world/gen/legacyRandom.ts',
]);
const G = 64;
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);
const live = (level, cls) => level.entities.filter((e) => !e.removed && (!cls || e instanceof cls));
const count = (sounds, name) => sounds.filter((s) => s.name === name).length;
const SHERDS = ['archer_pottery_sherd', 'miner_pottery_sherd', 'prize_pottery_sherd', 'skull_pottery_sherd'];
const TABLE = ['archer_pottery_sherd', 'miner_pottery_sherd', 'prize_pottery_sherd', 'skull_pottery_sherd', 'diamond', 'tnt', 'gunpowder', 'emerald'];

/** java.util.Random(seed).nextInt(8), worked out here on its own in BigInt */
function javaNextInt8(seed) {
  const M = (1n << 48n) - 1n;
  let s = (BigInt.asUintN(64, seed) ^ 0x5deece66dn) & M;
  s = (s * 0x5deece66dn + 0xbn) & M;
  const next31 = Number(s >> 17n);
  return Number((8n * BigInt(next31)) >> 31n);
}
/** vanilla BlockPos.asLong, here on its own */
const asLong = (x, y, z) => BigInt.asIntN(64, ((BigInt(x) & 0x3ffffffn) << 38n) | ((BigInt(z) & 0x3ffffffn) << 12n) | (BigInt(y) & 0xfffn));

// ---------------------------------------------------------------------------------------------------------------
// The loot table

{
  const t = m.LOOT_TABLES['archaeology/desert_pyramid'];
  check('loot: archaeology/desert_pyramid is one roll of eight entries of weight 1', t.length === 1 && t[0].rolls === 1 && t[0].entries.length === 8 && t[0].entries.every((e) => e.weight === 1 && !e.count));
  check('loot: the four sherds, a diamond, TNT, gunpowder and an emerald, in vanilla\'s order', t[0].entries.map((e) => e.item).join() === TABLE.join());
  let same = true, one = true;
  const seen = new Map();
  for (const [x, y, z] of [[0, 0, 0], [1, 64, -1], [-1234, 50, 5678], [29999999, 319, -29999999], [456, -30, 789], [-5, 70, 3]]) {
    const seed = asLong(x, y, z);
    const got = m.rollSeededLoot('archaeology/desert_pyramid', seed);
    if (got.length !== 1) one = false;
    if (seed !== 0n && got[0]?.item.id !== TABLE[javaNextInt8(seed)]) same = false;
  }
  for (let i = 0; i < 4000; i++) {
    const got = m.rollSeededLoot('archaeology/desert_pyramid', asLong(i * 7 - 9000, 40 + (i % 60), i * 13));
    seen.set(got[0].item.id, (seen.get(got[0].item.id) ?? 0) + 1);
  }
  check('loot: seeded, it rolls as java.util.Random(seed).nextInt(8) does', same);
  check('loot: always exactly one item', one);
  check('loot: all eight come up, about as often as each other', seen.size === 8 && [...seen.values()].every((n) => n > 380 && n < 620), JSON.stringify([...seen]));
  const a = m.rollSeededLoot('archaeology/desert_pyramid', 12345678901234n)[0].item.id, b = m.rollSeededLoot('archaeology/desert_pyramid', 12345678901234n)[0].item.id;
  check('loot: the same seed, the same item', a === b);
  check('loot: BlockPos.asLong as vanilla packs it (x 26 bits, z 26, y 12)', m.blockPosAsLong(1, 2, 3) === (1n << 38n) + (3n << 12n) + 2n && m.blockPosAsLong(-1, -1, -1) === -1n && m.blockPosAsLong(-5, 70, 3) === asLong(-5, 70, 3));
  check('items: the four sherds exist, 64 to a stack', SHERDS.every((id) => m.ITEMS.get(id)?.maxStack === 64));
  const brush = m.ITEMS.get('brush');
  check('items: the brush, one to a stack, 64 uses', brush?.maxStack === 1 && brush.maxDamage === 64);
  check('items: suspicious sand and gravel in the functional blocks tab', m.ITEMS.get('suspicious_sand')?.creativeTab === 'functional' && m.ITEMS.get('suspicious_gravel')?.creativeTab === 'functional');
}

// ---------------------------------------------------------------------------------------------------------------
// The desert pyramid's suspicious sand

{
  const fixed = (i) => ({ nextInt: () => i });
  let allOk = true, detail = '';
  const counts = [];
  for (let i = 0; i < 4; i++) {
    const p = new m.DesertPyramidPiece(987654321n, fixed(i), 1600 + i * 64, -3200);
    p.moveToY(70);
    // place it chunk by chunk as the workers do
    const ctxs = [];
    for (let cx = (p.box.minX >> 4) - 1; cx <= (p.box.maxX >> 4) + 1; cx++)
      for (let cz = (p.box.minZ >> 4) - 1; cz <= (p.box.maxZ >> 4) + 1; cz++) {
        const blocks = new Uint16Array(m.COLUMN_VOLUME);
        const SAND = m.S('sand');
        for (let y = m.MIN_Y; y < 70; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) blocks[m.colIndex(lx, y, lz)] = SAND;
        const ctx = new m.GenContext(cx, cz, blocks, new Uint8Array(256).fill(m.B.desert));
        ctx.computeHeightmaps();
        const chunk = new m.BoundingBox(ctx.x0, m.MIN_Y + 1, ctx.z0, ctx.x0 + 15, m.MAX_Y - 1, ctx.z0 + 15);
        if (p.box.intersects(chunk)) {
          p.postProcess(ctx, chunk, new m.Rand(cx * 31 + cz, 7));
          p.afterPlace(ctx, chunk);
        }
        ctxs.push(ctx);
      }
    const places = p.suspiciousSand();
    let sus = 0, roof = false;
    for (const [k, [x, y, z]] of places.entries()) {
      const ctx = ctxs.find((c) => c.inChunk(x, z));
      const n = blockName(m, ctx.getOrAir(x, y, z));
      const be = ctx.blockEntities.find((b) => b.x === x && b.y === y && b.z === z);
      if (n === 'suspicious_sand') {
        if (k === 0) roof = true;
        else sus++;
        if (!be || be.id !== 'brushable_block' || be.data.lootTable !== 'archaeology/desert_pyramid' || be.data.lootSeed !== asLong(x, y, z).toString()) {
          allOk = false;
          detail = JSON.stringify(be);
        }
      } else if (n !== 'sand' || be) allOk = false;
    }
    counts.push(sus);
    if (!roof || sus < 5 || sus > 7) allOk = false;
    // nothing else in the pyramid is suspicious
    const all = ctxs.reduce((a, c) => a + c.blockEntities.filter((b) => b.id === 'brushable_block').length, 0);
    if (all !== sus + 1) allOk = false;
  }
  check('pyramid: the collapsed roof\'s place and 5-7 of the cellar\'s are suspicious sand, the rest of the cellar plain sand', allOk, detail);
  check('pyramid: each with the archaeology loot table, seeded by its BlockPos.asLong', allOk);
  console.log(`     (cellar suspicious sand in the four orientations: ${counts.join(', ')})`);
}

// ---------------------------------------------------------------------------------------------------------------
// Brushing, through the game's interaction

/** a flat world, a suspicious block at (0, G, 0) with the pyramid's loot table, and a player south of it looking at its south face */
function scene(name = 'suspicious_sand', { creative = false, face = 'south' } = {}) {
  const { level, world, sounds, particles } = flatLevel(m, -1, -1, 1, 1);
  const bx = 0, by = G, bz = 0;
  place(m, level, name, bx, by, bz);
  const be = world.getBlockEntity(bx, by, bz);
  be.lootTable = 'archaeology/desert_pyramid';
  be.lootSeed = asLong(bx, by, bz);
  const p = new m.Player(level);
  if (creative) p.gameMode = 'creative';
  // standing on the stone two blocks south, eyes level with the block's middle: looking north (yaw 180) and down
  if (face === 'south') p.moveTo(0.5, G, 2.5, 180, 0);
  else p.moveTo(0.5, G + 1, 0.5, 0, 90); // on top of it, looking straight down: the up face
  const eye = p.y + p.eyeHeight;
  if (face === 'south') p.pitch = (Math.atan2(eye - (G + 0.5), 1.5) * 180) / Math.PI;
  level.addEntity(p);
  level.player = p;
  const inter = new m.Interaction(level, p);
  const brush = stack('brush');
  p.inventory.main[0] = brush;
  p.inventory.selected = 0;
  // (the items that come out, as they come: the player standing by picks them up at once)
  const dropped = [];
  const add = level.addEntity.bind(level);
  level.addEntity = (e) => {
    if (e instanceof m.ItemEntity) dropped.push({ e, x: e.x, y: e.y, z: e.z, dx: e.dx, dy: e.dy, dz: e.dz, delay: e.pickupDelay, id: e.stack.item.id, n: e.stack.count });
    add(e);
  };
  return { level, world, sounds, particles, be, p, inter, brush, bx, by, bz, dropped };
}

/** one game tick as game.ts runs it: the use button, the item in use, the level */
function tick(s, held = true) {
  s.inter.pick(s.p.x, s.p.y + s.p.eyeHeight, s.p.z, s.p.yaw, s.p.pitch);
  s.inter.use(false, held);
  s.inter.tickUsingItem();
  s.level.tick();
}

{
  const s = scene();
  const { level, be, p, inter, brush, sounds } = s;
  check('brush: the suspicious sand has its block entity', be instanceof m.BrushableBlockEntity && be.id === 'brushable_block');
  check('brush: a hit from the eyes lands on the south face', m.brushTarget(level, p)?.face === 3 && m.brushTarget(level, p)?.x === 0);
  inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
  const swings = p.swingTime ?? 0;
  inter.use(true, true);
  check('brush: a click on the block starts using the brush, for 200 ticks', p.isUsingItem() && p.useItem === brush && p.useDuration === 200);
  check('brush: the arm doesn\'t swing (vanilla CONSUME)', !p.swinging && (p.swingTime ?? 0) === swings);
  const dusted = [];
  const strokes = [];
  let doneAt = -1;
  for (let t = 1; t <= 120 && doneAt < 0; t++) {
    const before = count(sounds, 'item.brush.brushing.sand');
    tick(s);
    if (count(sounds, 'item.brush.brushing.sand') > before) strokes.push(t);
    const n = blockName(m, level.getState(0, G, 0));
    if (n === 'suspicious_sand') dusted.push(prop(m, level, 0, G, 0, 'dusted'));
    else doneAt = t;
  }
  check('brush: a stroke every 10 ticks, the first 5 ticks in', strokes.slice(0, 10).join() === '5,15,25,35,45,55,65,75,85,95', strokes.join());
  const stageAt = (d) => dusted.indexOf(d) + 1;
  check('brush: dusted 1 at the first stroke, 2 at the third, 3 at the sixth', stageAt(1) === 5 && stageAt(2) === 25 && stageAt(3) === 55, `${stageAt(1)} ${stageAt(2)} ${stageAt(3)}`);
  check('brush: the tenth stroke brushes it away into plain sand', doneAt === 95 && blockName(m, level.getState(0, G, 0)) === 'sand', `${doneAt}`);
  const items = s.dropped;
  const want = TABLE[javaNextInt8(asLong(0, G, 0))];
  check('brush: what it held comes out: the seeded roll of its loot table', items.length === 1 && items[0].id === want && items[0].n === 1, items.map((e) => e.id).join());
  const it = items[0];
  check('brush: out on the brushed (south) side, in the middle of that block, 0.625 up', it && Math.abs(it.x - 0.5) < 1e-9 && Math.abs(it.z - 1.5) < 1e-9 && Math.abs(it.y - (G + 0.625)) < 1e-9, it && `${it.x} ${it.y} ${it.z}`);
  check('brush: at rest (no toss) and free to pick up at once', it && it.delay === 0 && it.dx === 0 && it.dy === 0 && it.dz === 0);
  check('brush: the player standing by has picked it up', p.inventory.main.some((x) => x?.item.id === want));
  check('brush: the completion sound, once', count(sounds, 'item.brush.brushing.sand.complete') === 1);
  check('brush: the brush wore one point', brush.damage === 1);
  check('brush: its block entity is gone with it', !s.world.getBlockEntity(0, G, 0));
  // brushing on: plain sand is brushed with the generic sound, nothing happens to it
  const gen = count(sounds, 'item.brush.brushing.generic');
  for (let t = 0; t < 30; t++) tick(s);
  check('brush: plain sand gets the generic stroke sound and stays', count(sounds, 'item.brush.brushing.generic') > gen && blockName(m, level.getState(0, G, 0)) === 'sand' && brush.damage === 1);
  // letting go stops it
  tick(s, false);
  check('brush: letting go of the button stops brushing', !p.isUsingItem());
}

{
  // looking away stops it; in creative the brush doesn't wear
  const s = scene('suspicious_gravel', { creative: true });
  s.inter.pick(s.p.x, s.p.y + s.p.eyeHeight, s.p.z, s.p.yaw, s.p.pitch);
  s.inter.use(true, true);
  for (let t = 0; t < 100; t++) tick(s);
  check('gravel: brushed away into gravel, with the gravel sounds', blockName(m, s.level.getState(0, G, 0)) === 'gravel' && count(s.sounds, 'item.brush.brushing.gravel') >= 10 && count(s.sounds, 'item.brush.brushing.gravel.complete') === 1);
  check('creative: the brush doesn\'t wear', s.brush.damage === 0);
  s.p.pitch = -90; // look up: nothing but air
  tick(s);
  check('brush: looking away at nothing stops it', !s.p.isUsingItem());
}

{
  // the count creeps back: 4 strokes, then away for 2 seconds, then 2 strokes every 4 ticks
  const s = scene();
  const { level, be, p } = s;
  s.inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
  s.inter.use(true, true);
  for (let t = 0; t < 36; t++) tick(s);
  check('reset: four strokes, dusted 2, the south face remembered', be.brushCount === 4 && prop(m, level, 0, G, 0, 'dusted') === 2 && be.hitDirection === 3, `${be.brushCount}`);
  tick(s, false);
  const stoppedAt = level.gameTime;
  const last = be.brushCountResetsAtTick;
  let at2 = -1, at0 = -1;
  for (let t = 0; t < 80; t++) {
    s.level.tick();
    if (at2 < 0 && be.brushCount === 2) at2 = level.gameTime;
    if (at0 < 0 && be.brushCount === 0) at0 = level.gameTime;
  }
  check('reset: 40 ticks after the last stroke two are forgotten, then two more 4 ticks on', at2 >= last && at2 <= last + 2 && at0 >= at2 + 4 && at0 <= at2 + 6, `stopped ${stoppedAt} last ${last} ${at2} ${at0}`);
  check('reset: back to dusted 0, no face remembered', prop(m, level, 0, G, 0, 'dusted') === 0 && be.hitDirection === null && be.brushCount === 0);
  check('reset: the loot was rolled at the first stroke and is kept', be.lootTable === null && be.item?.item.id === TABLE[javaNextInt8(asLong(0, G, 0))]);
}

{
  // the top face: brushed from above, the item comes out on top
  const s = scene('suspicious_sand', { face: 'up' });
  s.inter.pick(s.p.x, s.p.y + s.p.eyeHeight, s.p.z, s.p.yaw, s.p.pitch);
  s.inter.use(true, true);
  for (let t = 0; t < 100; t++) tick(s);
  const it = s.dropped[0];
  check('brush: from above, the item comes out on top', blockName(m, s.level.getState(0, G, 0)) === 'sand' && it && Math.abs(it.y - (G + 1.625)) < 1e-9 && Math.abs(it.x - 0.5) < 1e-9 && Math.abs(it.z - 0.5) < 1e-9, it && `${it.x} ${it.y} ${it.z}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Falling, breaking, saving

{
  const { level, world, sounds } = flatLevel(m, -1, -1, 1, 1);
  // suspicious sand on a column of stone over a gap: take the stone away and it falls, breaking where it lands
  for (let y = G; y < G + 4; y++) place(m, level, 'stone', 0, y, 0);
  place(m, level, 'suspicious_sand', 0, G + 4, 0);
  const be = world.getBlockEntity(0, G + 4, 0);
  be.lootTable = 'archaeology/desert_pyramid';
  be.lootSeed = 99n;
  ticks(level, 5);
  check('fall: on something solid it stays', blockName(m, level.getState(0, G + 4, 0)) === 'suspicious_sand');
  for (let y = G; y < G + 4; y++) level.destroyBlock(0, y, 0, false);
  ticks(level, 1);
  const falling = live(level).filter((e) => e.type === 'falling_block');
  ticks(level, 2);
  const falling2 = live(level).filter((e) => e.type === 'falling_block');
  check('fall: two ticks after the block under it goes, it falls', falling.length === 0 && falling2.length === 1 && blockName(m, level.getState(0, G + 4, 0)) === 'air');
  const breaks = count(sounds, 'block.suspicious_sand.break');
  ticks(level, 60);
  check('fall: it breaks where it lands: not placed, no item, the break sound', blockName(m, level.getState(0, G, 0)) === 'air' && live(level).filter((e) => e.type === 'falling_block' || e.type === 'item').length === 0 && count(sounds, 'block.suspicious_sand.break') === breaks + 1);
  // a column: one over another over sand that falls
  place(m, level, 'stone', 3, G + 1, 0);
  place(m, level, 'sand', 3, G + 2, 0);
  place(m, level, 'suspicious_sand', 3, G + 3, 0);
  place(m, level, 'suspicious_gravel', 3, G + 4, 0);
  ticks(level, 5);
  level.destroyBlock(3, G + 1, 0, false);
  ticks(level, 80);
  check('fall: sand falling from under a suspicious block brings it down too (and the one above it)', blockName(m, level.getState(3, G + 3, 0)) === 'air' && blockName(m, level.getState(3, G + 4, 0)) === 'air' && blockName(m, level.getState(3, G, 0)) === 'sand');
  // broken, it drops nothing (not even what's in it)
  place(m, level, 'suspicious_gravel', 6, G, 0);
  const be2 = world.getBlockEntity(6, G, 0);
  be2.item = stack('diamond');
  level.destroyBlock(6, G, 0, true, m.ITEMS.get('diamond_shovel'), true, stack('diamond_shovel'));
  check('break: nothing drops, not even what it held', live(level).filter((e) => e.type === 'item').length === 0);
  check('break: a shovel\'s block, a quarter second to break', m.getBlock('suspicious_sand').s.tool === 'shovel' && m.getBlock('suspicious_sand').s.hardness === 0.25);
  // saving
  place(m, level, 'suspicious_sand', 8, G, 0);
  const b3 = world.getBlockEntity(8, G, 0);
  b3.lootTable = 'archaeology/desert_pyramid';
  b3.lootSeed = -1234567890123456789n;
  b3.hitDirection = 4;
  const d = JSON.parse(JSON.stringify(b3.save()));
  const back = m.loadBlockEntity(d);
  check('save: the loot table and its 64-bit seed come back', back.lootTable === 'archaeology/desert_pyramid' && back.lootSeed === -1234567890123456789n && back.hitDirection === 4);
  b3.unpackLootTable(null);
  const d2 = JSON.parse(JSON.stringify(b3.save()));
  const back2 = m.loadBlockEntity(d2);
  check('save: once rolled, the item comes back instead', back2.lootTable === null && back2.item?.item.id === b3.item?.item.id && !!b3.item);
  const gen = JSON.parse(JSON.stringify({ id: 'brushable_block', x: 1, y: 2, z: 3, items: [], data: { lootTable: 'archaeology/desert_pyramid', lootSeed: asLong(1, 2, 3).toString() } }));
  const fromGen = m.loadBlockEntity(gen);
  check('save: a generated one loads as a brushable block entity', fromGen instanceof m.BrushableBlockEntity && fromGen.lootSeed === asLong(1, 2, 3));
}

// ---------------------------------------------------------------------------------------------------------------
// The recipe

{
  const g = [null, stack('feather'), null, null, stack('copper_ingot'), null, null, stack('stick'), null];
  const r = m.findRecipe(g, 3, 3);
  check('recipe: a feather over a copper ingot over a stick makes a brush', r?.result === 'brush' && r.count === 1);
}

await exitWithStatus(close);

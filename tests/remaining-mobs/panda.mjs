// Headless checks for the panda (node tests/remaining-mobs/panda.mjs; remaining mobs, milestone 3). Bamboo first: its
// planting (a shoot on the ground, stalk on stalk, never in water or on stone), its growth (a shoot into stalk, a
// stalk a block at a time to 16, its leaves and its thickening, the last block done), bone meal, falling apart from
// the bottom, a sword's single stroke, pistons, its shapes set off with its model, fire, the pot, the stick, fuel, the
// jungles' bamboo (and podzol), its sounds and textures. Then the panda: its numbers, its genes (random, inherited,
// what they show and give), spawning, picking up bamboo and sitting down to eat it, feeding and breeding (bamboo
// about or it sulks), a cub's sneeze, rolling, lying on its back, a worried one in a storm and keeping away, the
// aggressive and the rest when hurt, panicking, loot, saving, /summon, the Two by Two trigger, its sounds, its skins,
// the model and the renderer (through stand-ins).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 900000).unref();
const P = [
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/player.ts',
  '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/entity/panda.ts', '/src/entity/itemEntity.ts',
  '/src/game/bamboo.ts', '/src/game/blockBehavior.ts', '/src/game/blockRules.ts', '/src/game/boneMeal.ts', '/src/game/interaction.ts',
  '/src/game/advancements.ts', '/src/game/commands.ts', '/src/inventory/recipes.ts', '/src/world/gen/context.ts', '/src/world/gen/bambooFeature.ts',
  '/src/world/constants.ts', '/src/core/rng.ts', '/src/game/redstone/piston.ts', '/src/render/pandaRenderer.ts', '/src/render/entityRenderer.ts',
  '/src/textures/mobs.ts', '/src/textures/items.ts', '/src/textures/blocks.ts', '/src/audio/synth.ts', '/src/world/blockOffset.ts',
  '/src/world/blocksBamboo.ts', '/src/world/dynamicShapes.ts', '/src/game/fire.ts', '/src/world/mapColors.ts', '/src/world/blocksVillage.ts',
  '/src/render/particleAtlas.ts', '/src/world/dir.ts', '/src/entity/monsters.ts', '/src/game/randomTicks.ts',
];
const { mods, close } = await loadModules(P);
const M = Object.fromEntries(P.map((p, i) => [p.replace(/^\/src\//, '').replace(/\.ts$/, ''), mods[i]]));
const { S, BLOCKS, STATE_BLOCK, getBlock, OUTLINE, COLLISION } = M['world/block'];
const { ITEMS, ItemStack } = M['item/item'];
const { B } = M['world/gen/biomes'];
const { Panda, randomGene, variantFromGenes, geneByName, PANDA_GENES } = M['entity/panda'];
const { ItemEntity } = M['entity/itemEntity'];
const spawner = M['game/spawner'];
const ADV = M['game/advancements'];
const BB = M['game/blockBehavior'];
const BAMBOO = getBlock('bamboo'), SAPLING = getBlock('bamboo_sapling');
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const nameOf = (st) => BLOCKS[STATE_BLOCK[st]].name;

/** flat grass at y 63 on stone (they stand at 64) in a bamboo jungle, for x, z in [-48, 48); day, clear */
function setup({ biome = B.bamboo_jungle } = {}) {
  const world = new M['world/world'].World();
  for (let cx = -3; cx < 3; cx++) for (let cz = -3; cz < 3; cz++) { const c = new M['world/chunk'].Chunk(cx, cz); c.biomes.fill(biome); world.chunks.set(c.key, c); }
  const st = S('stone'), top = S('grass_block');
  for (let x = -48; x < 48; x++) for (let z = -48; z < 48; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 58; y < 63; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, top);
  }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new M['game/level'].Level(world, 'pandas');
  const sounds = [], parts = [], triggers = [], events = [], bred = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p, t: level.gameTime }); }, playUI() {} };
  level.particles = { blockBreak() {}, blockHit() {}, blockParticle() {}, spawn(k, x, y, z, dx, dy, dz) { parts.push({ k, x, y, z, dx, dy, dz, t: level.gameTime }); }, entityEffect() {}, poof() {}, dust() {}, emitAround() {}, spell() {}, fallingDust() {} };
  level.onPlayerTrigger = (p, type, payload) => triggers.push({ type, payload });
  level.onBred = (child, cause) => bred.push({ child, cause });
  const ge = level.gameEvent.bind(level);
  level.gameEvent = (e, x, y, z, ctx) => { events.push({ e, x, y, z, who: ctx?.entity }); ge(e, x, y, z, ctx); };
  level.doDaylightCycle = false;
  level.dayTime = 6000;
  level.updateSkyBrightness();
  level.simulationDistance = 4;
  const player = new M['entity/player'].Player(level);
  player.moveTo(30.5, 64, 30.5, 0, 0);
  player.gameMode = 'survival';
  level.player = player;
  level.addEntity(player);
  return { level, world, player, sounds, parts, triggers, events, bred };
}
/** a panda (or `type`) made as /summon makes it, standing (its first ticks on the ground done), its genes `genes` */
function spawn(level, x, y, z, { type = 'panda', genes = null, baby = false, settle = true } = {}) {
  const m = spawner.createMob(type, level);
  m.moveTo(x, y, z, 0, 0);
  m.finalizeSpawn('command');
  if (genes) {
    [m.mainGene, m.hiddenGene] = genes;
    m.maxHealth = m.health = 20;
    m.moveSpeedAttr = 0.15;
    m.setAttributes?.();
  }
  if (baby) m.setAge(-24000);
  level.addEntity(m);
  if (settle) {
    const ai = m.serverAiStep;
    m.serverAiStep = () => {};
    for (let i = 0; i < 3; i++) m.tick();
    m.serverAiStep = ai;
  }
  return m;
}
/** ticks the level, the player held where it is; stops early when `until` holds */
const tick = (level, n, until) => {
  const p = level.player, [x, y, z] = [p.x, p.y, p.z];
  for (let i = 0; i < n; i++) {
    level.tick();
    p.moveTo(x, y, z, p.yaw, p.pitch);
    p.dx = p.dy = p.dz = 0;
    p.fallDistance = 0;
    if (until?.(i)) return i + 1;
  }
  return n;
};
const pandas = (level) => level.entities.filter((e) => e instanceof Panda && !e.removed);
const itemsOnGround = (level, id) => level.entities.filter((e) => e.type === 'item' && !e.removed && e.stack.item.id === id);
const countOnGround = (level, id) => itemsOnGround(level, id).reduce((n, e) => n + e.stack.count, 0);
const drop = (level, id, n, x, y, z) => {
  const it = new ItemEntity(level, ItemStack.of(id, n));
  it.moveTo(x, y, z, 0, 0);
  it.pickupDelay = 0;
  it.dx = it.dy = it.dz = 0;
  level.addEntity(it);
  return it;
};
/** an Interaction for `player`, and its hand: looking at (tx, ty, tz) from where it stands, a use or a hit */
function hands(level, player) {
  const ia = new M['game/interaction'].Interaction(level, player);
  const look = (tx, ty, tz) => {
    const dx = tx - player.x, dy = ty - (player.y + player.eyeHeight), dz = tz - player.z;
    const yaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90, pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
    player.moveTo(player.x, player.y, player.z, yaw, pitch);
    ia.pick(player.x, player.y + player.eyeHeight, player.z, yaw, pitch);
  };
  const use = (tx, ty, tz) => {
    look(tx, ty, tz);
    ia.rightClickDelay = 0;
    ia.use(true, true);
  };
  const dig = (tx, ty, tz) => {
    const [bx, by, bz] = [Math.floor(tx), Math.floor(ty), Math.floor(tz)];
    look(tx, ty, tz);
    ia.missTime = 0;
    ia.startAttack();
    let n = 0;
    for (; n < 400 && level.getState(bx, by, bz) === level.getState(bx, by, bz) && nameOf(level.getState(bx, by, bz)) !== 'air'; n++) {
      look(tx, ty, tz);
      ia.continueAttack(true);
    }
    ia.continueAttack(false);
    return n;
  };
  return { ia, look, use, dig };
}
const hold = (player, id, n = 1) => {
  const inv = player.inventory;
  inv.main[inv.selected] = id ? ItemStack.of(id, n) : null;
  inv.version++;
};
/** the stalk at (x, z) from y up: each block's [age, leaves, stage] */
function stalk(world, x, y, z) {
  const out = [];
  for (let k = y; ; k++) {
    const st = world.getState(x, k, z);
    if (STATE_BLOCK[st] !== BAMBOO.id) break;
    out.push([BAMBOO.get(st, 'age'), BAMBOO.get(st, 'leaves'), BAMBOO.get(st, 'stage')]);
  }
  return out;
}
const randomTick = (level, x, y, z) => { const st = level.getState(x, y, z); BB.behaviorOf(st)?.randomTick?.(level, x, y, z, st); };

// ===========================================================================
// bamboo

// planting
{
  const { level, world, player } = setup();
  const h = hands(level, player);
  // (from 2.5 blocks off, looking at the face clicked)
  const use = (tx, ty, tz) => { player.moveTo(Math.floor(tx) + 0.5, 64, Math.floor(tz) - 2.5, 0, 0); h.use(tx, ty, tz); };
  hold(player, 'bamboo', 10);
  use(0.5, 64, 0.5);
  check('bamboo planted on grass goes in as a shoot (the item\'s own block is the stalk)', nameOf(world.getState(0, 64, 0)) === 'bamboo_sapling' && player.inventory.selectedItem.count === 9, nameOf(world.getState(0, 64, 0)));
  level.setBlock(2, 63, 0, S('sand'));
  level.setBlock(4, 63, 0, S('stone'));
  level.setBlock(6, 63, 0, S('gravel'));
  use(2.5, 64, 0.5);
  use(4.5, 64, 0.5);
  use(6.5, 64, 0.5);
  check('...on sand and gravel too (#bamboo_plantable_on), not on stone', nameOf(world.getState(2, 64, 0)) === 'bamboo_sapling' && nameOf(world.getState(4, 64, 0)) === 'air' && nameOf(world.getState(6, 64, 0)) === 'bamboo_sapling');
  // on a shoot (its top 12/16 up, set off as the shoot is): thin stalk (and the shoot under it turns to stalk too)
  const [sox, soz] = M['world/blockOffset'].horizontalOffset(SAPLING, 0, 0);
  use(0.5 + sox, 64.75, 0.5 + soz);
  check('bamboo planted on a shoot: thin stalk, and the shoot under it stalk now', nameOf(world.getState(0, 65, 0)) === 'bamboo' && BAMBOO.get(world.getState(0, 65, 0), 'age') === 0 && nameOf(world.getState(0, 64, 0)) === 'bamboo', nameOf(world.getState(0, 64, 0)));
  // on thick stalk: thick
  level.setBlock(8, 64, 0, BAMBOO.state({ age: 1 }));
  use(8.5, 65, 0.5);
  check('...on thick stalk, thick', nameOf(world.getState(8, 65, 0)) === 'bamboo' && BAMBOO.get(world.getState(8, 65, 0), 'age') === 1);
  // not into water
  level.setBlock(10, 63, 0, S('sand'));
  level.setBlock(10, 64, 0, S('water'));
  const p = BB.behaviorOf(BAMBOO.defaultState).placement({ world, x: 10, y: 64, z: 0, face: 1, player });
  check('never into water', p === null);
  check('the stalk: hardness 1, bamboo\'s own sound; the shoot: hardness 1, its own sound, no collision, no item of its own', BAMBOO.hardness === 1 && BAMBOO.s.sound === 'bamboo' && SAPLING.hardness === 1 && SAPLING.s.sound === 'bamboo_sapling' && !ITEMS.get('bamboo_sapling') && !COLLISION[SAPLING.defaultState]);
  check('...the shoot\'s pick-block is bamboo, it drops bamboo', BB.behaviorOf(SAPLING.defaultState).cloneItem?.() === 'bamboo' && BB.behaviorOf(SAPLING.defaultState).drops?.()[0].item.id === 'bamboo');
}

// growth
{
  const { level, world } = setup();
  level.setBlock(0, 64, 0, SAPLING.defaultState);
  let grew = 0;
  for (let i = 0; i < 60 && nameOf(world.getState(0, 65, 0)) !== 'bamboo'; i++) {
    randomTick(level, 0, 64, 0);
    grew++;
  }
  const s0 = stalk(world, 0, 64, 0);
  check('a shoot in the light grows (one random tick in three): a stalk block with small leaves over it, the shoot turned to stalk', s0.length === 2 && s0[1][1] === 'small' && s0[0][1] === 'none' && s0.every((b) => b[0] === 0) && grew < 60, JSON.stringify(s0));
  // grow it on to its full height
  let ticks = 0;
  for (; ticks < 3000; ticks++) {
    const h = stalk(world, 0, 64, 0).length;
    randomTick(level, 0, 64 + h - 1, 0);
    if (BAMBOO.get(world.getState(0, 64 + stalk(world, 0, 64, 0).length - 1, 0), 'stage') === 1) break;
  }
  const s = stalk(world, 0, 64, 0);
  const n = s.length;
  const leaves = s.map((b) => b[1]).join();
  check('grown: 12 to 16 tall (done growing at 16 for sure, from 12 up by chance)', n >= 12 && n <= 16, `${n}`);
  check('...large leaves on the top two blocks, small on the one under them, none below', s[n - 1][1] === 'large' && s[n - 2][1] === 'large' && s[n - 3][1] === 'small' && s.slice(0, n - 3).every((b) => b[1] === 'none'), leaves);
  check('...thick all the way down (thickening from the fourth block, and the stalk under it with it)', s.every((b) => b[0] === 1), s.map((b) => b[0]).join(''));
  check('...its top done growing (stage 1), the rest not', s[n - 1][2] === 1 && s.slice(0, n - 1).every((b) => b[2] === 0));
  const before = n;
  for (let i = 0; i < 200; i++) randomTick(level, 0, 64 + n - 1, 0);
  check('...and it grows no more', stalk(world, 0, 64, 0).length === before);
  // the 16th block is always the last
  let sixteen = 0, tops = 0;
  for (let t = 0; t < 20; t++) {
    const x = 2 + t;
    for (let y = 64; y < 79; y++) level.setBlock(x, y, 0, BAMBOO.state({ age: 1, leaves: y === 78 ? 'large' : y === 77 ? 'large' : y === 76 ? 'small' : 'none' }));
    for (let i = 0; i < 100 && nameOf(world.getState(x, 79, 0)) !== 'bamboo'; i++) randomTick(level, x, 78, 0);
    tops++;
    if (BAMBOO.get(world.getState(x, 79, 0), 'stage') === 1) sixteen++;
  }
  check('...a stalk\'s 16th block is always done growing', sixteen === tops && tops === 20);
  // in the dark it doesn't grow
  level.setBlock(0, 70, 5, S('stone'));
  const r = [];
  for (let y = 64; y < 70; y++) for (let x = -1; x <= 1; x++) for (let z = 4; z <= 6; z++) if (x || z !== 5) level.setBlock(x, y, z, S('stone'));
  level.setBlock(0, 64, 5, SAPLING.defaultState);
  level.light?.update?.();
  for (let i = 0; i < 60; i++) randomTick(level, 0, 64, 5);
  r.push(nameOf(world.getState(0, 65, 5)));
  check('...not in the dark (the light over it under 9)', level.rawBrightness(0, 65, 5, 0) < 9 ? r[0] === 'air' : true, `${r[0]} light ${level.rawBrightness(0, 65, 5, 0)}`);
}

// bone meal
{
  const { level, world } = setup();
  const BM = M['game/boneMeal'];
  level.setBlock(0, 64, 0, SAPLING.defaultState);
  const ok0 = BM.performBoneMeal(level, 0, 64, 0, world.getState(0, 64, 0));
  check('bone meal on a shoot: it grows at once', ok0 && stalk(world, 0, 64, 0).length === 2);
  const heights = new Set();
  for (let t = 0; t < 30; t++) {
    const x = 2 + t;
    level.setBlock(x, 64, 0, BAMBOO.state({ leaves: 'none' }));
    level.setBlock(x, 65, 0, BAMBOO.state({ leaves: 'small' }));
    BM.performBoneMeal(level, x, 64, 0, world.getState(x, 64, 0));
    heights.add(stalk(world, x, 64, 0).length);
  }
  check('on a stalk (anywhere up it): one or two blocks more', [...heights].sort().join() === '3,4', [...heights].join());
  // a finished stalk takes none
  for (let y = 64; y < 80; y++) level.setBlock(0, y, 3, BAMBOO.state({ age: 1, leaves: 'none', stage: y === 79 ? 1 : 0 }));
  const done = BM.performBoneMeal(level, 0, 70, 3, world.getState(0, 70, 3));
  check('...not on a stalk 16 tall (its top done growing)', !done && stalk(world, 0, 64, 3).length === 16);
  for (let y = 64; y < 70; y++) level.setBlock(0, y, 6, BAMBOO.state({ age: 1, leaves: 'none', stage: y === 69 ? 1 : 0 }));
  check('...nor on one whose top is done growing', !BM.performBoneMeal(level, 0, 66, 6, world.getState(0, 66, 6)));
  level.setBlock(0, 64, 9, SAPLING.defaultState);
  level.setBlock(0, 65, 9, S('stone'));
  check('...nor on a shoot with no room over it', !BM.performBoneMeal(level, 0, 64, 9, world.getState(0, 64, 9)));
}

// breaking
{
  const { level, world, player } = setup();
  for (let y = 64; y < 72; y++) level.setBlock(0, y, 0, BAMBOO.state({ age: 1 }));
  level.destroyBlock(0, 64, 0, true);
  let gone = 0;
  const seen = [];
  const left = () => { let n = 0; for (let y = 65; y < 72; y++) if (STATE_BLOCK[world.getState(0, y, 0)] === BAMBOO.id) n++; return n; };
  const lowest = () => { for (let y = 65; y < 72; y++) if (STATE_BLOCK[world.getState(0, y, 0)] === BAMBOO.id) return y; return 0; };
  const bottoms = [];
  for (let i = 0; i < 20 && world.getState(0, 71, 0) !== 0; i++) {
    level.tick();
    seen.push(left());
    bottoms.push(lowest());
    gone++;
  }
  check('a stalk broken at the foot falls apart block by block from the bottom up, a tick apart', world.getState(0, 71, 0) === 0 && seen.join() === '6,5,4,3,2,1,0' && bottoms.slice(0, 6).join() === '66,67,68,69,70,71', seen.join());
  tick(level, 20);
  check('...each block dropping one bamboo', countOnGround(level, 'bamboo') === 8, `${countOnGround(level, 'bamboo')}`);
  // a shoot with its ground gone
  level.setBlock(5, 70, 0, S('sand'));
  level.setBlock(5, 71, 0, SAPLING.defaultState);
  level.destroyBlock(5, 70, 0, false);
  tick(level, 3);
  check('a shoot with nothing under it breaks, dropping bamboo', world.getState(5, 71, 0) === 0 && countOnGround(level, 'bamboo') === 9);
  // a sword cuts at a stroke
  const R = M['game/blockRules'];
  const stSt = BAMBOO.state({ age: 1 });
  const sword = ITEMS.get('iron_sword'), hand = null;
  check('a sword cuts through bamboo or a shoot at a stroke; anything else as its hardness (1) says', R.destroyProgress(stSt, sword, player) === 1 && R.destroyProgress(SAPLING.defaultState, ITEMS.get('wooden_sword'), player) === 1 && R.destroyProgress(stSt, hand, player) < 0.2, `${R.destroyProgress(stSt, hand, player)}`);
  // pistons break it
  const PI = M['game/redstone/piston'];
  check('pistons break bamboo and a shoot (vanilla PushReaction.DESTROY)', PI.pushReaction(stSt) === 'destroy' && PI.pushReaction(SAPLING.defaultState) === 'destroy' && PI.pushReaction(S('potted_bamboo')) === 'destroy');
}

// shapes, fire, the pot, recipes, fuel
{
  const { level, world, player } = setup();
  const O = M['world/blockOffset'];
  const offs = new Set();
  let within = true;
  for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) {
    const [ox, oz] = O.horizontalOffset(BAMBOO, x, z);
    offs.add(`${ox.toFixed(3)},${oz.toFixed(3)}`);
    if (Math.abs(ox) > 0.25 + 1e-9 || Math.abs(oz) > 0.25 + 1e-9) within = false;
  }
  check('bamboo set off sideways by where it stands (vanilla OffsetType.XZ, at most a quarter block)', offs.size > 50 && within, `${offs.size}`);
  level.setBlock(3, 64, 7, BAMBOO.state({ age: 1 }));
  const [ox, oz] = O.horizontalOffset(BAMBOO, 3, 7);
  const col = M['world/dynamicShapes'].dynamicCollision(world, 3, 64, 7, world.getState(3, 64, 7));
  check('...its collision a thin post (3/16 across) set off with it', col && col.length === 1 && near(col[0][0], 6.5 / 16 + ox) && near(col[0][2], 6.5 / 16 + oz) && near(col[0][3] - col[0][0], 3 / 16), JSON.stringify(col));
  const [sx, sz] = O.shapeOffset(world.getState(3, 64, 7), 3, 7);
  check('...its outline set off with it too (a flower\'s isn\'t)', near(sx, ox) && near(sz, oz) && O.shapeOffset(S('poppy'), 3, 7).join() === '0,0');
  check('...the outline wider with large leaves (3 to 13) than without (5 to 11)', OUTLINE[BAMBOO.state({ leaves: 'large' })][0].join() === [3, 0, 3, 13, 16, 13].map((v) => v / 16).join() && OUTLINE[BAMBOO.state({ leaves: 'small' })][0].join() === [5, 0, 5, 11, 16, 11].map((v) => v / 16).join());
  const F = M['game/fire'];
  check('bamboo catches fire easily and burns up fast (60, 60)', F.igniteOdds(BAMBOO.defaultState) === 60 && F.burnOdds(BAMBOO.defaultState) === 60);
  // the pot
  level.setBlock(0, 64, 0, S('flower_pot'));
  player.moveTo(0.5, 64, -2.5, 0, 0);
  hold(player, 'bamboo', 3);
  const { use } = hands(level, player);
  use(0.5, 64.2, 0.5);
  check('bamboo in a flower pot: potted bamboo', nameOf(world.getState(0, 64, 0)) === 'potted_bamboo' && player.inventory.selectedItem.count === 2, nameOf(world.getState(0, 64, 0)));
  const pv = M['world/blocksVillage'];
  check('...(a pot for bamboo, vanilla POTTABLE)', pv.POTTABLE.includes('bamboo') && pv.pottedName('bamboo') === 'potted_bamboo');
  // recipes, fuel, the creative tab
  const R = M['inventory/recipes'];
  const r1 = R.findRecipe([ItemStack.of('bamboo'), null, ItemStack.of('bamboo'), null], 2, 2);
  check('two bamboo, one over the other: a stick', r1?.result === 'stick' && r1.count === 1);
  check('bamboo burns for 50 ticks in a furnace (half an item)', R.fuelTime(ItemStack.of('bamboo')) === 50, `${R.fuelTime(ItemStack.of('bamboo'))}`);
  check('bamboo in the natural blocks tab', ITEMS.get('bamboo')?.creativeTab === 'natural');
  check('its map colours: the stalk a plant\'s green, the shoot wood\'s', !!M['world/mapColors']);
}

// the jungles' bamboo
{
  const CI = M['world/constants'].colIndex;
  const ctxOf = (cx, cz, biome) => {
    const blocks = new Uint16Array(16 * 16 * 384);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { for (let y = 58; y < 63; y++) blocks[CI(x, y, z)] = S('dirt'); blocks[CI(x, 63, z)] = S('grass_block'); }
    const ctx = new M['world/gen/context'].GenContext(cx, cz, blocks, new Uint8Array(256).fill(biome));
    ctx.computeHeightmaps();
    return ctx;
  };
  let columns = 0, podzol = 0, tallest = 0, badTop = 0, chunks = 0;
  for (let cx = 0; cx < 12; cx++) {
    const ctx = ctxOf(cx, 3, B.bamboo_jungle);
    M['world/gen/bambooFeature'].bambooVegetation(ctx, 777);
    chunks++;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      if (nameOf(ctx.get(ctx.x0 + x, 63, ctx.z0 + z)) === 'podzol') podzol++;
      let h = 0, top = -1;
      for (let y = 64; y < 140; y++) { const st = ctx.get(ctx.x0 + x, y, ctx.z0 + z); if (nameOf(st) === 'bamboo') { h++; top = st; } }
      if (!h) continue;
      columns++;
      tallest = Math.max(tallest, h);
      if (h >= 3 && !(BAMBOO.get(top, 'leaves') === 'large' && BAMBOO.get(top, 'stage') === 1)) badTop++;
    }
  }
  check('a bamboo jungle is thick with bamboo (dozens of stalks a chunk), with podzol round some of it', columns / chunks > 8 && podzol > 0, `${(columns / chunks).toFixed(1)} a chunk, podzol ${podzol}`);
  check('...each stalk thick, its top done growing with large leaves', badTop === 0, `${badTop}`);
  let jungle = 0;
  for (let cx = 0; cx < 40; cx++) {
    const ctx = ctxOf(cx, 9, B.jungle);
    if (M['world/gen/bambooFeature'].bambooVegetation(ctx, 555)) jungle++;
  }
  check('a jungle has a stalk now and then (one chunk in four tries)', jungle > 2 && jungle < 20, `${jungle} of 40`);
  const plains = ctxOf(0, 0, B.plains);
  check('...and a plains none', !M['world/gen/bambooFeature'].bambooVegetation(plains, 555));
}

// its sounds and textures
{
  const SND = M['audio/synth'].SOUNDS;
  const bad = [];
  for (const [k, n] of Object.entries({ 'block.bamboo.place': 6, 'block.bamboo.break': 6, 'block.bamboo.step': 6, 'block.bamboo.hit': 6, 'block.bamboo_sapling.place': 6, 'block.bamboo_sapling.break': 6, 'block.bamboo_sapling.hit': 5, 'block.bamboo_sapling.step': 6 })) {
    const s = SND[k];
    if (!s) { bad.push(`${k} missing`); continue; }
    if (s.variants !== n) bad.push(`${k} has ${s.variants}`);
    const buf = s.generate(0, 22050);
    let pk = 0;
    for (const v of buf) pk = Math.max(pk, Math.abs(v));
    if (!(pk > 0.3 && pk <= 1)) bad.push(`${k} peak ${pk}`);
  }
  check('bamboo\'s sounds (vanilla\'s takes: place 6, its break the same, step 6; the shoot\'s place 6, hit 5; its step the stalk\'s)', bad.length === 0 && SND['block.bamboo.break'] === SND['block.bamboo.place'] && SND['block.bamboo_sapling.step'] === SND['block.bamboo.step'], bad.join(', '));
  const BT = M['textures/blocks'].BLOCK_TEXTURES;
  const tbad = [];
  for (const n of ['bamboo_stalk', 'bamboo_small_leaves', 'bamboo_large_leaves', 'bamboo_stage0', 'bamboo_singleleaf']) {
    const t = BT[n]?.();
    if (!t) { tbad.push(`${n} missing`); continue; }
    let o = 0;
    for (let i = 3; i < t.data.length; i += 4) if (t.data[i]) o++;
    if (o < 20) tbad.push(`${n} ${o}`);
  }
  check('its textures: the stalk, the small and large leaves, the shoot, the potted leaf', tbad.length === 0, tbad.join(', '));
  const IT = M['textures/items'].ITEM_TEXTURES;
  check('...the bamboo item\'s sprite', !!IT.bamboo);
}

// ===========================================================================
// the panda

// its numbers
{
  const { level } = setup();
  const pd = spawn(level, 0.5, 64, 0.5, { genes: ['normal', 'normal'] });
  check('a panda: 20 health, 0.15 speed, a bite of 6, 1.3 by 1.25 (eyes 1.0625 up), a creature', pd.maxHealth === 20 && pd.health === 20 && near(pd.moveSpeedAttr, 0.15) && pd.attackDamage === 6 && near(pd.width, 1.3) && near(pd.height, 1.25) && near(pd.eyeHeight, 1.0625) && pd.category === 'creature');
  const baby = spawn(level, 4.5, 64, 0.5, { genes: ['normal', 'normal'], baby: true });
  check('a cub: half the size (0.65 by 0.625), its eyes 0.53125 up', near(baby.width, 0.65) && near(baby.height, 0.625) && near(baby.eyeHeight, 0.53125));
  check('it picks things up (every panda: cubs too), can\'t be leashed, eats bamboo (not cake, not wheat)', pd.canPickUpLoot && baby.canPickUpLoot && !pd.canBeLeashed() && pd.isFood(ItemStack.of('bamboo')) && !pd.isFood(ItemStack.of('wheat')));
  check('its name, summonable; its spawn egg in the spawn eggs tab', spawner.entityDisplayName('panda') === 'Panda' && spawner.summonableTypes().includes('panda') && ITEMS.get('panda_spawn_egg')?.creativeTab === 'spawn_eggs');
}

// its genes
{
  const { Rand } = M['core/rng'];
  const r = new Rand(99);
  const n = {};
  for (let i = 0; i < 160000; i++) { const g = randomGene((k) => r.nextInt(k)); n[g] = (n[g] ?? 0) + 1; }
  const f = (g) => n[g] / 160000;
  check('random genes: lazy, worried, playful, aggressive 1/16 each, weak 5/16, brown 2/16, normal 5/16', near(f('lazy'), 1 / 16, 0.004) && near(f('worried'), 1 / 16, 0.004) && near(f('playful'), 1 / 16, 0.004) && near(f('aggressive'), 1 / 16, 0.004) && near(f('weak'), 5 / 16, 0.006) && near(f('brown'), 2 / 16, 0.005) && near(f('normal'), 5 / 16, 0.006), JSON.stringify(n));
  check('what shows: the main gene; a recessive one (brown, weak) only when both are it', variantFromGenes('lazy', 'brown') === 'lazy' && variantFromGenes('brown', 'lazy') === 'normal' && variantFromGenes('brown', 'brown') === 'brown' && variantFromGenes('weak', 'normal') === 'normal' && variantFromGenes('weak', 'weak') === 'weak' && variantFromGenes('normal', 'aggressive') === 'normal');
  check('genes by name, an unknown one normal; seven of them', geneByName('playful') === 'playful' && geneByName('rainbow') === 'normal' && PANDA_GENES.length === 7);
  const { level } = setup();
  const weak = spawn(level, 0.5, 64, 0.5, { genes: ['weak', 'weak'] });
  const lazy = spawn(level, 4.5, 64, 0.5, { genes: ['lazy', 'normal'] });
  check('a weak panda has 10 health, a lazy one 0.07 speed', weak.maxHealth === 10 && near(weak.moveSpeedAttr, 0.15) && near(lazy.moveSpeedAttr, 0.07) && lazy.maxHealth === 20);
  // spawned: random genes, and what they give
  const seen = new Set();
  let wrongHealth = 0;
  for (let i = 0; i < 300; i++) {
    const p = spawn(level, 8.5, 64, 0.5 + (i % 10), { settle: false });
    seen.add(p.variant());
    if (p.isWeak() !== (p.maxHealth === 10)) wrongHealth++;
    p.remove();
  }
  check('spawned: genes at random, every look among them, a weak one with its 10 health', seen.size === 7 && wrongHealth === 0, [...seen].join());
  // inherited
  const a = spawn(level, 0.5, 64, 4.5, { genes: ['lazy', 'worried'] });
  const b = spawn(level, 3.5, 64, 4.5, { genes: ['playful', 'aggressive'] });
  let fromBoth = 0, mutated = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const c = a.makeBaby(b);
    const g = [c.mainGene, c.hiddenGene];
    const fa = g.filter((x) => x === 'lazy' || x === 'worried').length, fb = g.filter((x) => x === 'playful' || x === 'aggressive').length;
    if (fa === 1 && fb === 1) fromBoth++;
    else mutated++;
  }
  check('a cub has one gene from each parent (either way round), now and then one mutated (1/32 each)', fromBoth > N * 0.9 && mutated > N * 0.02 && mutated < N * 0.08, `${fromBoth} ${mutated}`);
  const ww = spawn(level, 6.5, 64, 4.5, { genes: ['weak', 'weak'] });
  let weakCubs = 0;
  for (let i = 0; i < 400; i++) { const c = ww.makeBaby(ww); if (c.isWeak() && c.maxHealth === 10) weakCubs++; }
  check('...two weak parents: weak cubs (10 health), bar mutations', weakCubs > 340, `${weakCubs}`);
  // in a pack, one in five after the first a cub
  let cubs = 0, firsts = 0;
  for (let i = 0; i < 400; i++) {
    const g = {};
    for (let k = 0; k < 2; k++) {
      const p = spawner.createMob('panda', level);
      p.moveTo(10.5, 64, 10.5, 0, 0);
      p.finalizeSpawn('natural', g);
      if (p.isBaby()) (k === 0 ? firsts++ : cubs++);
    }
  }
  check('in a pack, each after the first a cub one time in five (AgeableMobGroupData(0.2))', firsts === 0 && cubs > 50 && cubs < 115, `${cubs}`);
}

// picking up bamboo and eating it
{
  const { level, sounds, parts, events } = setup();
  const pd = spawn(level, 0.5, 64, 0.5, { genes: ['normal', 'normal'] });
  const it = drop(level, 'bamboo', 5, 3.5, 64, 0.5);
  tick(level, 400, () => pd.mainHand !== null);
  check('a panda goes for bamboo lying near it and takes up the whole stack', pd.mainHand?.item.id === 'bamboo' && pd.mainHand.count === 5 && it.removed && pd.handDropChance > 1, `${pd.mainHand?.count}`);
  tick(level, 20);
  check('...and sits down with it', pd.isSitting() && pd.sitAmount === 1);
  sounds.length = parts.length = events.length = 0;
  // (it may get up part way through, one tick in 300, dropping what it holds; it takes it up again and sits down to
  // it later: this runs till it's eaten, however many sittings that takes)
  const ate = () => events.some((e) => e.e === 'eat' && e.who === pd);
  const t = tick(level, 12000, ate);
  const munches = sounds.filter((s) => s.n === 'entity.panda.eat');
  const crumbs = parts.filter((p) => p.k === 'item_bamboo');
  const gaps = munches.slice(1).map((m, i) => m.t - munches[i].t);
  check('it eats: munching every fifth tick, six crumbs of bamboo each time', munches.length >= 20 && crumbs.length === munches.length * 6 && gaps.every((g) => g >= 5) && gaps.filter((g) => g === 5).length >= 19 && munches.every((s) => s.v === 0.5 || s.v === 1), `${munches.length} munches, ${crumbs.length} crumbs`);
  tick(level, 2);
  check('...finishing it (all five at once) after 100 ticks or more, the eat game event, and it gets up', ate() && !pd.mainHand && !pd.isSitting() && countOnGround(level, 'bamboo') === 0 && munches.length >= 20, `${t}`);
  const c0 = crumbs[0];
  check('...the crumbs from about a block ahead of it at head height', c0 && Math.hypot(c0.x - pd.x, c0.z - pd.z) > 0.5 && Math.hypot(c0.x - pd.x, c0.z - pd.z) < 1.5 && c0.y > pd.y + 1.0625 && c0.y < pd.y + 1.0625 + 0.75, c0 && `${(c0.x - pd.x).toFixed(2)} ${(c0.y - pd.y).toFixed(2)} ${(c0.z - pd.z).toFixed(2)}`);
  // cake too
  const cake = ITEMS.get('cake');
  check('it takes up cake too (vanilla PANDA_ITEMS; eats it the same)', !cake || (() => { const p2 = spawn(level, 20.5, 64, 20.5, { genes: ['normal', 'normal'] }); drop(level, 'cake', 1, 20.5, 64, 21); tick(level, 60, () => !!p2.mainHand); return p2.mainHand?.item.id === 'cake'; })(), cake ? '' : '(no cake in the game yet)');
  // a cub takes it up but doesn't sit
  const cub = spawn(level, -10.5, 64, 0.5, { genes: ['normal', 'normal'], baby: true });
  drop(level, 'bamboo', 1, -10.5, 64, 0.8);
  tick(level, 40, () => !!cub.mainHand);
  tick(level, 20);
  check('a cub picks it up too, but doesn\'t sit down to it', cub.mainHand?.item.id === 'bamboo' && !cub.isSitting());
  // not when mob griefing is off
  level.gameRules.mobGriefing = false;
  const p3 = spawn(level, -20.5, 64, -20.5, { genes: ['normal', 'normal'] });
  drop(level, 'bamboo', 1, -20.5, 64, -20.2);
  tick(level, 40);
  check('...nor with mobGriefing off', !p3.mainHand);
  level.gameRules.mobGriefing = true;
}

// feeding, breeding
{
  const { level, player, sounds, bred } = setup();
  const a = spawn(level, 0.5, 64, 0.5, { genes: ['normal', 'normal'] });
  const b = spawn(level, 3.5, 64, 0.5, { genes: ['normal', 'normal'] });
  hold(player, 'bamboo', 10);
  check('bamboo on a grown panda: in love, one bamboo used', a.interact(player, player.inventory.selectedItem) && a.isInLove() && player.inventory.selectedItem.count === 9);
  b.interact(player, player.inventory.selectedItem);
  sounds.length = 0;
  let sulked = false;
  tick(level, 60, () => { if (a.unhappyCounter > 0 || b.unhappyCounter > 0) sulked = true; return false; });
  const cant = sounds.filter((s) => s.n === 'entity.panda.cant_breed');
  check('...two in love with no bamboo growing near: no cub; they sulk (32 ticks), grumbling twice', sulked && pandas(level).length === 2 && cant.length >= 2, `${cant.length}`);
  // bamboo growing near: they breed
  a.inLove = b.inLove = 0;
  level.setBlock(2, 64, 3, BAMBOO.state({ age: 1 }));
  tick(level, 700);
  // (back where they were, the bamboo within 7 of both: they wander off in 700 ticks)
  for (const [p, x] of [[a, 0.5], [b, 3.5]]) {
    p.moveTo(x, 64, 0.5, 0, 0);
    p.navigation.stop();
  }
  a.interact(player, player.inventory.selectedItem);
  b.interact(player, player.inventory.selectedItem);
  tick(level, 300, () => pandas(level).length > 2);
  const kids = pandas(level).filter((p) => p.isBaby());
  check('...with bamboo near (within 7, from its feet up two): a cub', kids.length === 1, `${pandas(level).length}`);
  const two = JSON.stringify(ADV.ADVANCEMENTS.get('husbandry/bred_all_animals')?.criteria ?? {});
  check('...the breeding trigger (the player who fed them), a panda one of Two by Two\'s', bred.length === 1 && bred[0].child.type === 'panda' && bred[0].cause === player && /"type":"panda"/.test(two));
  // a cub fed bamboo grows up a tenth of the way
  const cub = kids[0];
  const age0 = cub.age;
  cub.interact(player, player.inventory.selectedItem);
  check('bamboo to a cub: it grows a tenth of the way up', cub.age === age0 + Math.trunc(Math.trunc(-age0 / 20) * 0.1) * 20, `${age0} → ${cub.age}`);
  // one on its breeding cooldown sits down and eats it
  const c = spawn(level, -6.5, 64, -6.5, { genes: ['normal', 'normal'] });
  c.setAge(6000);
  hold(player, 'bamboo', 5);
  drop(level, 'stick', 1, 50, 64, 50);
  c.mainHand = ItemStack.of('apple');
  const n0 = countOnGround(level, 'apple');
  const ok = c.interact(player, player.inventory.selectedItem);
  check('bamboo to one that can\'t fall in love (its cooldown): it sits down and eats it, holding the one piece', ok && c.isSitting() && c.isEating() && c.mainHand?.item.id === 'bamboo' && c.mainHand.count === 1 && player.inventory.selectedItem.count === 4);
  check('...what it held dropped (a survival player)', countOnGround(level, 'apple') === n0 + 1);
  check('...again while it sits: nothing (the click passes)', !c.interact(player, player.inventory.selectedItem) && player.inventory.selectedItem.count === 4);
  // on its back: a click gets it up
  const lz = spawn(level, 10.5, 64, 10.5, { genes: ['lazy', 'lazy'] });
  lz.setOnBack(true);
  hold(player, null);
  check('a panda on its back: a click (with anything) gets it up', lz.interact(player, null) && !lz.isOnBack());
  // a spawn egg on a panda
  hold(player, 'panda_spawn_egg', 1);
  const { use } = hands(level, player);
  player.moveTo(10.5, 64, 7.5, 0, 0);
  const before = pandas(level).length;
  use(lz.x, lz.y + 0.6, lz.z);
  const eggCub = pandas(level).find((p) => p.isBaby() && p !== cub);
  check('a spawn egg on a panda: a cub, its genes from the panda (lazy)', pandas(level).length === before + 1 && eggCub && (eggCub.mainGene === 'lazy' || eggCub.hiddenGene === 'lazy'), `${eggCub?.mainGene} ${eggCub?.hiddenGene}`);
}

// the sneeze
{
  const { level, sounds, parts } = setup();
  const cub = spawn(level, 0.5, 64, 0.5, { genes: ['weak', 'weak'], baby: true });
  const big = spawn(level, 3.5, 64, 0.5, { genes: ['normal', 'normal'] });
  const busy = spawn(level, -3.5, 64, 0.5, { genes: ['normal', 'normal'] });
  busy.sit(true);
  cub.serverAiStep = () => {};
  big.serverAiStep = () => {};
  busy.serverAiStep = () => {};
  tick(level, 5);
  cub.sneeze(true);
  sounds.length = parts.length = 0;
  let jumped = false, busyJumped = false;
  for (let i = 0; i < 25; i++) {
    level.tick();
    if (big.dy > 0.3) jumped = true;
    if (busy.dy > 0.3) busyJumped = true;
  }
  const pre = sounds.find((s) => s.n === 'entity.panda.pre_sneeze'), sn = sounds.find((s) => s.n === 'entity.panda.sneeze');
  const cloud = parts.find((p) => p.k === 'sneeze');
  check('a cub\'s sneeze: it draws breath at once, sneezes 20 ticks later', pre && sn && sn.t - pre.t === 20 && !cub.isSneezing() && cub.sneezeCounter === 0, `${pre?.t} ${sn?.t}`);
  check('...its cloud off its nose, at its eyes', cloud && near(cloud.y, cub.y + cub.eyeHeight - 0.1, 0.05) && Math.hypot(cloud.x - cub.x, cloud.z - cub.z) > 0.7 && Math.hypot(cloud.x - cub.x, cloud.z - cub.z) < 0.9);
  check('...grown pandas about jump at it (not one sitting)', jumped && !busyJumped);
  // a slimeball one time in 700
  let slime = 0;
  for (let i = 0; i < 14000; i++) {
    cub.sneezeCounter = 21;
    cub.sneezing = true;
    cub.afterSneeze?.();
  }
  slime = countOnGround(level, 'slime_ball');
  check('...and one time in 700 a slimeball comes out', slime > 8 && slime < 35, `${slime} in 14000`);
  // how often: a weak cub much more than another
  const rate = (genes) => {
    const c = spawn(level, 20.5, 64, 20.5, { genes, baby: true });
    c.ensureGoals();
    let n = 0;
    const g = c.goalSelector;
    const sneeze = g.goals.map((w) => w.goal).find((x) => x.constructor.name === 'PandaSneezeGoal');
    for (let i = 0; i < 100000; i++) if (sneeze?.canUse()) n++;
    c.remove();
    return n;
  };
  const weakRate = rate(['weak', 'weak']), normalRate = rate(['normal', 'normal']);
  check('a weak cub sneezes one goal check in 250 on average (and then 1 in 3000), any other cub 1 in 3000', near(weakRate / 100000, 1 / 250 + 1 / 3000, 0.0012) && near(normalRate / 100000, 1 / 3000, 0.0003), `${weakRate} ${normalRate}`);
}

// rolling, lying on its back
{
  const { level } = setup();
  const pl = spawn(level, 0.5, 64, 0.5, { genes: ['playful', 'playful'] });
  pl.yaw = pl.bodyYaw = 0;
  pl.serverAiStep = () => {};
  pl.roll(true);
  const x0 = pl.z;
  const counters = [];
  let up = 0;
  for (let i = 0; i < 40; i++) {
    level.tick();
    counters.push(pl.rollCounter);
    if (pl.dy > 0.2) up++;
  }
  check('a roll: 32 ticks, then it stops', counters[0] === 1 && counters.includes(32) && !pl.isRolling() && pl.rollCounter === 0 && pl.rollAmount < 1, counters.slice(28, 36).join());
  // (pushed off 0.27 up at the start, it's still in the air at the 7th tick and at the 21st: vanilla hops only on the
  // ground, so it hops at the 1st, the 14th and the 28th)
  check('...pushed off ahead (0.2 a tick, stopping at each quarter turn) and hopping at the quarter turns it\'s down for', pl.z - x0 > 4 && pl.z - x0 < 7 && Math.abs(pl.x - 0.5) < 1e-6 && up === 3, `${(pl.z - x0).toFixed(2)} ${up}`);
  const lz = spawn(level, 6.5, 64, 6.5, { genes: ['lazy', 'normal'] });
  const nl = spawn(level, 9.5, 64, 6.5, { genes: ['normal', 'normal'] });
  let onBack = 0;
  for (let i = 0; i < 3000; i++) { level.tick(); if (lz.isOnBack()) onBack++; if (nl.isOnBack()) onBack += 100000; }
  check('a lazy panda lies on its back now and then (not another)', onBack > 0 && onBack < 100000, `${onBack}`);
  check('...free to (on its back it doesn\'t walk or look about)', !lz.canPerformAction() || !lz.isOnBack());
}

// a worried panda
{
  const { level, player } = setup();
  const w = spawn(level, 0.5, 64, 0.5, { genes: ['worried', 'normal'] });
  level.thunderLevel = () => 1;
  level.isThundering = () => true;
  tick(level, 3);
  check('a worried panda in a thunderstorm cowers (sits, won\'t eat, isn\'t free to do anything)', w.isSitting() && w.isScared() && !w.canPerformAction());
  hold(player, 'bamboo', 5);
  check('...won\'t take bamboo from you then', !w.interact(player, player.inventory.selectedItem) && player.inventory.selectedItem.count === 5);
  delete level.isThundering;
  delete level.thunderLevel;
  tick(level, 3);
  check('...and gets up when it\'s over', !w.isSitting() && !w.isScared());
  // it keeps away from a player within 8 (one with nothing it wants: bamboo would tempt it)
  hold(player, null);
  player.moveTo(w.x + 3, 64, w.z, 0, 0);
  const d0 = Math.hypot(player.x - w.x, player.z - w.z);
  tick(level, 100);
  const d1 = Math.hypot(player.x - w.x, player.z - w.z);
  const other = spawn(level, 20.5, 64, 20.5, { genes: ['normal', 'normal'] });
  player.moveTo(other.x + 3, 64, other.z, 0, 0);
  other.ensureGoals();
  const avoiders = other.goalSelector.goals.filter((x) => x.goal.constructor.name === 'PandaAvoidGoal').map((x) => x.goal.canUse());
  check('...keeps away from a player (or a monster) near it; another panda doesn\'t', d1 > d0 + 2 && avoiders.length === 2 && avoiders.every((v) => !v), `${d0.toFixed(1)} → ${d1.toFixed(1)}`);
}

// fighting
{
  const { level, player, sounds } = setup();
  player.gameMode = 'survival';
  const n = spawn(level, 0.5, 64, 0.5, { genes: ['normal', 'normal'] });
  const ag = spawn(level, 4.5, 64, 0.5, { genes: ['aggressive', 'normal'] });
  const bystander = spawn(level, -3.5, 64, 0.5, { genes: ['normal', 'normal'] });
  player.moveTo(0.5, 64, 3.5, 0, 0);
  n.hurt(1, 'player', player, player);
  tick(level, 2);
  check('hurt, a panda goes for whoever did it; the aggressive panda about joins in, the others don\'t', n.target === player && ag.target === player && bystander.target === null, `${n.target?.type} ${ag.target?.type} ${bystander.target?.type}`);
  sounds.length = 0;
  const h0 = player.health;
  tick(level, 200, () => n.didBite);
  check('...it bites (6; its bite sound)', player.health <= h0 - 6 + 1e-9 && sounds.some((s) => s.n === 'entity.panda.bite'), `${h0} → ${player.health}`);
  tick(level, 3);
  check('...and, bitten once, calls it off; the aggressive one keeps on', n.target === null && ag.target === player, `${n.target?.type} ${ag.target?.type}`);
  // given bamboo mid-fight, it calls it off
  const h = spawn(level, 10.5, 64, 10.5, { genes: ['aggressive', 'aggressive'] });
  h.hurt(1, 'player', player, player);
  tick(level, 2);
  hold(player, 'bamboo', 3);
  h.interact(player, player.inventory.selectedItem);
  tick(level, 3);
  check('bamboo in the middle of a fight calls it off, even an aggressive one\'s', h.gotBamboo === false && h.target === null, `${h.target?.type}`);
  // hurt, it gets up
  const s = spawn(level, -10.5, 64, -10.5, { genes: ['normal', 'normal'] });
  s.sit(true);
  s.hurt(1, 'generic');
  check('hurt, a sitting panda gets up', !s.isSitting());
  // it panics only from what the world does to it
  const f = spawn(level, 15.5, 64, -15.5, { genes: ['normal', 'normal'] });
  f.ensureGoals();
  const panic = f.goalSelector.goals.map((w) => w.goal).find((g) => g.constructor.name === 'PandaPanicGoal');
  // (vanilla DefaultRandomPos on flat ground: only a spot level with it will do, one try in nine, ten tries a check;
  // so a check finds somewhere to run about two times in three: ten checks)
  const tries = () => Array.from({ length: 10 }, () => panic.canUse()).some((v) => v);
  f.hurt(1, 'player', player, player);
  const fromPlayer = tries();
  f.lastDamageSource = 'onFire';
  f.lastDamageStamp = level.gameTime;
  const fromFire = tries();
  check('it panics from fire (and the like), not from a player\'s hit', !fromPlayer && fromFire);
}

// loot, sounds
{
  const { level, sounds } = setup();
  const pd = spawn(level, 0.5, 64, 0.5, { genes: ['normal', 'normal'] });
  const before = new Set(level.entities);
  pd.dropLoot(true, 3);
  const dropped = level.entities.filter((e) => !before.has(e) && e.type === 'item');
  check('loot: one bamboo, looting or not', dropped.length === 1 && dropped[0].stack.item.id === 'bamboo' && dropped[0].stack.count === 1);
  const xs = new Set();
  for (let i = 0; i < 60; i++) xs.add(pd.experienceReward());
  const cub = spawn(level, 4.5, 64, 0.5, { genes: ['normal', 'normal'], baby: true });
  cub.mainHand = ItemStack.of('bamboo');
  cub.setGuaranteedDrop('mainhand');
  const b2 = new Set(level.entities);
  cub.hurt(100, 'player', level.player, level.player);
  tick(level, 2);
  const fromCub = level.entities.filter((e) => !b2.has(e) && e.type === 'item');
  check('killed by a player: 1 to 3 experience; a cub nothing (no loot, not what it held, no experience)', [...xs].sort().join() === '1,2,3' && fromCub.length === 0 && cub.experienceReward() === 0, `${fromCub.map((e) => e.stack.item.id)}`);
  const held = spawn(level, 8.5, 64, 0.5, { genes: ['normal', 'normal'] });
  held.mainHand = ItemStack.of('bamboo', 7);
  held.setGuaranteedDrop('mainhand');
  const b3 = new Set(level.entities);
  held.hurt(100, 'generic');
  tick(level, 2);
  const fromHeld = level.entities.filter((e) => !b3.has(e) && e.type === 'item').reduce((n, e) => n + (e.stack.item.id === 'bamboo' ? e.stack.count : 0), 0);
  check('...a grown one drops what it holds too', fromHeld === 8, `${fromHeld}`);
  const byGene = (g) => { const p = spawn(level, 20.5, 64, 20.5, { genes: [g, g] }); const s = p.ambientSound(); p.remove(); return s; };
  check('its voice: aggressive_ambient for an aggressive panda, worried_ambient for a worried one, ambient for the rest', byGene('aggressive') === 'entity.panda.aggressive_ambient' && byGene('worried') === 'entity.panda.worried_ambient' && byGene('lazy') === 'entity.panda.ambient' && byGene('brown') === 'entity.panda.ambient');
  check('...hurt and death its own', pd.hurtSound() === 'entity.panda.hurt' && pd.deathSound() === 'entity.panda.death');
  sounds.length = 0;
  pd.navigation.moveTo(pd.x + 8, 64, pd.z, 1);
  tick(level, 60);
  const steps = sounds.filter((s) => s.n === 'entity.panda.step');
  check('...its steps (0.15 loud)', steps.length > 0 && steps.every((s) => s.v === 0.15), `${steps.length}`);
  const SND = M['audio/synth'].SOUNDS;
  const bad = [];
  let takes = 0;
  for (const [k, n] of Object.entries({ ambient: 5, aggressive_ambient: 4, worried_ambient: 3, bite: 3, cant_breed: 5, death: 2, eat: 5, hurt: 3, pre_sneeze: 1, sneeze: 3, step: 5 })) {
    const s = SND['entity.panda.' + k];
    if (!s) { bad.push(`${k} missing`); continue; }
    if (s.variants !== n) bad.push(`${k} has ${s.variants} takes`);
    for (let i = 0; i < s.variants; i++) {
      const buf = s.generate(i, 22050);
      let pk = 0;
      for (const v of buf) if (!Number.isFinite(v)) { pk = NaN; break; } else pk = Math.max(pk, Math.abs(v));
      if (!(pk > 0.3 && pk <= 1)) bad.push(`${k}#${i} peak ${pk}`);
      takes++;
    }
  }
  check(`the panda's sounds (vanilla's takes: ambient 5, aggressive 4, worried 3, bite 3, cant_breed 5, death 2, eat 5, hurt 3, pre_sneeze 1, sneeze 3, step 5; ${takes} in all)`, bad.length === 0, bad.join(', '));
}

// saving, /summon
{
  const { level, player } = setup();
  const pd = spawn(level, 0.5, 64, 0.5, { genes: ['weak', 'weak'] });
  pd.mainHand = ItemStack.of('bamboo', 3);
  pd.setGuaranteedDrop('mainhand');
  const s = JSON.parse(JSON.stringify(pd.save()));
  const c = new Panda(level);
  c.load(s);
  check('saved: its genes (MainGene, HiddenGene), its 10 health, its speed, what it holds (dropped for sure), picking things up', c.mainGene === 'weak' && c.hiddenGene === 'weak' && c.maxHealth === 10 && near(c.moveSpeedAttr, 0.15) && c.mainHand?.count === 3 && c.handDropChance > 1 && c.canPickUpLoot, JSON.stringify(s.data));
  const lz = spawn(level, 4.5, 64, 0.5, { genes: ['lazy', 'brown'] });
  const c2 = new Panda(level);
  c2.load(JSON.parse(JSON.stringify(lz.save())));
  check('...a lazy one\'s 0.07 speed', c2.mainGene === 'lazy' && c2.hiddenGene === 'brown' && near(c2.moveSpeedAttr, 0.07) && c2.variant() === 'lazy');
  const cmd = M['game/commands'];
  const game = { meta: { allowCommands: true }, chat() {}, player, playerName: 'Tester', level, world: level.world, sound: { play() {} }, applyGameRules() {}, teleport() {}, changeDimension() {} };
  cmd.executeCommand(game, 'summon panda 10.5 64 10.5 {MainGene:"brown",HiddenGene:"brown"}');
  const br = pandas(level).find((e) => Math.abs(e.x - 10.5) < 0.01);
  check('/summon panda with its genes: brown', br?.variant() === 'brown' && br.mainGene === 'brown', `${br?.mainGene} ${br?.hiddenGene}`);
  cmd.executeCommand(game, 'summon panda 12.5 64 10.5 {MainGene:"weak",HiddenGene:"weak"}');
  const wk = pandas(level).find((e) => Math.abs(e.x - 12.5) < 0.01);
  check('...weak genes by /summon: weak to look at, its health still 20 (as vanilla: only a spawn sets it)', wk?.isWeak() && wk.maxHealth === 20);
  cmd.executeCommand(game, 'summon panda 14.5 64 10.5');
  const plain = pandas(level).find((e) => Math.abs(e.x - 14.5) < 0.01);
  check('...without entity data: random genes (made as a natural one is)', !!plain && PANDA_GENES.includes(plain.mainGene));
  cmd.executeCommand(game, 'summon panda 16.5 64 10.5 {MainGene:"nonsense"}');
  const ns = pandas(level).find((e) => Math.abs(e.x - 16.5) < 0.01);
  check('...an unknown gene: normal', ns?.mainGene === 'normal');
}

// spawning
{
  const pick = (biome, type) => spawner.biomeSettings(B[biome]).creature.find((d) => d.type === type);
  const bj = pick('bamboo_jungle', 'panda'), j = pick('jungle', 'panda');
  check('pandas in the bamboo jungle (80, in ones and twos) and the jungle (1), not the sparse jungle', bj?.weight === 80 && bj.min === 1 && bj.max === 2 && j?.weight === 1 && j.min === 1 && j.max === 2 && !pick('sparse_jungle', 'panda') && !pick('plains', 'panda'), `${JSON.stringify(bj)} ${JSON.stringify(j)}`);
  check('...beside the parrots (40, in ones and twos) in both', pick('bamboo_jungle', 'parrot')?.weight === 40 && pick('jungle', 'parrot')?.weight === 40);
  const { level } = setup();
  level.setBlock(4, 63, 0, S('sand'));
  const ns = new spawner.NaturalSpawner(level, 1);
  const rule = (x, y, z) => ns.checkSpawnRules('panda', x, y, z);
  check('spawn rules: on grass in the light (as any animal), not on sand', rule(0, 64, 0) && !rule(4, 64, 0));
  level.dayTime = 18000;
  level.updateSkyBrightness();
  check('...the sky\'s light counts, day or night (vanilla: raw brightness over 8)', rule(0, 64, 0));
  for (let x = -1; x <= 1; x++) for (let z = 9; z <= 11; z++) for (let y = 64; y <= 66; y++) if (x || z !== 10 || y === 66) level.setBlock(x, y, z, S('stone'));
  check('...but not in the dark', !rule(0, 64, 10));
  const g = { ageable: undefined };
  const first = spawner.createMob('panda', level), second = spawner.createMob('panda', level);
  first.moveTo(0.5, 64, 0.5, 0, 0);
  second.moveTo(1.5, 64, 0.5, 0, 0);
  first.finalizeSpawn('natural', g);
  let babies = 0;
  for (let i = 0; i < 400; i++) {
    const m = spawner.createMob('panda', level);
    m.moveTo(0.5, 64, 0.5, 0, 0);
    m.finalizeSpawn('natural', g);
    if (m.isBaby()) babies++;
  }
  check('in a group: the first grown, a fifth of the rest cubs (vanilla Panda.finalizeSpawn: AgeableMobGroupData(0.2))', !first.isBaby() && babies > 50 && babies < 115, `${babies}/400`);
}

// the particles: the sneeze's cloud, the crumbs
{
  const src = (await import('node:fs')).readFileSync('src/render/particles.ts', 'utf8');
  check('the sneeze cloud: vanilla PlayerCloudParticle as SneezeProvider makes it (0.4 opaque, its wrapped-round green)', /case 'sneeze'/.test(src) && /p\.alpha = 0\.4/.test(src) && /56 \/ 255, 206 \/ 255, 136 \/ 255/.test(src));
  const atlas = (await import('node:fs')).readFileSync('src/render/particleAtlas.ts', 'utf8');
  check('...the crumbs of bamboo and cake in the particle atlas', /\['bamboo', 'cake'\]/.test(atlas));
}

// ===========================================================================
// textures, the model, the renderer
function faces(c) {
  const { u, v, w, h, d } = c;
  return { top: [u + d, v, w, d], bottom: [u + d + w, v, w, d], right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h], back: [u + 2 * d + w, v + d, w, h] };
}
function walk(part, nm, out) {
  part.cubes.forEach((c, i) => out.push([`${nm}#${i}`, c]));
  for (const [n, ch] of part.children) walk(ch, n, out);
}
{
  const MT = M['textures/mobs'].MOB_TEXTURES;
  const RR = M['render/pandaRenderer'];
  const opaqueIn = (img, [x0, y0, w, h]) => { let n = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (img.data[(y * img.w + x) * 4 + 3]) n++; return n; };
  const def = RR.pandaModel();
  const cubes = [];
  walk(def.root, 'root', cubes);
  const bad = [];
  const skins = ['panda', 'lazy_panda', 'worried_panda', 'playful_panda', 'brown_panda', 'weak_panda', 'aggressive_panda'];
  for (const s of skins) {
    const img = MT[s]?.();
    if (!img || img.w !== 64 || img.h !== 64) { bad.push(`${s} missing`); continue; }
    for (const [cn, c] of cubes) for (const [f, r] of Object.entries(faces(c))) if (opaqueIn(img, r) !== r[2] * r[3]) bad.push(`${s} ${cn}.${f}`);
  }
  check('seven skins, one for each gene, 64x64, every box painted', bad.length === 0, bad.slice(0, 6).join(', '));
  const px = (img, x, y) => { const i = (y * 64 + x) * 4; return (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]; };
  const lum = (c) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
  const nrm = MT.panda(), brown = MT.brown_panda();
  const bodyTop = faces({ u: 0, v: 25, w: 19, h: 26, d: 13 });
  check('...black and white: dark ears and legs, a dark band at the body\'s head end, white behind it; the brown one brown and tan', lum(px(nrm, 53, 26)) < 150 && lum(px(nrm, 46, 8)) < 150 && lum(px(nrm, bodyTop.right[0] + 3, bodyTop.right[1] + 2)) < 150 && lum(px(nrm, bodyTop.right[0] + 3, bodyTop.right[1] + 20)) > 600 && ((px(brown, bodyTop.right[0] + 3, bodyTop.right[1] + 20) >> 16) & 255) > (px(brown, bodyTop.right[0] + 3, bodyTop.right[1] + 20) & 255) + 30);
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) n++; return n; };
  const faceDiff = (a, b) => { let n = 0; for (let y = 15; y < 25; y++) for (let x = 9; x < 22; x++) if (px(a, x, y) !== px(b, x, y)) n++; return n; };
  check('...each face its own (the lazy one\'s slits, the worried and aggressive brows, the playful tongue, the weak one\'s runny nose)', skins.every((s, i) => skins.every((t, j) => i >= j || diff(MT[s](), MT[t]()) > 10)) && faceDiff(MT.lazy_panda(), nrm) > 3, '');
  check('...its spawn egg (white with dark spots)', !!M['textures/items'].ITEM_TEXTURES.panda_spawn_egg);
  const names = [];
  const collect = (p, nm) => { names.push(nm); for (const [n, ch] of p.children) collect(ch, n); };
  collect(def.root, 'top');
  check('the model: a head (with its snout and ears), a body on its side, four legs; 64x64; a cub\'s head drawn big', ['head', 'body', 'right_hind_leg', 'left_hind_leg', 'right_front_leg', 'left_front_leg'].every((n) => names.includes(n)) && def.texW === 64 && def.root.child('head').cubes.length === 4 && def.baby?.headScale === 2.7 && def.baby.bodyScale === 3 && def.baby.yHead === 23);
  const { level } = setup();
  const pd = spawn(level, 0.5, 64, 0.5, { genes: ['normal', 'normal'] });
  const A = { limbSwing: 0, limbAmount: 0, age: 100, headYaw: 0, headPitch: 0 };
  const root = def.root;
  RR.animatePanda(root, pd, A, 0);
  const bodyX = root.child('body').xRot;
  pd.sit(true);
  pd.sitAmount = pd.sitAmountO = 1;
  pd.eat(true);
  RR.animatePanda(root, pd, A, 0);
  const sitBody = root.child('body').xRot, eatHead = root.child('head').xRot, rf = root.child('right_front_leg');
  check('standing: its body level (90° over); sitting, tipped up (1.74), its forelegs out; eating, its head bobbing over its paws', near(bodyX, Math.PI / 2) && near(sitBody, 1.7407963, 1e-6) && near(eatHead, Math.PI / 2 + 0.2 * Math.sin(100 * 0.6), 1e-6) && near(rf.zRot, -0.27079642) && near(rf.xRot, -0.4 - 0.2 * Math.sin(60), 1e-6));
  pd.sit(false);
  pd.eat(false);
  pd.sitAmount = pd.sitAmountO = 0;
  pd.unhappyCounter = 10;
  RR.animatePanda(root, pd, A, 0);
  check('sulking: its head shaking', near(root.child('head').yRot, 0.35 * Math.sin(60)) && near(root.child('head').zRot, 0.35 * Math.sin(60)));
  pd.unhappyCounter = 0;
  pd.sneezing = true;
  pd.sneezeCounter = 7;
  RR.animatePanda(root, pd, A, 0);
  const s7 = root.child('head').xRot;
  pd.sneezeCounter = 17;
  RR.animatePanda(root, pd, A, 0);
  check('about to sneeze: its head going back (to 45°, held there)', near(s7, -Math.PI / 4 * 7 / 14) && near(root.child('head').xRot, -Math.PI / 4));
  pd.sneezing = false;
  pd.sneezeCounter = 0;
  // the renderer, through stand-ins
  let quads = 0;
  const drawn = [], items = [];
  const batch = { quad() { quads++; }, begin() {}, flush() {}, setOverlay() {}, lightB: 96, lightS: 100, color: [1, 1, 1, 1] };
  const pose = new M['render/entityRenderer'].PoseStack();
  let scaled = null;
  const kit = {
    pose, items: { render(b, ps, s, ctx) { items.push({ id: s.item.id, ctx, m: [...ps.m] }); } }, tex: (n) => (MT[n] ? { n } : null),
    setupLiving: (e, dx, dy, dz, p, flip, scale) => { pose.reset(); scale?.(pose); scaled = { flip, m: [...pose.m] }; return A; }, overlay() {},
    drawBody: (b, e, d, tex) => { drawn.push(tex.n); d.root.render(b, pose, d.texW, d.texH); },
    drawModel: () => {}, state: (t, extra) => ({ texture: t, ...extra }), attackAnim: () => 0,
  };
  const rr = new RR.PandaRenderers(kit);
  const pig = spawn(level, 4.5, 64, 0.5, { type: 'pig', settle: false });
  const ok1 = rr.render(batch, pd, 0, 0, 0, 0.5) && !rr.render(batch, pig, 0, 0, 0, 0.5);
  pd.mainGene = pd.hiddenGene = 'brown';
  rr.render(batch, pd, 0, 0, 0, 0.5);
  pd.mainGene = 'aggressive';
  rr.render(batch, pd, 0, 0, 0, 0.5);
  check('drawn in the skin of the gene it shows (not a pig)', ok1 && quads > 0 && drawn.join() === 'panda,brown_panda,aggressive_panda', drawn.join());
  // sitting: tipped back 90° (after the flip, about x the other way), and what it holds before it
  pd.mainGene = pd.hiddenGene = 'normal';
  pd.sit(true);
  pd.sitAmount = pd.sitAmountO = 1;
  pd.pitch = 0;
  pd.mainHand = ItemStack.of('bamboo');
  items.length = 0;
  rr.render(batch, pd, 0, 0, 0, 0.5);
  const m = scaled.m;
  check('sitting: turned 90° about x (vanilla setupRotations), its bamboo held before it (the ground view)', near(m[5], 0, 1e-6) && near(Math.abs(m[6]), 1, 1e-6) && items.length === 1 && items[0].id === 'bamboo' && items[0].ctx === 'ground', `${m.slice(4, 7).map((x) => x.toFixed(3))}`);
  pd.sit(false);
  pd.sitAmount = pd.sitAmountO = 0;
  items.length = 0;
  rr.render(batch, pd, 0, 0, 0, 0.5);
  check('...standing, what it holds isn\'t drawn', items.length === 0);
  pd.rollCounter = 8;
  rr.render(batch, pd, 0, 0, 0, 0);
  check('rolling: turned over with its roll (a quarter turn by its 8th tick)', near(Math.abs(scaled.m[6]), 1, 1e-3), scaled.m.slice(4, 7).map((x) => x.toFixed(3)).join());
  pd.rollCounter = 0;
  check('its shadow: 0.9 (a cub\'s half)', RR.PANDA_SHADOW_RADII.panda === 0.9);
}

close?.();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);

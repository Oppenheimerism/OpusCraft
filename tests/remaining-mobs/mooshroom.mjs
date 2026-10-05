// Headless checks for the mooshroom (node tests/remaining-mobs/mooshroom.mjs; remaining mobs, milestone 4). The huge
// mushrooms first: their three blocks (numbers, sides, the model, closing up against their kind, what they drop), the
// small mushrooms (where they live, creeping, bone meal), the huge ones' shapes and heights, where the world grows
// them (the mushroom fields, the dark forest), mycelium's spores and the textures. Then the mooshroom: its numbers,
// mycelium, stew from a bowl, shearing (a cow and five mushrooms), a brown one's flowers and suspicious stew,
// lightning, breeding (and the 1 in 1024), a spawn egg on one, loot, saving, /summon, spawning (the mushroom fields,
// its rules, new chunks), a dispenser's shears, Two by Two, suspicious stew's crafting, creative stews and tooltip,
// its sounds, skins, spawn egg and the renderer (through stand-ins).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 900000).unref();
const P = [
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/player.ts',
  '/src/game/spawner.ts', '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/entity/mooshroom.ts', '/src/entity/animals.ts', '/src/entity/itemEntity.ts',
  '/src/game/mushrooms.ts', '/src/game/blockBehavior.ts', '/src/game/blockRules.ts', '/src/game/boneMeal.ts', '/src/game/interaction.ts',
  '/src/game/advancements.ts', '/src/game/commands.ts', '/src/inventory/customRecipes.ts', '/src/world/gen/context.ts', '/src/world/gen/hugeMushroom.ts',
  '/src/world/constants.ts', '/src/core/rng.ts', '/src/render/mooshroomRenderer.ts', '/src/render/entityRenderer.ts', '/src/textures/mobs.ts',
  '/src/textures/items.ts', '/src/textures/blocks.ts', '/src/audio/synth.ts', '/src/entity/lightning.ts', '/src/game/redstone/dispenseItems.ts',
  '/src/game/suspiciousStew.ts', '/src/item/creativeStacks.ts', '/src/world/models.ts', '/src/item/hoverText.ts', '/src/world/blocksMushrooms.ts',
  '/src/entity/effects.ts', '/src/net/items.ts', '/src/inventory/recipes.ts', '/src/game/itemBehavior.ts',
];
const { mods, close } = await loadModules(P);
const M = Object.fromEntries(P.map((p, i) => [p.replace(/^\/src\//, '').replace(/\.ts$/, ''), mods[i]]));
const { S, BLOCKS, STATE_BLOCK, STATE_VIEWS, getBlock } = M['world/block'];
const { ITEMS, ITEM_LIST, ItemStack } = M['item/item'];
const { B } = M['world/gen/biomes'];
const { Mooshroom } = M['entity/mooshroom'];
const { Cow } = M['entity/animals'];
const { ItemEntity } = M['entity/itemEntity'];
const { Rand } = M['core/rng'];
const HM = M['world/gen/hugeMushroom'];
const spawner = M['game/spawner'];
const BB = M['game/blockBehavior'];
const { MUSHROOM_SIDES } = M['world/blocksMushrooms'];
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const nameOf = (st) => (st < 0 ? '?' : BLOCKS[STATE_BLOCK[st]].name);
const stack = (id, n = 1) => ItemStack.of(id, n);

/** flat `top` at y 63 on stone (they stand at 64) in `biome`, for x, z in [-48, 48); day, clear */
function setup({ biome = B.mushroom_fields, top = 'mycelium' } = {}) {
  const world = new M['world/world'].World();
  for (let cx = -3; cx < 3; cx++) for (let cz = -3; cz < 3; cz++) { const c = new M['world/chunk'].Chunk(cx, cz); c.biomes.fill(biome); world.chunks.set(c.key, c); }
  const st = S('stone'), t = S(top);
  for (let x = -48; x < 48; x++) for (let z = -48; z < 48; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 58; y < 63; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, t);
  }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new M['game/level'].Level(world, 'mooshrooms');
  const sounds = [], parts = [], spells = [], triggers = [], events = [], bred = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p, t: level.gameTime }); }, playUI() {} };
  level.particles = {
    blockBreak() {}, blockHit() {}, blockParticle() {}, spawn(k, x, y, z, dx, dy, dz) { parts.push({ k, x, y, z, dx, dy, dz, t: level.gameTime }); }, entityEffect() {}, poof() {}, dust() {}, emitAround() {},
    spell(k, x, y, z, xd, yd, zd, r, g, b) { spells.push({ k, x, y, z, xd, yd, zd, r, g, b }); }, fallingDust() {},
  };
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
  return { level, world, player, sounds, parts, spells, triggers, events, bred };
}
/** a mooshroom (or `type`) made as /summon makes it, standing (its first ticks on the ground done) */
function spawn(level, x, y, z, { type = 'mooshroom', variant = null, baby = false, settle = true } = {}) {
  const m = spawner.createMob(type, level);
  m.moveTo(x, y, z, 0, 0);
  m.finalizeSpawn('command');
  if (variant) m.variant = variant;
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
/** ticks the level, the player held where it is */
const tick = (level, n) => {
  const p = level.player, [x, y, z] = [p.x, p.y, p.z];
  for (let i = 0; i < n; i++) {
    level.tick();
    p.moveTo(x, y, z, p.yaw, p.pitch);
    p.dx = p.dy = p.dz = 0;
    p.fallDistance = 0;
  }
};
const living = (level, T) => level.entities.filter((e) => e instanceof T && !e.removed);
const newItems = (level, before) => level.entities.filter((e) => !before.has(e) && e.type === 'item' && !e.removed);
/** an Interaction for `player`: looking at (tx, ty, tz) from where it stands, a use */
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
  return { ia, look, use };
}
/** `player` beside `m`, holding `held` (survival unless `creative`), clicking it */
function useOn(level, player, m, held, { creative = false } = {}) {
  player.gameMode = creative ? 'creative' : 'survival';
  player.moveTo(m.x - 2, m.y, m.z, 0, 0);
  player.inventory.main[player.inventory.selected] = held;
  player.inventory.version++;
  hands(level, player).use(m.x, m.y + m.height * 0.6, m.z);
}
const held = (player) => player.inventory.selectedItem;
const invCount = (player, id) => player.inventory.main.reduce((n, s) => n + (s?.item.id === id ? s.count : 0), 0);

// ===========================================================================
// the huge mushrooms' blocks
{
  const bad = [];
  for (const n of ['brown_mushroom_block', 'red_mushroom_block', 'mushroom_stem']) {
    const b = getBlock(n), d = b.defaultState;
    if (!MUSHROOM_SIDES.every((s) => b.get(d, s) === true)) bad.push(`${n} sides`);
    if (b.s.hardness !== 0.2 || b.s.sound !== 'wood' || b.s.tool !== 'axe') bad.push(`${n} ${b.s.hardness} ${b.s.sound} ${b.s.tool}`);
    let states = 0;
    for (let st = 0; st < STATE_BLOCK.length; st++) if (STATE_BLOCK[st] === b.id) states++;
    if (states !== 64) bad.push(`${n} ${states} states`);
  }
  check('the brown mushroom block, the red one and the stem: six sides, each its skin to begin with (64 states); 0.2 hard, wood\'s sound, an axe\'s', bad.length === 0, bad.join(', '));
  // the model: each side a face of its own, its skin (uvlocked) where it's true, the inside where it's false
  const MD = M['world/models'];
  const R = getBlock('red_mushroom_block');
  const st = R.state({ north: true, east: false, south: true, west: false, up: true, down: false });
  const choice = R.s.model(STATE_VIEWS[st]);
  const sprite = () => ({ u0: 0, v0: 0, u1: 1, v1: 1 });
  const DIRS = ['down', 'up', 'north', 'south', 'west', 'east'];
  const got = choice.parts.map((v) => {
    const q = MD.bakeVariant(v, sprite).quads;
    return `${DIRS[q[0].dir]}:${q[0].cull === q[0].dir ? 'c' : 'x'}:${v.model.particle}:${v.uvlock ? 'u' : ''}:${q.length}`;
  });
  const want = ['north', 'south', 'up'].map((d) => `${d}:c:red_mushroom_block:u:1`).concat(['east', 'west', 'down'].map((d) => `${d}:c:mushroom_block_inside::1`));
  check('its model: a face for each side (its skin where the side\'s true, uvlocked; the inside where it\'s false), each turned to its side and culled there', got.join() === want.join(), got.join(' '));
  const I = ['brown_mushroom_block', 'red_mushroom_block', 'mushroom_stem'].map((n) => ITEMS.get(n));
  const nat = ITEM_LIST.filter((i) => i.creativeTab === 'natural').map((i) => i.id);
  const k = nat.indexOf('flowering_azalea_leaves');
  check('their items: cubes of the skin, in the natural blocks after the leaves (brown, red, the stem)', I.every((i) => i?.creativeTab === 'natural') && nat.slice(k + 1, k + 4).join() === 'brown_mushroom_block,red_mushroom_block,mushroom_stem', nat.slice(k, k + 4).join());
}

// placing one beside another of its kind closes both sides between them; its drops
{
  const { level, world, player } = setup({ biome: B.plains, top: 'grass_block' });
  const R = getBlock('red_mushroom_block'), STEM = getBlock('mushroom_stem');
  level.setBlock(0, 64, 0, R.defaultState);
  player.moveTo(0.5, 64, 3.5, 180, 0);
  player.inventory.main[player.inventory.selected] = stack('red_mushroom_block', 4);
  hands(level, player).use(0.5, 64.5, 1.0);
  const a = world.getState(0, 64, 0), b = world.getState(0, 64, 1);
  check('placed against another of its kind: the side between them closes on both (vanilla getStateForPlacement, updateShape)', STATE_BLOCK[b] === R.id && R.get(a, 'south') === false && R.get(b, 'north') === false && R.get(a, 'north') && R.get(b, 'south') && R.get(b, 'up'), `${R.get(a, 'south')} ${R.get(b, 'north')}`);
  level.setBlock(1, 64, 1, STEM.defaultState);
  const c = world.getState(1, 64, 1), b2 = world.getState(0, 64, 1);
  check('...not against another kind (the stem beside a red cap)', STEM.get(c, 'west') === true && R.get(b2, 'east') === true);
  level.setBlock(0, 64, 1, 0);
  check('...and never opens again (vanilla: only ever closed)', R.get(world.getState(0, 64, 0), 'south') === false);
  const dropsOf = (n, silk) => {
    const beh = BB.behaviorOf(getBlock(n).defaultState);
    const r = new Rand(99, 1);
    const hist = [0, 0, 0, 0];
    for (let i = 0; i < 9000; i++) {
      const d = beh.drops(getBlock(n).defaultState, null, r, silk, 0, null);
      const cnt = d.reduce((s, x) => s + x.count, 0);
      if (d.some((x) => x.item.id !== (silk ? n : n.replace('_block', '')))) hist[3]++;
      else hist[Math.min(cnt, 2)]++;
    }
    return hist;
  };
  const red = dropsOf('red_mushroom_block', false), brown = dropsOf('brown_mushroom_block', false), stem = dropsOf('mushroom_stem', false);
  check('broken: a cap drops none of its small mushroom seven times in nine, one or two the rest (vanilla uniform(-6, 2), at least none)', near(red[0] / 9000, 7 / 9, 0.02) && near(red[1] / 9000, 1 / 9, 0.015) && near(red[2] / 9000, 1 / 9, 0.015) && red[3] === 0 && near(brown[0] / 9000, 7 / 9, 0.02) && brown[3] === 0, `${red} ${brown}`);
  check('...the stem nothing', stem[0] === 9000, `${stem}`);
  const silk = ['brown_mushroom_block', 'red_mushroom_block', 'mushroom_stem'].every((n) => { const d = BB.behaviorOf(getBlock(n).defaultState).drops(getBlock(n).defaultState, null, new Rand(1, 1), true, 0, null); return d.length === 1 && d[0].item.id === n && d[0].count === 1; });
  check('...with silk touch, itself', silk);
}

// small mushrooms: where they live
{
  const { level, world } = setup({ biome: B.plains, top: 'grass_block' });
  const BR = M['game/blockRules'];
  const brown = S('brown_mushroom'), red = S('red_mushroom');
  level.setBlock(0, 63, 0, S('mycelium'));
  level.setBlock(2, 63, 0, S('podzol'));
  level.setBlock(4, 63, 0, S('stone'));
  level.setBlock(6, 63, 0, S('glass'));
  const lit = (x) => { const l = world.getLight(x, 64, 0); return Math.max(l >> 4, l & 15); };
  check('on mycelium or podzol, in full daylight: it lives', BR.canSurvive(world, 0, 64, 0, brown, true) && BR.canSurvive(world, 2, 64, 0, red, true), `light ${lit(0)}`);
  check('...on stone in daylight (raw light 13 or more): it doesn\'t', lit(4) >= 13 && !BR.canSurvive(world, 4, 64, 0, brown, true) && !BR.canSurvive(world, 4, 64, 0, red, true), `light ${lit(4)}`);
  // a roof over it: dark
  for (let x = 3; x <= 7; x++) for (let z = -2; z <= 2; z++) for (let y = 64; y <= 66; y++) if (!((x === 4 || x === 6) && z === 0 && y < 66)) level.setBlock(x, y, z, S('stone'));
  check('...on stone in the dark, it does', lit(4) < 13 && BR.canSurvive(world, 4, 64, 0, brown, true), `light ${lit(4)}`);
  check('...but not on glass (not a solid block)', !BR.canSurvive(world, 6, 64, 0, brown, true));
  level.setBlock(4, 64, 0, brown);
  level.setBlock(4, 66, 0, 0);
  level.setBlock(4, 65, 0, S('torch'));
  const l2 = lit(4);
  level.setBlock(3, 64, 0, S('dirt'));
  check('...a lamp\'s light counts too: lit up and nudged, it breaks', l2 >= 13 ? nameOf(world.getState(4, 64, 0)) === 'air' : true, `light ${l2} ${nameOf(world.getState(4, 64, 0))}`);
}

// small mushrooms: creeping, bone meal
{
  const { level, world } = setup();
  const red = S('red_mushroom');
  level.setBlock(0, 64, 0, red);
  const rt = (x, y, z) => { const st = level.getState(x, y, z); BB.behaviorOf(st)?.randomTick?.(level, x, y, z, st); };
  for (let i = 0; i < 6000; i++) rt(0, 64, 0);
  let near4 = 0, all = 0, badGround = 0;
  for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) for (let y = 62; y <= 67; y++) {
    if (world.getState(x, y, z) !== red) continue;
    all++;
    if (Math.abs(x) <= 4 && Math.abs(z) <= 4 && Math.abs(y - 64) <= 1) near4++;
    if (nameOf(world.getState(x, y - 1, z)) !== 'mycelium') badGround++;
  }
  check('a mushroom creeps now and then to a spot near it it could live on, till five of its kind are about', near4 === 5 && all >= 5 && badGround === 0, `${near4} near, ${all} in all`);
  const BM = M['game/boneMeal'];
  let grew = 0, used = 0;
  const T = 300;
  for (let t = 0; t < T; t++) {
    for (let x = -4; x <= 4; x++) for (let z = 16; z <= 24; z++) for (let y = 64; y < 80; y++) if (world.getState(x, y, z) !== 0) level.setBlock(x, y, z, 0);
    level.setBlock(0, 64, 20, t % 2 ? red : S('brown_mushroom'));
    if (BM.performBoneMeal(level, 0, 64, 20, world.getState(0, 64, 20))) used++;
    if (nameOf(world.getState(0, 64, 20)) === 'mushroom_stem') grew++;
  }
  check('bone meal grows a huge one four times in ten, and is used up either way', near(grew / T, 0.4, 0.09) && used === T, `${grew}/${T}`);
  // no room: the small one stays (a red one needs only its column clear, a brown one its cap's room too)
  let redOk = 0, brownOk = 0, redStayed = true, brownStayed = true;
  for (let t = 0; t < 60; t++) {
    for (const [x0, kind] of [[-20, 'red_mushroom'], [20, 'brown_mushroom']]) {
      for (let x = x0 - 4; x <= x0 + 4; x++) for (let z = -4; z <= 4; z++) for (let y = 64; y < 80; y++) if (world.getState(x, y, z) !== 0) level.setBlock(x, y, z, 0);
      level.setBlock(x0 + 2, 68, 0, S('stone'));
      level.setBlock(x0, 64, 0, S(kind));
      const grown = M['game/mushrooms'].growHugeMushroom(level, x0, 64, 0, S(kind));
      if (kind === 'red_mushroom') { if (grown) redOk++; else if (world.getState(x0, 64, 0) !== S(kind)) redStayed = false; }
      else { if (grown) brownOk++; else if (world.getState(x0, 64, 0) !== S(kind)) brownStayed = false; }
    }
  }
  check('...where there\'s no room it doesn\'t grow, and the small one stays (a block beside where the brown cap goes stops the brown, not the red)', redOk > 0 && brownOk === 0 && brownStayed && redStayed, `red ${redOk} brown ${brownOk}`);
}

// the huge mushrooms' shapes and heights
{
  const acc = () => {
    const m = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    return { m, get: (x, y, z) => (y === 63 ? S('mycelium') : m.get(key(x, y, z)) ?? 0), set: (x, y, z, st) => m.set(key(x, y, z), st) };
  };
  const BRN = getBlock('brown_mushroom_block'), RED = getBlock('red_mushroom_block'), STEM = getBlock('mushroom_stem');
  const heights = new Map();
  let badBrown = 0, badRed = 0, badStem = 0;
  const r = new Rand(4242, 7);
  for (let t = 0; t < 1200; t++) {
    const kind = t % 2 ? 'red' : 'brown';
    const w = acc();
    if (!HM.placeHugeMushroom(w, r, kind, 0, 64, 0)) { badStem++; continue; }
    let h = 0;
    while (STATE_BLOCK[w.get(0, 64 + h, 0)] === STEM.id) h++;
    heights.set(h, (heights.get(h) ?? 0) + 1);
    for (let i = 0; i < h; i++) { const s = w.get(0, 64 + i, 0); if (STEM.get(s, 'up') || STEM.get(s, 'down') || !STEM.get(s, 'north')) badStem++; }
    const caps = [...w.m.entries()].filter(([, s]) => STATE_BLOCK[s] !== STEM.id);
    if (kind === 'brown') {
      // flat, at the stem's top, 7 across without its corners, its top up, its rim's sides out
      const ok = caps.length === 45 && caps.every(([k, s]) => {
        const [x, y, z] = k.split(',').map(Number);
        if (STATE_BLOCK[s] !== BRN.id || y !== 64 + h || Math.abs(x) > 3 || Math.abs(z) > 3 || (Math.abs(x) === 3 && Math.abs(z) === 3)) return false;
        const west = x === -3 || (Math.abs(z) === 3 && x === -2), east = x === 3 || (Math.abs(z) === 3 && x === 2);
        const north = z === -3 || (Math.abs(x) === 3 && z === -2), south = z === 3 || (Math.abs(x) === 3 && z === 2);
        return BRN.get(s, 'up') && !BRN.get(s, 'down') && BRN.get(s, 'west') === west && BRN.get(s, 'east') === east && BRN.get(s, 'north') === north && BRN.get(s, 'south') === south;
      });
      if (!ok) badBrown++;
    } else {
      // a dome: three rings (5 across without corners) round the stem's top three blocks, a 3 by 3 roof over it
      const ok = caps.length === 45 && caps.every(([k, s]) => {
        const [x, y, z] = k.split(',').map(Number);
        const i = y - 64;
        if (STATE_BLOCK[s] !== RED.id) return false;
        if (i === h) { if (Math.abs(x) > 1 || Math.abs(z) > 1) return false; }
        else if (i >= h - 3 && i < h) { if (Math.max(Math.abs(x), Math.abs(z)) !== 2 || (Math.abs(x) === 2 && Math.abs(z) === 2)) return false; }
        else return false;
        return RED.get(s, 'up') === i >= h - 1 && !RED.get(s, 'down') && RED.get(s, 'west') === x < 0 && RED.get(s, 'east') === x > 0 && RED.get(s, 'north') === z < 0 && RED.get(s, 'south') === z > 0;
      });
      if (!ok) badRed++;
    }
  }
  const hs = [...heights.keys()].sort((a, b) => a - b).join();
  const doubled = [8, 10, 12].reduce((n, k) => n + (heights.get(k) ?? 0), 0);
  check('a huge brown mushroom: a flat cap 7 across (its corners cut) on its stem, its top and its rim\'s sides its skin, its underside the inside', badBrown === 0, `${badBrown}`);
  check('a huge red mushroom: a dome of three rings round the stem\'s top and a 3 by 3 roof, its sides out, its top and upper ring up', badRed === 0, `${badRed}`);
  check('...a stem 4 to 6 tall (its top and foot the inside), one time in 12 twice that', badStem === 0 && hs === '4,5,6,8,10,12' && near(doubled / 1200, 1 / 12, 0.025), `${hs} doubled ${doubled}`);
}

// the world's huge mushrooms
{
  const CI = M['world/constants'].colIndex;
  const ctxOf = (cx, cz, biome, top = 'mycelium') => {
    const blocks = new Uint16Array(16 * 16 * 384);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { for (let y = 58; y < 63; y++) blocks[CI(x, y, z)] = S('dirt'); blocks[CI(x, 63, z)] = S(top); }
    const ctx = new M['world/gen/context'].GenContext(cx, cz, blocks, new Uint8Array(256).fill(biome));
    ctx.computeHeightmaps();
    return ctx;
  };
  let brown = 0, red = 0, grown = 0;
  for (let cx = 0; cx < 60; cx++) {
    const ctx = ctxOf(cx, 4, B.mushroom_fields);
    if (HM.mushroomIslandVegetation(ctx, 1234)) grown++;
    let b = 0, r = 0;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 64; y < 90; y++) {
      const n = nameOf(ctx.get(ctx.x0 + x, y, ctx.z0 + z));
      if (n === 'brown_mushroom_block') b++;
      else if (n === 'red_mushroom_block') r++;
    }
    if (b) brown++;
    if (r) red++;
  }
  check('the mushroom fields: a huge mushroom in every chunk, red or brown (even odds)', grown === 60 && brown > 15 && red > 15 && brown + red >= 58, `${grown} grown, ${brown} brown, ${red} red`);
  check('...none in the plains', !HM.mushroomIslandVegetation(ctxOf(0, 0, B.plains, 'grass_block'), 1234));
  let db = 0, dr = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const ctx = ctxOf(i, 0, B.dark_forest, 'grass_block');
    const before = ctx.get(ctx.x0 + 8, 64, ctx.z0 + 8);
    const took = HM.darkForestMushroom(ctx, 777, ctx.x0 + 8, 64, ctx.z0 + 8);
    if (!took) continue;
    let n = '';
    for (let y = 64; y < 90 && !n; y++) for (let x = -3; x <= 3 && !n; x++) for (let z = -3; z <= 3 && !n; z++) { const m = nameOf(ctx.get(ctx.x0 + 8 + x, y, ctx.z0 + 8 + z)); if (m.endsWith('mushroom_block')) n = m; }
    if (n === 'brown_mushroom_block') db++;
    else if (n === 'red_mushroom_block') dr++;
    void before;
    if (i > 3000) break;
  }
  const tries = Math.min(N, 3002);
  check('the dark forest: in a tree\'s place, a huge brown mushroom one time in 40, a red one one time in 20 of the rest', near(db / tries, 0.025, 0.012) && near(dr / tries, 0.0487, 0.015), `${db} brown, ${dr} red of ${tries}`);
  const src = (await import('node:fs')).readFileSync('src/world/gen/features.ts', 'utf8');
  check('...(the dark forest\'s trees ask it first; no other trees do)', /dark_forest[\s\S]{0,400}huge: true/.test(src) && (src.match(/huge: true/g) ?? []).length === 1 && /darkForestMushroom\(ctx, this\.seed, x, y, z\)\) continue/.test(src) && /mushroomIslandVegetation\(ctx, this\.seed\)/.test(src));
}

// mycelium's spores, the textures
{
  const { level } = setup();
  const beh = BB.behaviorOf(S('mycelium'));
  const before = level.particles;
  const got = [];
  level.particles = { ...before, spawn(k, x, y, z) { got.push({ k, x, y, z }); } };
  for (let i = 0; i < 5000; i++) beh.animateTick(level, 3, 63, 4, S('mycelium'));
  level.particles = before;
  check('mycelium: a spore drifting up from its top one tick in ten', got.every((p) => p.k === 'mycelium' && near(p.y, 64.1, 1e-9) && p.x >= 3 && p.x < 4 && p.z >= 4 && p.z < 5) && near(got.length / 5000, 0.1, 0.02), `${got.length}`);
  const BT = M['textures/blocks'].BLOCK_TEXTURES;
  const names = ['brown_mushroom_block', 'red_mushroom_block', 'mushroom_stem', 'mushroom_block_inside'];
  const imgs = names.map((n) => BT[n]?.());
  const opaque = (t) => { for (let i = 3; i < t.data.length; i += 4) if (t.data[i] !== 255) return false; return true; };
  const lum = (t) => { let s = 0; for (let i = 0; i < t.data.length; i += 4) s += t.data[i] + t.data[i + 1] + t.data[i + 2]; return s / (t.data.length / 4) / 3; };
  const redness = (t) => { let s = 0; for (let i = 0; i < t.data.length; i += 4) s += t.data[i] - t.data[i + 2]; return s / (t.data.length / 4); };
  check('their textures: the brown cap, the red one (white spots on it), the stem, the inside; 16x16, solid', imgs.every((t) => t && t.w === 16 && t.h === 16 && opaque(t)) && redness(imgs[1]) > 60 && lum(imgs[2]) > 170 && lum(imgs[0]) < 140, imgs.map((t) => t && lum(t).toFixed(0)).join());
}

// ===========================================================================
// the mooshroom
{
  const { level } = setup();
  const m = spawn(level, 0.5, 64, 0.5);
  check('a mooshroom: a cow (10 health, 0.2 speed, 0.9 by 1.4), a creature', m instanceof Cow && m.maxHealth === 10 && near(m.moveSpeedAttr, 0.2) && near(m.width, 0.9) && near(m.height, 1.4) && m.category === 'creature', `${m.category}`);
  check('...red to begin with (made as a natural one is, by an egg or /summon)', m.variant === 'red' && m.stewEffects === null);
  check('its name, summonable; its spawn egg in the spawn eggs tab', spawner.entityDisplayName('mooshroom') === 'Mooshroom' && spawner.summonableTypes().includes('mooshroom') && ITEMS.get('mooshroom_spawn_egg')?.creativeTab === 'spawn_eggs');
  check('mycelium is where it likes to wander best (10), grass no better than anywhere as light (a cow likes grass)', m.walkTargetValue(3, 64, 3) === 10 && spawn(level, 5.5, 64, 5.5, { type: 'cow' }).walkTargetValue(3, 64, 3) !== 10);
  level.setBlock(3, 63, 3, S('grass_block'));
  check('...(on grass: its brightness less a half)', near(m.walkTargetValue(3, 64, 3), level.brightness(3, 64, 3) - 0.5));
}

// a bowl: stew
{
  const { level, player, sounds, events } = setup();
  const m = spawn(level, 0.5, 64, 0.5);
  useOn(level, player, m, stack('bowl'));
  check('a bowl held to it: mushroom stew (the bowl the stew)', held(player)?.item.id === 'mushroom_stew' && held(player).count === 1 && !held(player).tag);
  check('...its milking sound', sounds.some((s) => s.n === 'entity.mooshroom.milk' && s.v === 1 && s.p === 1));
  check('...an interaction (the game event, by the player)', events.some((e) => e.e === 'entity_interact' && e.who === player));
  useOn(level, player, m, stack('bowl', 5));
  check('...from a stack of bowls: one used, the stew put away', held(player)?.item.id === 'bowl' && held(player).count === 4 && invCount(player, 'mushroom_stew') === 1);
  player.inventory.main.fill(null);
  useOn(level, player, m, stack('bowl'), { creative: true });
  useOn(level, player, m, stack('bowl'), { creative: true });
  check('...in creative, the bowl kept and a stew added each time', held(player)?.item.id === 'bowl' && held(player).count === 1 && invCount(player, 'mushroom_stew') === 2);
  player.inventory.main.fill(null);
  const calf = spawn(level, 6.5, 64, 0.5, { baby: true });
  useOn(level, player, calf, stack('bowl'));
  check('...not from a calf', held(player)?.item.id === 'bowl');
  useOn(level, player, m, stack('bucket'));
  check('a bucket: milk, as from any cow', held(player)?.item.id === 'milk_bucket');
}

// shears: a cow, and five mushrooms
{
  const { level, player, sounds, parts, events } = setup();
  const m = spawn(level, 0.5, 64, 0.5);
  m.health = 7;
  m.setCustomName('Daisy');
  m.customNameVisible = true;
  m.persistenceRequired = true;
  m.bodyYaw = 33;
  const before = new Set(level.entities);
  useOn(level, player, m, stack('shears'));
  const cows = level.entities.filter((e) => !before.has(e) && e.type === 'cow' && !e.removed);
  const cow = cows[0];
  const drops = newItems(level, before);
  check('shears: the mooshroom gone, a cow where it stood (its health, name, turn, and kept as it was)', m.removed && cows.length === 1 && near(cow.x, m.x) && near(cow.z, m.z) && cow.health === 7 && cow.customName === 'Daisy' && cow.customNameVisible && cow.persistenceRequired && cow.bodyYaw === 33 && !(cow instanceof Mooshroom));
  check('...five red mushrooms from the top of its back, each one on its own, to be picked up at once', drops.length === 5 && drops.every((e) => e.stack.item.id === 'red_mushroom' && e.stack.count === 1 && e.pickupDelay === 0 && near(e.y, m.y + 1.4, 1e-6) && near(e.dy, 0.2) && Math.abs(e.dx) <= 0.1 && Math.abs(e.dz) <= 0.1));
  check('...the snip (the shears\' sound), a puff where it stood, the shear game event', sounds.some((s) => s.n === 'entity.mooshroom.shear' && s.v === 1) && parts.some((p) => p.k === 'explosion' && near(p.y, m.y + 0.7) && p.dx === 0) && events.some((e) => e.e === 'shear' && e.who === player));
  check('...a point of wear on the shears', held(player)?.item.id === 'shears' && held(player).damage === 1);
  const brown = spawn(level, 6.5, 64, 0.5, { variant: 'brown' });
  const b2 = new Set(level.entities);
  useOn(level, player, brown, stack('shears'));
  check('...a brown one\'s: five brown mushrooms', newItems(level, b2).filter((e) => e.stack.item.id === 'brown_mushroom').length === 5);
  const calf = spawn(level, 12.5, 64, 0.5, { baby: true });
  useOn(level, player, calf, stack('shears'));
  check('...not a calf', !calf.removed && held(player).damage === 0);
  const sh = stack('shears');
  sh.damage = sh.item.maxDamage - 1;
  const last = spawn(level, 18.5, 64, 0.5);
  useOn(level, player, last, sh);
  check('...shears on their last use break', last.removed && held(player) === null && sounds.some((s) => s.n === 'entity.item.break'));
}

// a brown one's flowers, suspicious stew
{
  const { level, player, sounds, parts, spells } = setup();
  const m = spawn(level, 0.5, 64, 0.5, { variant: 'brown' });
  useOn(level, player, m, stack('cornflower', 3));
  check('a small flower to a brown one: taken (one used), what it does in it (the cornflower: jump boost, 5 s)', held(player)?.count === 2 && JSON.stringify(m.stewEffects) === JSON.stringify([{ id: 'jump_boost', duration: 100 }]), JSON.stringify(m.stewEffects));
  check('...four swirls of an effect off it, its munching (2 loud)', spells.length === 4 && spells.every((s) => s.k === 'effect' && near(s.y, m.y + 0.7) && s.x >= m.x && s.x < m.x + 0.5) && sounds.some((s) => s.n === 'entity.mooshroom.eat' && s.v === 2));
  useOn(level, player, m, stack('poppy', 3));
  check('...a second one before a bowl: not taken, two wisps of smoke', held(player)?.count === 3 && m.stewEffects[0].id === 'jump_boost' && parts.filter((p) => p.k === 'smoke').length === 2);
  sounds.length = 0;
  useOn(level, player, m, stack('bowl'));
  const s = held(player);
  check('...then a bowl: suspicious stew, with what the flower did, and it\'s gone from the mooshroom', s?.item.id === 'suspicious_stew' && JSON.stringify(s.tag?.stewEffects) === JSON.stringify([{ id: 'jump_boost', duration: 100 }]) && m.stewEffects === null);
  check('...milked suspiciously (its own sound)', sounds.some((x) => x.n === 'entity.mooshroom.suspicious_milk'));
  useOn(level, player, m, stack('bowl'));
  check('...the next bowl plain stew again', held(player)?.item.id === 'mushroom_stew');
  const red = spawn(level, 6.5, 64, 0.5);
  useOn(level, player, red, stack('dandelion', 2));
  check('a red one takes no flower', held(player)?.count === 2 && red.stewEffects === null);
  const calf = spawn(level, 12.5, 64, 0.5, { variant: 'brown', baby: true });
  useOn(level, player, calf, stack('allium'), { creative: true });
  check('...a brown calf does (in creative, the flower kept)', JSON.stringify(calf.stewEffects) === JSON.stringify([{ id: 'fire_resistance', duration: 60 }]) && held(player)?.item.id === 'allium' && held(player).count === 1);
  // each flower's effect
  const SS = M['game/suspiciousStew'];
  const table = { dandelion: 'saturation:7', poppy: 'night_vision:100', blue_orchid: 'saturation:7', allium: 'fire_resistance:60', azure_bluet: 'blindness:220', red_tulip: 'weakness:140', orange_tulip: 'weakness:140', white_tulip: 'weakness:140', pink_tulip: 'weakness:140', oxeye_daisy: 'regeneration:140', cornflower: 'jump_boost:100', lily_of_the_valley: 'poison:220' };
  const badF = Object.entries(table).filter(([f, want]) => { const e = SS.flowerStewEffects(f); return !e || e.length !== 1 || `${e[0].id}:${e[0].duration}` !== want || !SS.SMALL_FLOWERS.has(f); });
  check('what each flower puts in (vanilla 1.20.2+: saturation 7 ticks, night vision 5 s, fire resistance 3 s, blindness 11 s, weakness 7 s, regeneration 7 s, jump boost 5 s, poison 11 s)', badF.length === 0 && !SS.flowerStewEffects('sunflower') && !SS.SMALL_FLOWERS.has('sunflower'), badF.map(([f]) => f).join());
}

// lightning
{
  const { level, sounds } = setup();
  const m = spawn(level, 0.5, 64, 0.5);
  const L = M['entity/lightning'].LightningBolt;
  const bolt = new L(level);
  bolt.moveTo(0.5, 64, 0.5, 0, 0);
  m.thunderHit(bolt);
  m.thunderHit(bolt);
  m.thunderHit(bolt);
  check('struck by lightning: a red one turns brown, once for the bolt (it strikes several ticks), unhurt, unburnt', m.variant === 'brown' && m.health === 10 && m.remainingFireTicks <= 0);
  check('...with a shimmer (2 loud)', sounds.filter((s) => s.n === 'entity.mooshroom.convert' && s.v === 2).length === 1);
  const bolt2 = new L(level);
  m.thunderHit(bolt2);
  check('...another bolt turns it back red', m.variant === 'red');
  // a real bolt, as it strikes (no fire, which its flashes may light even in peaceful, and that would burn it)
  level.difficulty = 'peaceful';
  level.gameRules.doFireTick = false;
  const b3 = new L(level);
  b3.moveTo(0.5, 64, 0.5, 0, 0);
  level.addEntity(b3);
  tick(level, 12);
  check('...a bolt striking beside it (its whole flash): turned once', m.variant === 'brown' && m.health === 10, `${m.variant} ${m.health} ${m.remainingFireTicks}`);
}

// breeding, the 1 in 1024, a spawn egg on one
{
  const { level, player, bred } = setup();
  const a = spawn(level, 0.5, 64, 0.5), b = spawn(level, 2.5, 64, 0.5);
  useOn(level, player, a, stack('wheat', 4));
  useOn(level, player, b, stack('wheat', 4));
  check('wheat to two grown ones: both in love', a.isInLove() && b.isInLove());
  tick(level, 200);
  const calves = living(level, Mooshroom).filter((e) => e.isBaby());
  check('...a calf, red as they are; the breeding trigger (the player who fed them)', calves.length === 1 && calves[0].variant === 'red' && bred.length === 1 && bred[0].cause === player);
  const cow = spawn(level, 6.5, 64, 0.5, { type: 'cow' });
  cow.setInLove?.(player);
  const c = spawn(level, 8.5, 64, 0.5);
  c.setInLove(player);
  check('...a mooshroom and a cow don\'t mate', !c.canMate(cow) && !cow.canMate(c));
  const x = spawn(level, 10.5, 64, 0.5), y = spawn(level, 12.5, 64, 0.5, { variant: 'brown' });
  let same = 0, mut = 0, mixedBrown = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) {
    const k = x.makeBaby(x);
    if (k.variant === 'brown') mut++;
    else same++;
  }
  for (let i = 0; i < 20000; i++) if (x.makeBaby(y).variant === 'brown') mixedBrown++;
  check('two of a colour: a calf of the other one time in 1024; of different colours, either (even odds)', near(mut / N, 1 / 1024, 0.0004) && near(mixedBrown / 20000, 0.5, 0.02), `${mut} of ${N}, ${mixedBrown} of 20000`);
  player.inventory.main[player.inventory.selected] = stack('mooshroom_spawn_egg');
  const before = new Set(level.entities);
  useOn(level, player, y, stack('mooshroom_spawn_egg'));
  const egg = level.entities.filter((e) => !before.has(e) && e instanceof Mooshroom);
  check('a spawn egg on one: a calf of its colour', egg.length === 1 && egg[0].isBaby() && egg[0].variant === 'brown');
  const ADV = M['game/advancements'];
  check('...a mooshroom one of Two by Two\'s', ADV.BREEDABLE?.includes?.('mooshroom') ?? (await import('node:fs')).readFileSync('src/game/advancements.ts', 'utf8').includes("'mooshroom'"));
}

// loot, sounds
{
  const { level } = setup();
  const m = spawn(level, 0.5, 64, 0.5);
  const lt = m.lootTable();
  check('loot: a cow\'s (0 to 2 leather, 1 to 3 beef, cooked if it burns)', JSON.stringify(lt) === JSON.stringify([{ item: 'leather', min: 0, max: 2 }, { item: 'beef', min: 1, max: 3, cooked: 'cooked_beef' }]));
  const xs = new Set();
  for (let i = 0; i < 60; i++) xs.add(m.experienceReward());
  check('...1 to 3 experience', [...xs].sort().join() === '1,2,3');
  check('its voice the cow\'s (0.4 loud)', m.ambientSound() === 'entity.cow.ambient' && m.hurtSound() === 'entity.cow.hurt' && m.deathSound() === 'entity.cow.death' && m.stepSound() === 'entity.cow.step' && m.soundVolume() === 0.4);
  const SND = M['audio/synth'].SOUNDS;
  const bad = [];
  let takes = 0;
  for (const [k, n] of Object.entries({ convert: 2, eat: 4, milk: 3, suspicious_milk: 3 })) {
    const s = SND['entity.mooshroom.' + k];
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
  check(`the mooshroom's sounds (vanilla's takes: convert 2, eat 4, milk 3, suspicious_milk the milk's; ${takes} in all), its shearing the sheep's`, bad.length === 0 && SND['entity.mooshroom.shear'] === SND['entity.sheep.shear'] && SND['entity.mooshroom.suspicious_milk'] === SND['entity.mooshroom.milk'], bad.join(', '));
}

// saving, /summon
{
  const { level, player } = setup();
  const m = spawn(level, 0.5, 64, 0.5, { variant: 'brown' });
  m.stewEffects = [{ id: 'poison', duration: 220 }];
  const s = JSON.parse(JSON.stringify(m.save()));
  const c = new Mooshroom(level);
  c.load(s);
  check('saved: its Type, and what a flower put in it (stew_effects)', c.variant === 'brown' && JSON.stringify(c.stewEffects) === JSON.stringify([{ id: 'poison', duration: 220 }]) && s.data.Type === 'brown', JSON.stringify(s.data));
  const plain = new Mooshroom(level);
  plain.load(JSON.parse(JSON.stringify(spawn(level, 3.5, 64, 0.5).save())));
  check('...a red one with nothing in it', plain.variant === 'red' && plain.stewEffects === null);
  const cmd = M['game/commands'];
  const game = { meta: { allowCommands: true }, chat() {}, player, playerName: 'Tester', level, world: level.world, sound: { play() {} }, applyGameRules() {}, teleport() {}, changeDimension() {} };
  const at = (x) => living(level, Mooshroom).find((e) => Math.abs(e.x - x) < 0.01);
  cmd.executeCommand(game, 'summon mooshroom 10.5 64 10.5 {Type:"brown"}');
  check('/summon mooshroom {Type:"brown"}: brown', at(10.5)?.variant === 'brown');
  cmd.executeCommand(game, 'summon mooshroom 12.5 64 10.5 {Type:"brown",stew_effects:[{id:"minecraft:night_vision",duration:100},{id:"minecraft:poison"}]}');
  check('...with stew_effects (a duration left out is 160 ticks)', JSON.stringify(at(12.5)?.stewEffects) === JSON.stringify([{ id: 'night_vision', duration: 100 }, { id: 'poison', duration: 160 }]), JSON.stringify(at(12.5)?.stewEffects));
  cmd.executeCommand(game, 'summon mooshroom 14.5 64 10.5 {stew_effects:[{id:"minecraft:nonsense",duration:100}]}');
  check('...an effect that doesn\'t exist: none taken', at(14.5) && at(14.5).stewEffects === null);
  cmd.executeCommand(game, 'summon mooshroom 16.5 64 10.5 {Type:"purple"}');
  check('...an unknown Type: red', at(16.5)?.variant === 'red');
}

// spawning
{
  const pick = (biome, type) => spawner.biomeSettings(B[biome]).creature.find((d) => d.type === type);
  const mf = spawner.biomeSettings(B.mushroom_fields);
  const mo = pick('mushroom_fields', 'mooshroom');
  check('mooshrooms on the mushroom fields (8, in fours to eights), nothing else there (no monsters; bats underground)', mo?.weight === 8 && mo.min === 4 && mo.max === 8 && mf.creature.length === 1 && mf.monster.length === 0 && !pick('plains', 'mooshroom'), JSON.stringify(mf.creature));
  const { level } = setup();
  level.setBlock(4, 63, 0, S('grass_block'));
  const ns = new spawner.NaturalSpawner(level, 1);
  const rule = (x, y, z) => ns.checkSpawnRules('mooshroom', x, y, z);
  check('spawn rules: on mycelium in the light, not on grass', rule(0, 64, 0) && !rule(4, 64, 0));
  const animals = ['pig', 'cow', 'sheep', 'chicken', 'horse', 'donkey', 'mule', 'llama', 'trader_llama', 'panda'];
  const wrong = animals.filter((t) => !ns.checkSpawnRules(t, 4, 64, 0) || ns.checkSpawnRules(t, 0, 64, 0));
  check('...the other animals\' as they were: on grass, not on mycelium', wrong.length === 0, wrong.join(' '));
  level.dayTime = 18000;
  level.updateSkyBrightness();
  check('...the sky\'s light counts, day or night (vanilla: raw brightness over 8)', rule(0, 64, 0));
  for (let x = -1; x <= 1; x++) for (let z = 9; z <= 11; z++) for (let y = 64; y <= 66; y++) if (x || z !== 10 || y === 66) level.setBlock(x, y, z, S('stone'));
  check('...but not in the dark', !rule(0, 64, 10));
  // new chunks of the mushroom fields: herds of them
  let herds = 0, n = 0, red = 0;
  for (let i = 0; i < 80; i++) {
    const { level: l2 } = setup();
    const s2 = new spawner.NaturalSpawner(l2, 1000 + i);
    const out = s2.spawnForNewChunk(i % 4 - 2, Math.floor(i / 4) % 4 - 2);
    const ms = out.filter((e) => e instanceof Mooshroom);
    if (ms.length) herds++;
    n += ms.length;
    red += ms.filter((e) => e.variant === 'red').length;
    if (herds >= 6) break;
  }
  check('...new chunks there come with herds of them (all red)', herds >= 3 && n >= 3 * 4 && red === n, `${herds} herds, ${n} mooshrooms`);
}

// a dispenser's shears
{
  const { level } = setup();
  const m = spawn(level, 0.5, 64, 2.5);
  level.setBlock(0, 64, 1, S('dispenser'));
  const D = M['game/redstone/dispenseItems'];
  const src = { level, x: 0, y: 64, z: 1, facing: 3, be: { addItem: () => -1 }, success: true };
  const before = new Set(level.entities);
  const left = D.dispenseBehaviorFor(stack('shears'))(src, stack('shears'));
  check('a dispenser\'s shears shear it (a cow and five mushrooms; a point of wear)', m.removed && newItems(level, before).length === 5 && level.entities.some((e) => !before.has(e) && e.type === 'cow') && left?.item.id === 'shears' && left.damage === 1 && src.success);
}

// suspicious stew: crafting, the creative tabs, its tooltip
{
  const CR = M['inventory/customRecipes'];
  const SS = M['game/suspiciousStew'];
  const g = (...ids) => ids.map((i) => (i ? stack(i) : null));
  const r1 = CR.customRecipeFor(g('bowl', 'red_mushroom', null, 'brown_mushroom', 'azure_bluet', null, null, null, null), 3);
  check('a bowl, a brown mushroom, a red one and a flower (anywhere in the grid): suspicious stew with what the flower does', r1?.result.item.id === 'suspicious_stew' && JSON.stringify(r1.result.tag?.stewEffects) === JSON.stringify([{ id: 'blindness', duration: 220 }]));
  const r2 = CR.customRecipeFor(g('bowl', 'red_mushroom', 'brown_mushroom', 'oxeye_daisy'), 2);
  check('...in the 2x2 grid too', JSON.stringify(r2?.result.tag?.stewEffects) === JSON.stringify([{ id: 'regeneration', duration: 140 }]));
  const bads = [g('bowl', 'red_mushroom', 'brown_mushroom', 'oxeye_daisy', 'poppy', null, null, null, null), g('bowl', 'red_mushroom', 'red_mushroom', 'oxeye_daisy'), g('bowl', 'red_mushroom', 'brown_mushroom', 'sunflower'), g('bowl', 'red_mushroom', 'brown_mushroom', null)];
  check('...nothing else in the grid, one of each, a small flower', bads.every((x) => !CR.customRecipeFor(x, x.length === 4 ? 2 : 3)));
  const R = M['inventory/recipes'];
  const plainStew = R.findRecipe(g('bowl', 'red_mushroom', 'brown_mushroom', null), 2, 2);
  check('...(the three without a flower: mushroom stew, as before)', plainStew?.result === 'mushroom_stew');
  const cs = M['item/creativeStacks'].stacksOf(ITEMS.get('suspicious_stew'));
  const labels = cs.map((s) => s.tag.stewEffects.map((e) => `${e.id}:${e.duration}`).join());
  // ((the wither) and vanilla's ninth, the wither rose's, after the lily of the valley's, once the rose is in the game)
  const wantStews = 'saturation:7,night_vision:100,fire_resistance:60,blindness:220,weakness:140,regeneration:140,jump_boost:100,poison:220' + (ITEMS.has('wither_rose') ? ',wither:140' : '');
  check('the creative tabs: a stew for each different flower (8; 9 with the wither rose), in vanilla\'s order', labels.join() === wantStews, labels.join());
  const food = ITEM_LIST.filter((i) => i.creativeTab === 'food').map((i) => i.id);
  check('...after the rabbit stew', food.indexOf('suspicious_stew') === food.indexOf('rabbit_stew') + 1);
  const NI = M['net/items'];
  const wire = M['net/items'].itemToWire?.(cs[3]);
  check('...one a creative guest may take (with its effects)', !NI.creativeItem || (() => { const got = NI.creativeItem(wire); return got !== 'bad' && got && JSON.stringify(got.tag?.stewEffects) === JSON.stringify(cs[3].tag.stewEffects); })());
  const HT = M['item/hoverText'];
  const lines = (s, creative) => { HT.tooltipFlag.creative = creative; const l = []; ITEMS.get('suspicious_stew').hoverText?.(s, l); return l.map((x) => x.replace(/§./g, '')); };
  const nv = SS.suspiciousStew([{ id: 'night_vision', duration: 100 }]);
  check('its tooltip, in creative mode: its effects (as a potion\'s); otherwise nothing (it\'s suspicious)', lines(nv, true).join('|') === 'Night Vision (00:05)' && lines(nv, false).length === 0 && lines(stack('suspicious_stew'), true).join() === 'No Effects', lines(nv, true).join('|'));
  HT.tooltipFlag.creative = false;
}

// eating suspicious stew (its effect)
{
  const { level, player } = setup();
  const SS = M['game/suspiciousStew'];
  player.food.level = 10;
  player.inventory.main[player.inventory.selected] = SS.suspiciousStew([{ id: 'night_vision', duration: 100 }]);
  M['game/itemBehavior'].itemBehaviorOf('suspicious_stew').finishUsing(level, player, player.inventory.selectedItem);
  const fx = player.getEffect?.('night_vision') ?? [...player.activeEffects.values()].find((e) => e.id === 'night_vision');
  check('a suspicious stew eaten: what\'s in it (night vision, 5 s), the stew\'s food, the bowl back', fx?.duration === 100 && player.food.level === 16 && player.inventory.selectedItem?.item.id === 'bowl', `${fx?.duration} ${player.food.level}`);
}

// the textures, the renderer
{
  const MT = M['textures/mobs'].MOB_TEXTURES;
  const RR = M['render/mooshroomRenderer'];
  const skins = ['red_mooshroom', 'brown_mooshroom'].map((n) => MT[n]?.());
  const cowSkin = MT.cow();
  const opaqueSame = (a) => { for (let i = 3; i < a.data.length; i += 4) if ((a.data[i] > 0) !== (cowSkin.data[i] > 0)) return false; return true; };
  const avg = (t, x0, y0, w, h) => { let r = 0, g = 0, b = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * 64 + x) * 4; r += t.data[i]; g += t.data[i + 1]; b += t.data[i + 2]; } const n = w * h; return [r / n, g / n, b / n]; };
  const [rr, rg, rb] = avg(skins[0], 28, 14, 12, 18), [br, bg, bb] = avg(skins[1], 28, 14, 12, 18);
  check('two skins, the red mooshroom\'s and the brown\'s: the cow\'s layout (64x32, every box of it painted), red with pale spots, brown with cream ones', skins.every((t) => t && t.w === 64 && t.h === 32 && opaqueSame(t)) && rr > rg * 2 && rr > rb * 2 && br > bg && bg > bb && br < 170, `${rr.toFixed(0)},${rg.toFixed(0)},${rb.toFixed(0)} ${br.toFixed(0)},${bg.toFixed(0)},${bb.toFixed(0)}`);
  check('...its spawn egg (red with grey spots)', !!M['textures/items'].ITEM_TEXTURES.mooshroom_spawn_egg);
  // the renderer, through stand-ins
  const { level } = setup();
  const m = spawn(level, 0.5, 64, 0.5);
  const A = { limbSwing: 0, limbAmount: 0, age: 100, headYaw: 20, headPitch: 0 };
  const drawn = [], blocks = [];
  let quads = 0;
  const batch = { quad() { quads++; }, begin() {}, flush() {}, setOverlay() {}, lightB: 96, lightS: 100, color: [1, 1, 1, 1] };
  const pose = new M['render/entityRenderer'].PoseStack();
  const kit = {
    pose, items: { render() {}, renderBlockState(b, ps, st) { blocks.push({ st, m: [...ps.m] }); } }, tex: (n) => (MT[n] ? { n } : null),
    setupLiving: () => { pose.reset(); return A; }, overlay() {},
    drawBody: (b, e, d, tex) => { drawn.push(tex.n); d.root.render(b, pose, d.texW, d.texH); },
    drawModel: () => {}, state: (t, extra) => ({ texture: t, ...extra }), attackAnim: () => 0,
  };
  const rend = new RR.MooshroomRenderers(kit);
  const cow = spawn(level, 4.5, 64, 0.5, { type: 'cow', settle: false });
  const ok1 = rend.render(batch, m, 0, 0, 0, 0.5) && !rend.render(batch, cow, 0, 0, 0, 0.5);
  check('drawn as a cow in its own skin (not a plain cow)', ok1 && quads > 0 && drawn.join() === 'red_mooshroom');
  check('...three red mushrooms on it (vanilla MushroomCowMushroomLayer: two on its back, one on its head)', blocks.length === 3 && blocks.every((x) => x.st === S('red_mushroom')));
  // where they stand: the back ones where vanilla's transforms put them; the head's turns with its head
  const at = (mm) => [mm[12], mm[13], mm[14]];
  const T = at(blocks[0].m);
  check('...the first on its back where vanilla puts it (0.2, -0.35, 0.5 less its turned half block)', near(T[1], -0.35 + 0.5, 1e-6), T.map((v) => v.toFixed(3)).join());
  const headOne = at(blocks[2].m);
  blocks.length = 0;
  A.headYaw = -30;
  rend.render(batch, m, 0, 0, 0, 0.5);
  const headTwo = at(blocks[2].m);
  check('...the head\'s turns with its head', !near(headOne[0], headTwo[0], 1e-4) && near(at(blocks[0].m)[0], T[0], 1e-9));
  blocks.length = 0;
  m.variant = 'brown';
  drawn.length = 0;
  rend.render(batch, m, 0, 0, 0, 0.5);
  check('a brown one: its skin, brown mushrooms', drawn.join() === 'brown_mooshroom' && blocks.length === 3 && blocks.every((x) => x.st === S('brown_mushroom')));
  blocks.length = 0;
  const calf = spawn(level, 8.5, 64, 0.5, { baby: true });
  rend.render(batch, calf, 0, 0, 0, 0.5);
  check('...a calf has none', blocks.length === 0);
  m.isInvisible = () => true;
  rend.render(batch, m, 0, 0, 0, 0.5);
  check('...nor an invisible one', blocks.length === 0);
  check('its shadow: 0.7 (a calf\'s half)', RR.MOOSHROOM_SHADOW_RADII.mooshroom === 0.7);
}

close?.();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);

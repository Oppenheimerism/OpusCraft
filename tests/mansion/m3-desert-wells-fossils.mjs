// M3: desert wells and fossils — the bone block (textures, sounds, drops, placing it, recipes), the desert well's loot
// (the two new sherds and the suspicious stew, which gives its effect when eaten), where desert wells go and what
// they're built of chunk by chunk, their suspicious sand, the fossils (the eight templates, where the upper and lower
// ones go and how deep, the rot and the ore, laid chunk by chunk), real ones on seed 12345, and what they cost chunk
// generation.

import { load, check, blockName, flatLevel, buildLevel, place, exitWithStatus } from '../temples/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/world/gen/desertWell.ts', '/src/world/gen/fossil.ts', '/src/world/gen/fossilTemplates.ts', '/src/world/gen/geode.ts', '/src/game/desertWells.ts',
  '/src/game/archaeology.ts', '/src/game/decoratedPot.ts', '/src/game/interaction.ts', '/src/entity/player.ts', '/src/entity/effects.ts',
  '/src/inventory/recipes.ts', '/src/game/itemBehavior.ts', '/src/textures/blocks.ts', '/src/textures/items.ts', '/src/textures/decoratedPot.ts',
  '/src/audio/synth.ts', '/src/render/mesher.ts', '/src/world/mapColors.ts',
]);
const SEED = '12345';
const G = 64;
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);
const name = (st) => blockName(m, Math.max(0, st));
/** vanilla BlockPos.asLong, here on its own */
const asLong = (x, y, z) => BigInt.asIntN(64, ((BigInt(x) & 0x3ffffffn) << 38n) | ((BigInt(z) & 0x3ffffffn) << 12n) | (BigInt(y) & 0xfffn));

/** java.util.Random, worked out here on its own in BigInt: its nextInt(n) */
function javaRandom(seed) {
  const M = (1n << 48n) - 1n;
  let s = (BigInt.asUintN(64, seed) ^ 0x5deece66dn) & M;
  const next = (bits) => {
    s = (s * 0x5deece66dn + 0xbn) & M;
    return Number(s >> BigInt(48 - bits));
  };
  return {
    nextInt(n) {
      if ((n & -n) === n) return Number((BigInt(n) * BigInt(next(31))) >> 31n);
      for (;;) {
        const bits = next(31), v = bits % n;
        if (bits - v + (n - 1) < 2 ** 31) return v;
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The bone block

{
  const b = m.getBlock('bone_block');
  check('bone block: a pillar on three axes, standing up by default', b.propIndex('axis') >= 0 && b.get(b.defaultState, 'axis') === 'y' && ['x', 'y', 'z'].every((a) => b.with(b.defaultState, 'axis', a) > 0));
  check('bone block: strength 2, mined with a pickaxe', b.hardness === 2 && b.s.tool === 'pickaxe' && b.s.requiresTool === true);
  const drop = (tool) => m.blockDrops(b.defaultState, tool ? m.ITEMS.get(tool) : null, new m.Rand(1)).map((s) => `${s.item.id}x${s.count}`).join();
  check('bone block: drops itself with a pickaxe, nothing by hand', drop('wooden_pickaxe') === 'bone_blockx1' && drop('diamond_pickaxe') === 'bone_blockx1' && drop() === '', `${drop('wooden_pickaxe')} / ${drop()}`);
  const events = ['break', 'step', 'place', 'hit', 'fall'];
  check(`bone block: its own sounds (${events.join(', ')})`, b.sound === 'bone_block' && events.every((e) => m.SOUNDS[`block.bone_block.${e}`]));
  let clean = true;
  for (const e of ['break', 'step']) {
    const g = m.SOUNDS[`block.bone_block.${e}`];
    for (let v = 0; v < g.variants; v++) {
      const s = g.generate(v, 44100);
      let peak = 0;
      for (const x of s) peak = Math.max(peak, Math.abs(x));
      if (!(s.length > 441 && peak > 0.05 && peak <= 1 && s.every(Number.isFinite))) clean = false;
    }
  }
  check('bone block: its break and step sounds render clean', clean);
  const side = m.BLOCK_TEXTURES.bone_block_side?.(), top = m.BLOCK_TEXTURES.bone_block_top?.();
  const opaque = (t) => t.data.every((v, i) => i % 4 !== 3 || v === 255);
  check('bone block: side and top textures, 16x16, solid, not the same', side && top && side.w === 16 && top.w === 16 && opaque(side) && opaque(top) && !side.data.every((v, i) => v === top.data[i]));
  // the model: a column, its top on the ends and turned onto its axis
  const asked = new Set();
  m.initMesher(new Proxy({}, { get: (_, n) => (asked.add(n), { u0: 0, v0: 0, u1: 1, v1: 1 }) }));
  const turns = ['x', 'y', 'z'].map((a) => {
    asked.clear();
    const st = b.with(b.defaultState, 'axis', a);
    const c = b.s.model(m.STATE_VIEWS[st]);
    m.bakeChoice(c);
    return { names: [...asked].filter((n) => typeof n === 'string' && n !== 'missing').sort().join(), x: c.x ?? 0, y: c.y ?? 0 };
  });
  check('bone block: its model uses the side and the top, turned for x and z', turns.every((t) => t.names === 'bone_block_side,bone_block_top') && turns[1].x === 0 && turns[0].x === 90 && turns[2].x === 90 && turns[0].y !== turns[2].y, JSON.stringify(turns));
  // placed against a face it lies along that face's axis, as a log does
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const axes = [[0, 'y'], [1, 'y'], [2, 'z'], [3, 'z'], [4, 'x'], [5, 'x']].map(([face, a], i) => {
    place(m, level, 'bone_block', i * 2 - 5, G + 1, 0, { face });
    return m.blockOf(level.getState(i * 2 - 5, G + 1, 0)).get(level.getState(i * 2 - 5, G + 1, 0), 'axis') === a;
  });
  check('bone block: placed against a face it lies along that face\'s axis', axes.every(Boolean), JSON.stringify(axes));
  const grid = (rows, key) => {
    const cells = [];
    for (const r of rows) for (const ch of r.padEnd(3)) cells.push(ch === ' ' ? null : stack(key[ch]));
    return cells;
  };
  const block = m.findRecipe(grid(['###', '###', '###'], { '#': 'bone_meal' }), 3, 3);
  const meal = m.findRecipe(grid(['#  '], { '#': 'bone_block' }), 3, 3);
  check('bone block: nine bone meal make one, and it goes back into nine', block?.result === 'bone_block' && block.count === 1 && meal?.result === 'bone_meal' && meal.count === 9, `${JSON.stringify(block)} ${JSON.stringify(meal)}`);
  check('bone block: in the natural blocks tab, 64 to a stack, the sand colour on maps',
    m.ITEMS.get('bone_block')?.creativeTab === 'natural' && m.ITEMS.get('bone_block').maxStack === 64 && m.mapColorOf(b.defaultState) === m.mapColorOf(m.S('sand')));
}

// ---------------------------------------------------------------------------------------------------------------
// The desert well's loot: two new sherds, and the suspicious stew

const WELL_TABLE = ['arms_up_pottery_sherd', 'brewer_pottery_sherd', 'brick', 'emerald', 'stick', 'suspicious_stew'];
const STEW = [['night_vision', 7, 10], ['jump_boost', 7, 10], ['weakness', 6, 8], ['blindness', 5, 7], ['poison', 10, 20], ['saturation', 7, 10]];
{
  const NEW = ['arms_up_pottery_sherd', 'brewer_pottery_sherd'];
  check('sherds: arms up and brewer, 64 to a stack', NEW.every((id) => m.ITEMS.get(id)?.maxStack === 64) && m.ITEMS.get('arms_up_pottery_sherd').name === 'Arms Up Pottery Sherd');
  const sprites = NEW.map((id) => m.ITEM_TEXTURES[id]?.());
  const px = (t, x, y) => t.data[(y * t.w + x) * 4 + 3];
  check('sherds: a sprite each, 16x16, clear at the corners, a fragment of at least 120 pixels', sprites.every((t) => {
    if (!t || t.w !== 16 || t.h !== 16 || px(t, 0, 0) || px(t, 15, 0) || px(t, 0, 15) || px(t, 15, 15)) return false;
    let n = 0;
    for (let i = 3; i < t.data.length; i += 4) if (t.data[i] === 255) n++;
    return n >= 120 && t.data.every((v, i) => i % 4 !== 3 || v === 0 || v === 255);
  }));
  check('sherds: their patterns on a decorated pot\'s side, each its own', NEW.every((id) => m.patternOf(id)) && m.patternOf(NEW[0]) !== m.patternOf(NEW[1]) &&
    !m.decoratedPotSideTexture(m.patternOf(NEW[0])).data.every((v, i) => v === m.decoratedPotSideTexture(null).data[i]));
  check('sherds: they go on decorated pots (#decorated_pot_sherds)', NEW.every((id) => m.SHERDS.includes(id)));
  const stew = m.ITEMS.get('suspicious_stew');
  check('suspicious stew: one to a stack, 6 food and 0.6 saturation, always edible, the bowl back', stew?.maxStack === 1 && stew.food?.nutrition === 6 && stew.food.saturation === 0.6 && stew.food.alwaysEat && stew.food.remainder === 'bowl');
  check('suspicious stew: its sprite', !!m.ITEM_TEXTURES.suspicious_stew?.());

  const t = m.LOOT_TABLES['archaeology/desert_well'];
  check('loot: archaeology/desert_well, one roll: the sherds 2 each, brick, emerald, stick and suspicious stew 1 each, in vanilla\'s order',
    t?.length === 1 && t[0].rolls === 1 && t[0].entries.map((e) => `${e.item}:${e.weight}`).join() === 'arms_up_pottery_sherd:2,brewer_pottery_sherd:2,brick:1,emerald:1,stick:1,suspicious_stew:1');
  check('loot: the stew\'s set_stew_effect: night vision, jump boost, weakness, blindness, poison or saturation', JSON.stringify(t[0].entries[5].stewEffects) === JSON.stringify(STEW));
  // rolled as vanilla rolls it: nextInt(8) for the entry, then for the stew nextInt(6) for the effect and its seconds
  let same = true, detail = '';
  const seen = new Map(), effects = new Map();
  let durations = true;
  for (let i = 0; i < 8000; i++) {
    const seed = asLong(i * 7 - 9000, 40 + (i % 60), i * 13);
    const got = m.rollSeededLoot('archaeology/desert_well', seed);
    const r = javaRandom(seed);
    const k = r.nextInt(8), want = WELL_TABLE[[0, 0, 1, 1, 2, 3, 4, 5][k]];
    const id = got[0]?.item.id;
    seen.set(id, (seen.get(id) ?? 0) + 1);
    if (got.length !== 1 || id !== want) {
      same = false;
      detail = `${seed}: ${id} / ${want}`;
    }
    if (id === 'suspicious_stew') {
      const [eff, lo, hi] = STEW[r.nextInt(6)];
      const secs = lo + r.nextInt(hi - lo + 1);
      const fx = got[0].tag?.stewEffects;
      const ticks = eff === 'saturation' ? secs : secs * 20;
      if (fx?.length !== 1 || fx[0].id !== eff || fx[0].duration !== ticks) {
        durations = false;
        detail = `${seed}: ${JSON.stringify(fx)} / ${eff} ${ticks}`;
      }
      effects.set(eff, (effects.get(eff) ?? 0) + 1);
    }
  }
  check('loot: seeded, each roll comes out as java.util.Random(seed) draws it', same, detail);
  check('loot: sherds a quarter each, the other four an eighth each', WELL_TABLE.every((id, i) => Math.abs(seen.get(id) / 8000 - (i < 2 ? 0.25 : 0.125)) < 0.02), JSON.stringify([...seen]));
  check('loot: each stew holds one of the six effects, for its seconds (saturation, an instant effect, in ticks)', durations && effects.size === 6, detail);
}

// eating one, through the game's own use of an item
{
  const { level } = flatLevel(m, -1, -1, 1, 1);
  const eat = (s, { creative = false } = {}) => {
    const p = new m.Player(level);
    if (creative) p.gameMode = 'creative';
    p.moveTo(0.5, G, 0.5, 0, -90);
    level.addEntity(p);
    level.player = p;
    p.food.level = 10;
    p.food.saturation = 0;
    p.inventory.main[0] = s;
    p.inventory.selected = 0;
    const inter = new m.Interaction(level, p);
    inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
    inter.use(true, true);
    const started = p.isUsingItem();
    for (let i = 0; i < 40 && p.isUsingItem(); i++) inter.tickUsingItem();
    return { p, started };
  };
  const s = stack('suspicious_stew');
  s.tag = { stewEffects: [{ id: 'night_vision', duration: 160 }] };
  const { p, started } = eat(s);
  const nv = p.getEffect('night_vision');
  check('suspicious stew: eaten like any stew, over 32 ticks', started && !p.isUsingItem());
  check('suspicious stew: it gives what it holds (night vision, 8 seconds)', nv && nv.duration >= 158 && nv.duration <= 160, JSON.stringify(nv && { d: nv.duration }));
  check('suspicious stew: 6 food and its saturation, and the bowl back in the hand', p.food.level === 16 && Math.abs(p.food.saturation - 7.2) < 1e-6 && p.inventory.main[0]?.item.id === 'bowl' && p.inventory.main[0].count === 1, `${p.food.level} ${p.food.saturation} ${p.inventory.main[0]?.item.id}`);
  const full = stack('suspicious_stew');
  full.tag = { stewEffects: [{ id: 'saturation', duration: 7 }] };
  const q = eat(full, { creative: true });
  const sat = q.p.getEffect('saturation');
  check('suspicious stew: in creative it isn\'t used up; saturation, an instant effect, runs its 7 ticks', q.p.inventory.main[0]?.item.id === 'suspicious_stew' && sat?.duration === 7, JSON.stringify(sat && { d: sat.duration }));
}

// ---------------------------------------------------------------------------------------------------------------
// Desert wells: where they go

/** a made-up terrain for wells: flat ground (the first free block at `ground`), one biome, water on top or hollows under */
const wellTerrain = ({ biome = m.B.desert, ground = 70, water = false, hollow = null } = {}) => ({
  firstFreeHeight: () => ground,
  substanceAt: (x, y, z) => (y >= ground ? m.SUB_AIR : water && y === ground - 1 ? m.SUB_FLUID : hollow?.(x, y, z) ? m.SUB_AIR : m.SUB_SOLID),
  columnBiome: () => biome,
});
const wellsIn = (W, n = 200) => {
  const out = [];
  for (let cx = -n / 2; cx < n / 2; cx++) for (let cz = -n / 2; cz < n / 2; cz++) {
    const w = W.wellAt(cx, cz);
    if (w) out.push({ ...w, cx, cz });
  }
  return out;
};

{
  const W = new m.DesertWells(1234567, wellTerrain());
  const all = wellsIn(W);
  check(`wells: about one desert chunk in a thousand has one (${all.length} in 40000)`, all.length >= 22 && all.length <= 62);
  check('wells: each in its own chunk, on the ground (the top sand)', all.every((w) => w.x >> 4 === w.cx && w.z >> 4 === w.cz && w.y === 69));
  const cross = (dx, dz) => [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]].some(([a, b]) => a === dx && b === dz);
  check('wells: the suspicious sand, one and two under the water, under its middle or a side',
    all.every((w) => w.suspicious.length === 2 && w.suspicious[0][1] === w.y - 1 && w.suspicious[1][1] === w.y - 2 && w.suspicious.every(([x, , z]) => cross(x - w.x, z - w.z))));
  const spread = new Set(all.map((w) => `${w.suspicious[0][0] - w.x},${w.suspicious[0][2] - w.z}`));
  check('wells: the suspicious sand under each of the five', spread.size === 5, [...spread].join(' '));
  // the same spot, with plains, water on top, a hollow under
  const same = (terrain) => all.map((w) => new m.DesertWells(1234567, terrain).wellAt(w.cx, w.cz));
  check('wells: none outside deserts', same(wellTerrain({ biome: m.B.plains })).every((w) => !w) && same(wellTerrain({ biome: m.B.badlands })).every((w) => !w));
  check('wells: none on water', same(wellTerrain({ water: true })).every((w) => !w));
  const hole = (w) => (x, y, z) => x === w.x + 2 && z === w.z - 1 && (y === 68 || y === 67);
  const one = (w) => (x, y, z) => x === w.x - 1 && z === w.z + 2 && y === 68;
  check('wells: none where anywhere under it is hollow two deep; a hollow one deep doesn\'t stop it',
    all.every((w) => !new m.DesertWells(1234567, wellTerrain({ hollow: hole(w) })).wellAt(w.cx, w.cz) && new m.DesertWells(1234567, wellTerrain({ hollow: one(w) })).wellAt(w.cx, w.cz)));
}

/** what the well has at a block, relative to its middle (null: not the well's) */
function wellBlock(w, x, y, z) {
  const dx = x - w.x, dy = y - w.y, dz = z - w.z;
  if (Math.abs(dx) > 2 || Math.abs(dz) > 2) return null;
  if (w.suspicious.some(([a, b, c]) => a === x && b === y && c === z)) return 'suspicious_sand';
  const cross = Math.abs(dx) + Math.abs(dz) <= 1;
  const corner = Math.abs(dx) === 1 && Math.abs(dz) === 1;
  if (dy === 0 && cross) return 'water';
  if (dy === -1 && cross) return 'sand';
  if (dy >= -2 && dy <= 0) return 'sandstone';
  if (dy === 1 && (Math.abs(dx) === 2 || Math.abs(dz) === 2)) return (dx === 0 || dz === 0) ? 'sandstone_slab' : 'sandstone';
  if (dy >= 1 && dy <= 3 && corner) return 'sandstone';
  if (dy === 4 && Math.abs(dx) <= 1 && Math.abs(dz) <= 1) return dx === 0 && dz === 0 ? 'sandstone' : 'sandstone_slab';
  return null;
}

/** chunks of flat sand (the first free block at `ground`) with the wells round them placed chunk by chunk, as the workers do */
function sandChunks(P, x0, z0, x1, z1, ground = 70, fill = 'sand') {
  const FILL = m.S(fill);
  const ctxs = new Map();
  for (let cx = x0 >> 4; cx <= x1 >> 4; cx++)
    for (let cz = z0 >> 4; cz <= z1 >> 4; cz++) {
      const blocks = new Uint16Array(m.COLUMN_VOLUME);
      for (let y = m.MIN_Y; y < ground; y++) for (let i = 0; i < 256; i++) blocks[m.colIndex(i & 15, y, i >> 4)] = FILL;
      const ctx = new m.GenContext(cx, cz, blocks, new Uint8Array(256).fill(m.B.desert));
      ctx.computeHeightmaps();
      P(ctx);
      ctxs.set(cx * 4096 + cz, ctx);
    }
  const get = (x, y, z) => ctxs.get((x >> 4) * 4096 + (z >> 4))?.get(x, y, z) ?? -1;
  return { get, ctxs: [...ctxs.values()], at: (x, y, z) => name(get(x, y, z)) };
}

/** the well's blocks as they are against what it should be; its suspicious sand's block entities */
function wellMatches(w, at, blockEntityAt) {
  let bad = '';
  for (let y = w.y - 3; y <= w.y + 5; y++)
    for (let z = w.z - 3; z <= w.z + 3; z++)
      for (let x = w.x - 3; x <= w.x + 3; x++) {
        const want = wellBlock(w, x, y, z), got = at(x, y, z);
        if (want && got !== want && !bad) bad = `${x} ${y} ${z}: ${got} for ${want}`;
      }
  for (const [x, y, z] of w.suspicious) {
    const be = blockEntityAt(x, y, z);
    if ((!be || be.lootTable !== 'archaeology/desert_well' || String(be.lootSeed) !== asLong(x, y, z).toString()) && !bad) bad = `${x} ${y} ${z}: ${JSON.stringify(be)}`;
  }
  return bad;
}

{
  // wells across chunk borders: each chunk builds its share, and they meet
  const W = new m.DesertWells(1234567, wellTerrain());
  const edge = wellsIn(W, 400).filter((w) => ((w.x & 15) < 2 || (w.x & 15) > 13) && ((w.z & 15) < 2 || (w.z & 15) > 13)).slice(0, 6);
  let bad = '', count = 0;
  for (const w of edge) {
    const c = sandChunks((ctx) => W.place(ctx), w.x - 20, w.z - 20, w.x + 20, w.z + 20);
    const be = (x, y, z) => {
      const ctx = c.ctxs.find((k) => k.inChunk(x, z));
      const d = ctx?.blockEntities.find((b) => b.x === x && b.y === y && b.z === z && b.id === 'brushable_block');
      return d && { lootTable: d.data.lootTable, lootSeed: d.data.lootSeed };
    };
    bad ||= wellMatches(w, c.at, be);
    count += c.ctxs.reduce((a, k) => a + k.blockEntities.length, 0);
  }
  check(`wells: built chunk by chunk, those on chunk corners come out whole (${edge.length})`, edge.length >= 3 && !bad, bad);
  check('wells: just the two suspicious sand have block entities, each with the desert well\'s table and its position as the seed', count === edge.length * 2);
}

// ---------------------------------------------------------------------------------------------------------------
// Fossils

const FOSSILS = ['spine_1', 'spine_2', 'spine_3', 'spine_4', 'skull_1', 'skull_2', 'skull_3', 'skull_4'];
{
  check('fossils: the eight templates, in vanilla\'s order', m.FOSSILS.join() === FOSSILS.join());
  let bones = true, joined = true, sizes = [];
  for (const n of FOSSILS) {
    const t = m.fossilTemplate(n);
    sizes.push(`${n} ${t.sx}x${t.sy}x${t.sz}`);
    const at = new Set();
    for (let i = 0; i < t.blocks.length; i += 4) {
      if (name(t.blocks[i + 3]) !== 'bone_block') bones = false;
      at.add(`${t.blocks[i]},${t.blocks[i + 1]},${t.blocks[i + 2]}`);
    }
    if (t.soft.length || t.markers.length) bones = false;
    // all one piece (blocks touching, edges and corners included)
    const [first] = at, seen = new Set([first]), todo = [first];
    while (todo.length) {
      const [x, y, z] = todo.pop().split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const k = `${x + dx},${y + dy},${z + dz}`;
        if (at.has(k) && !seen.has(k)) (seen.add(k), todo.push(k));
      }
    }
    if (seen.size !== at.size || at.size < 20) joined = false;
  }
  check('fossils: only bone blocks, nothing else set (the rock left as it is round them)', bones);
  check('fossils: each all one piece of at least 20 bones', joined);
  const spines = FOSSILS.slice(0, 4).map((n) => m.fossilTemplate(n)), skulls = FOSSILS.slice(4).map((n) => m.fossilTemplate(n));
  check('fossils: spines longer than they\'re tall, skulls no bigger than 7 across', spines.every((t) => Math.max(t.sx, t.sz) >= 7 && Math.max(t.sx, t.sz) > t.sy) && skulls.every((t) => t.sx <= 7 && t.sz <= 9 && t.sy <= 6), sizes.join(', '));
}

/** a made-up terrain for fossils: flat ground, one biome (or one by position), air where `air` says */
const fossilTerrain = ({ biome = m.B.desert, ground = 70, biome3 = null, air = null } = {}) => ({
  oceanFloorHeight: () => ground,
  substanceAt: (x, y, z) => (y >= ground || air?.(x, y, z) ? m.SUB_AIR : m.SUB_SOLID),
  biome: (x, y, z) => (biome3 ? biome3(x, y, z) : biome),
});
const fossilsIn = (F, n = 100) => {
  const out = [];
  for (let cx = -n / 2; cx < n / 2; cx++) for (let cz = -n / 2; cz < n / 2; cz++) for (const p of [0, 1]) {
    const f = F.fossilAt(cx, cz, p);
    if (f) out.push({ ...f, cx, cz, p });
  }
  return out;
};

{
  const F = new m.Fossils(7654321, fossilTerrain());
  const all = fossilsIn(F);
  const upper = all.filter((f) => !f.p), lower = all.filter((f) => f.p);
  check(`fossils: about one chunk in 64 has an upper one, and one in 64 a lower one (${upper.length} and ${lower.length} in 10000)`,
    upper.length > 110 && upper.length < 205 && lower.length > 110 && lower.length < 205);
  const names = new Set(all.map((f) => f.template)), rots = new Set(all.map((f) => f.rot));
  check('fossils: all eight turn up, turned all four ways', FOSSILS.every((n) => names.has(n)) && rots.size === 4);
  check('fossils: centred on a spot in their chunk', all.every((f) => (f.x + (f.wx >> 1)) >> 4 === f.cx && (f.z + (f.wz >> 1)) >> 4 === f.cz));
  // under ground at 70: an upper one 15-24 under it when the height drawn is above it; deeper, never below y -54
  const under = upper.filter((f) => f.y >= 46 && f.y <= 55).length / upper.length;
  check(`fossils: upper ones 15 to 24 blocks under the ground (${(under * 100).toFixed(0)}%; the rest where the height drawn was under the ground)`,
    upper.every((f) => f.y <= 55 && f.y >= -54) && under > 0.72 && under < 0.86);
  check('fossils: lower ones between y -54 and -23, with diamonds; upper ones with coal', lower.every((f) => f.y >= -54 && f.y <= -23 && f.diamonds) && upper.every((f) => !f.diamonds));
  const at54 = lower.filter((f) => f.y === -54).length / lower.length;
  check(`fossils: the lower ones' depth stops at y -54, ten above the bottom (${(at54 * 100).toFixed(0)}% there)`, at54 > 0.4 && at54 < 0.66);
  // biomes
  const count = (terrain) => fossilsIn(new m.Fossils(7654321, terrain), 60).length;
  check('fossils: in swamps and mangrove swamps too, none in plains or forests',
    count(fossilTerrain({ biome: m.B.swamp })) > 60 && count(fossilTerrain({ biome: m.B.mangrove_swamp })) > 60 && count(fossilTerrain({ biome: m.B.plains })) === 0 && count(fossilTerrain({ biome: m.B.forest })) === 0);
  const deepDark = fossilsIn(new m.Fossils(7654321, fossilTerrain({ biome3: (_x, y) => (y < 0 ? m.B.deep_dark : m.B.desert) })), 60);
  check('fossils: the biome is the one at the height drawn (none of the lower ones where the deep dark is under the desert)', deepDark.length > 50 && deepDark.every((f) => !f.p));
  // a box with more than four corners in air isn't laid
  const caves = fossilsIn(new m.Fossils(7654321, fossilTerrain({ air: (_x, y) => y < 20 })), 60);
  check('fossils: none with more than four of its corners in air (a cave under y 20 takes the lower ones and the deep upper ones)', caves.length > 40 && caves.every((f) => f.y + m.fossilTemplate(f.template).sy - 1 >= 20));
  const half = fossilsIn(new m.Fossils(7654321, fossilTerrain({ air: (x) => (x & 1) === 0 })), 40);
  check('fossils: four corners in air is still allowed', half.length > 20);
}

/** chunks of flat rock (`fill` under `ground`) with one fossil laid into them chunk by chunk */
function fossilChunks(F, f, fill = 'stone', ground = 70, before = null) {
  const c = sandChunks((ctx) => {
    before?.(ctx);
    F.lay(ctx, f);
  }, f.x - 16, f.z - 16, f.x + f.wx + 16, f.z + f.wz + 16, ground, fill);
  return c;
}

/** where a template block goes in a fossil (worked out here on its own: turned about the box's corner) */
function fossilPos(f, t, tx, ty, tz) {
  const [x, z] = f.rot === 1 ? [f.x + t.sz - 1 - tz, f.z + tx] : f.rot === 2 ? [f.x + t.sx - 1 - tx, f.z + t.sz - 1 - tz] : f.rot === 3 ? [f.x + tz, f.z + t.sx - 1 - tx] : [f.x + tx, f.z + tz];
  return [x, f.y + ty, z];
}

{
  const F = new m.Fossils(7654321, fossilTerrain());
  const all = fossilsIn(F, 80);
  const tally = { bone: 0, ore: 0, rock: 0, other: 0 };
  let axes = true, box = true, ore = true, detail = '';
  for (const f of all.slice(0, 80)) {
    const fill = f.p ? 'deepslate' : 'stone';
    const c = fossilChunks(F, f, fill);
    const t = m.fossilTemplate(f.template);
    for (let i = 0; i < t.blocks.length; i += 4) {
      const [x, y, z] = fossilPos(f, t, t.blocks[i], t.blocks[i + 1], t.blocks[i + 2]);
      if (x < f.x || x >= f.x + f.wx || z < f.z || z >= f.z + f.wz || y < f.y || y >= f.y + t.sy) box = false;
      const st = c.get(x, y, z), n = name(st);
      if (n === 'bone_block') {
        tally.bone++;
        const a = m.blockOf(t.blocks[i + 3]).get(t.blocks[i + 3], 'axis'), want = f.rot & 1 && a !== 'y' ? (a === 'x' ? 'z' : 'x') : a;
        if (m.blockOf(st).get(st, 'axis') !== want) axes = false;
      } else if (n === 'coal_ore' || n === 'deepslate_diamond_ore') {
        tally.ore++;
        if (n !== (f.p ? 'deepslate_diamond_ore' : 'coal_ore')) ore = false;
      } else if (n === fill) tally.rock++;
      else {
        tally.other++;
        detail = `${n} at ${x} ${y} ${z}`;
      }
    }
    // nothing laid outside the template's places
    const places = new Set();
    for (let i = 0; i < t.blocks.length; i += 4) places.add(fossilPos(f, t, t.blocks[i], t.blocks[i + 1], t.blocks[i + 2]).join());
    for (let y = f.y - 2; y < f.y + t.sy + 2; y++)
      for (let z = f.z - 2; z < f.z + f.wz + 2; z++)
        for (let x = f.x - 2; x < f.x + f.wx + 2; x++) if (!places.has(`${x},${y},${z}`) && c.get(x, y, z) >= 0 && name(c.get(x, y, z)) !== (y < 70 ? fill : 'air')) box = false;
  }
  const n = tally.bone + tally.ore + tally.rock;
  check(`fossils: laid chunk by chunk, every bone in its place in the template's box, nothing else touched (${all.length > 80 ? 80 : all.length} fossils)`, box && tally.other === 0, detail);
  check('fossils: the bones turned with the fossil (x and z swap in a quarter turn)', axes);
  check(`fossils: a tenth of the bones rotted away and ore in a tenth of their places (bones ${(tally.bone / n * 100).toFixed(0)}%, ore ${(tally.ore / n * 100).toFixed(0)}%, rock ${(tally.rock / n * 100).toFixed(0)}%)`,
    Math.abs(tally.bone / n - 0.81) < 0.04 && Math.abs(tally.ore / n - 0.1) < 0.03 && Math.abs(tally.rock / n - 0.09) < 0.03);
  check('fossils: coal ore in the upper ones, deepslate diamond ore in the lower', ore && all.some((f) => f.p) && all.some((f) => !f.p));
  // what vanilla's fossils mustn't replace stays
  const f = all.find((x) => !x.p);
  const t = m.fossilTemplate(f.template);
  const spots = [];
  for (let i = 0; i < t.blocks.length && spots.length < 3; i += 28) spots.push(fossilPos(f, t, t.blocks[i], t.blocks[i + 1], t.blocks[i + 2]));
  const c = fossilChunks(F, f, 'stone', 70, (ctx) => spots.forEach(([x, y, z], k) => ctx.inChunk(x, z) && ctx.set(x, y, z, m.S(['chest', 'spawner', 'bedrock'][k]))));
  check('fossils: a chest, a spawner or bedrock in its way stays', spots.every(([x, y, z], k) => c.at(x, y, z) === ['chest', 'spawner', 'bedrock'][k]));
  // the same fossil from any chunk: place() lays the share of the fossils round each chunk
  const g = all.find((x) => (x.x >> 4) !== ((x.x + x.wx - 1) >> 4) || (x.z >> 4) !== ((x.z + x.wz - 1) >> 4));
  const byPlace = sandChunks((ctx) => F.place(ctx), g.x - 16, g.z - 16, g.x + g.wx + 16, g.z + g.wz + 16, 70, g.p ? 'deepslate' : 'stone');
  const byLay = fossilChunks(F, g, g.p ? 'deepslate' : 'stone');
  const tg = m.fossilTemplate(g.template);
  let agree = true;
  for (let i = 0; i < tg.blocks.length; i += 4) {
    const [x, y, z] = fossilPos(g, tg, tg.blocks[i], tg.blocks[i + 1], tg.blocks[i + 2]);
    if (byPlace.get(x, y, z) !== byLay.get(x, y, z)) agree = false;
  }
  check('fossils: one across a chunk border comes out the same from each chunk it\'s in', agree);
}

// ---------------------------------------------------------------------------------------------------------------
// Seed 12345

const gen = new m.ChunkGenerator(SEED);
{
  // the nearest desert to spawn is some 5000 blocks out; its well
  const w = gen.desertWells.wellAt(3333 >> 4, 3961 >> 4);
  check('seed 12345: a desert well at 3333, 66, 3961', w && w.x === 3333 && w.y === 66 && w.z === 3961, JSON.stringify(w));
  const { world } = buildLevel(m, gen, SEED, (w.x >> 4) - 1, (w.z >> 4) - 1, (w.x >> 4) + 1, (w.z >> 4) + 1);
  const bad = wellMatches(w, (x, y, z) => name(world.getState(x, y, z)), (x, y, z) => world.getBlockEntity(x, y, z));
  check('seed 12345: the well generated whole, its suspicious sand with the desert well\'s table', !bad, bad);
  const be = world.getBlockEntity(...w.suspicious[0]);
  be.unpackLootTable(null);
  check(`seed 12345: brushed, its suspicious sand holds one of the table's things (${be.item?.item.id})`, WELL_TABLE.includes(be.item?.item.id));
  check('seed 12345: the well\'s biome is desert', gen.columnBiome(w.x, w.z) === m.B.desert);
  let wells = 0;
  for (let cx = -150; cx <= 150; cx++) for (let cz = -150; cz <= 150; cz++) if (gen.desertWells.wellAt(cx, cz)) wells++;
  check('seed 12345: none within 2400 blocks of spawn, where there\'s no desert', wells === 0);
}
{
  // a swamp north-west of spawn has the nearest fossils
  const want = [[0, 'spine_3', -1151, 44, -564], [0, 'skull_1', -1149, 39, -672], [1, 'skull_1', -1116, -54, -636]];
  const found = [];
  for (let cx = -80; cx <= -60; cx++) for (let cz = -50; cz <= -30; cz++) for (const p of [0, 1]) {
    const f = gen.fossils.fossilAt(cx, cz, p);
    if (f) found.push(f);
  }
  const has = want.every(([p, n, x, y, z]) => found.some((f) => f.template === n && f.x === x && f.y === y && f.z === z && f.diamonds === !!p));
  check('seed 12345: fossils under the swamp at -1150, -650 (an upper spine_3 at y 44, skull_1s at y 39 and, with diamonds, -54)', has, found.map((f) => `${f.template} ${f.x} ${f.y} ${f.z}`).join('; '));
  const f = found.find((x) => x.template === 'spine_3' && x.x === -1151);
  const { world } = buildLevel(m, gen, SEED, (f.x >> 4) - 1, (f.z >> 4) - 1, (f.x + f.wx) >> 4, (f.z + f.wz) >> 4);
  const t = m.fossilTemplate(f.template);
  const counts = {};
  for (let i = 0; i < t.blocks.length; i += 4) {
    const n = name(world.getState(...fossilPos(f, t, t.blocks[i], t.blocks[i + 1], t.blocks[i + 2])));
    counts[n] = (counts[n] ?? 0) + 1;
  }
  check(`seed 12345: the spine_3 generated in its chunks (${JSON.stringify(counts)})`, counts.bone_block >= t.blocks.length / 4 * 0.6 && (counts.bone_block ?? 0) + (counts.coal_ore ?? 0) >= t.blocks.length / 4 * 0.75);
  check('seed 12345: 15 or more blocks of rock over it', gen.firstFreeHeight(f.x, f.z, true) - (f.y + t.sy) >= 15 - t.sy);
}

// ---------------------------------------------------------------------------------------------------------------
// What it costs

{
  const t0 = performance.now();
  let n = 0;
  const G2 = new m.ChunkGenerator('cost');
  for (let cx = 0; cx < 60; cx++) for (let cz = 0; cz < 60; cz++) {
    G2.fossils.fossilAt(cx, cz, 0);
    G2.fossils.fossilAt(cx, cz, 1);
    G2.desertWells.wellAt(cx, cz);
    n++;
  }
  const per = (performance.now() - t0) / n;
  console.log(`     (working out a chunk's fossils and well: ${(per * 1000).toFixed(0)} µs)`);
  check('cost: working out a chunk\'s fossils and well takes well under a millisecond on average', per < 0.8);
  // chunks in the desert with its fossils and well, and without
  const a = new m.ChunkGenerator(SEED), b = new m.ChunkGenerator(SEED);
  b.fossils.place = () => {};
  b.desertWells.place = () => {};
  const time = (g) => {
    const s = performance.now();
    for (let cx = 205; cx < 211; cx++) for (let cz = 244; cz < 250; cz++) g.generate(cx, cz);
    return (performance.now() - s) / 36;
  };
  time(a), time(b);
  const ta = time(a), tb = time(b);
  console.log(`     (desert chunks: ${ta.toFixed(1)} ms each, ${tb.toFixed(1)} without the fossils and wells)`);
  check('cost: desert chunks take no more than 15% longer for them', ta < tb * 1.15 + 1);
}

await exitWithStatus(close);

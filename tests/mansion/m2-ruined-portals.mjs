// M2: ruined portals — where they go (one chance in each 40 x 40-chunk region, the kind drawn and struck off until
// one fits the biome at its spot, each kind's setups and heights, the Nether's), the thirteen templates, what the
// processors do to them as they go in (crying obsidian, gold taken, lava cooled, magma, aged and mossy bricks,
// blackstone in the Nether, waterlogging), the netherrack spread, vines and leaves, the chest and its loot, real
// portals on seed 12345, lighting a repaired frame with flint and steel, /locate, and what it costs chunk generation.

import { load, check, blockName, exitWithStatus } from '../temples/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/world/gen/ruinedPortal.ts', '/src/world/gen/ruinedPortalTemplates.ts', '/src/game/ruinedPortals.ts', '/src/world/gen/nether.ts',
  '/src/world/gen/jigsaw.ts', '/src/game/portal.ts', '/src/game/fire.ts',
]);
const SEED = '12345';
const f32 = Math.fround;
const PORTALS = ['portal_1', 'portal_2', 'portal_3', 'portal_4', 'portal_5', 'portal_6', 'portal_7', 'portal_8', 'portal_9', 'portal_10'];
const GIANTS = ['giant_portal_1', 'giant_portal_2', 'giant_portal_3'];

/** a made-up terrain: flat ground (the first free block at `ground`), a sea bed at `floor`, one biome everywhere */
const flat = (biome, { ground = 64, floor = ground, dimension = 'overworld', biome3 = null } = {}) => ({
  dimension, minY: dimension === 'overworld' ? -64 : 0,
  baseHeight: (_x, _z, sea) => (sea ? floor : ground),
  column: (_x, _z, sea) => (y) => y < (sea ? floor : ground),
  biome: (x, y, z) => (biome3 ? biome3(x, y, z) : biome),
  surfaceBiome: () => biome,
});
const portals = (biome, opts) => new m.RuinedPortals(987654321n, flat(biome, opts));
const stubs = (P, n = 12) => {
  const out = [];
  for (let rx = -n / 2; rx < n / 2; rx++) for (let rz = -n / 2; rz < n / 2; rz++) out.push(P.stub(rx, rz));
  return out;
};

/** where a template position goes for a portal */
function worldPos(s, x, y, z) {
  const t = m.portalTemplate(s.template);
  const [dx, dz] = m.transformAbout(x, z, s.mirror, s.rot, t.sx >> 1, t.sz >> 1);
  return [s.x + dx, s.y + y, s.z + dz];
}

/**
 * chunks of flat ground (`fill` below `ground`, water from `sea` up to `water`) with a portal placed into them chunk
 * by chunk, as the chunk workers place it; the blocks read back through `get`, and a World of them if asked
 */
function portalChunks(P, s, { ground = 64, fill = 'stone', sea = ground, water = ground, biome = m.B.plains, world = false } = {}) {
  const b = s.box, FILL = m.S(fill), WATER = m.S('water');
  const ctxs = new Map();
  for (let cx = (b.minX - 17) >> 4; cx <= (b.maxX + 17) >> 4; cx++)
    for (let cz = (b.minZ - 17) >> 4; cz <= (b.maxZ + 17) >> 4; cz++) {
      const blocks = new Uint16Array(m.COLUMN_VOLUME);
      for (let y = m.MIN_Y; y < water; y++)
        for (let i = 0; i < 256; i++) blocks[m.colIndex(i & 15, y, i >> 4)] = y < Math.min(ground, sea) ? FILL : WATER;
      const ctx = new m.GenContext(cx, cz, blocks, new Uint8Array(256).fill(biome));
      ctx.computeHeightmaps();
      P.place(ctx);
      ctxs.set(cx * 4096 + cz, ctx);
    }
  const get = (x, y, z) => ctxs.get((x >> 4) * 4096 + (z >> 4))?.get(x, y, z) ?? -1;
  let w = null;
  if (world) {
    w = new m.World();
    for (const ctx of ctxs.values())
      w.addChunk({ cx: ctx.cx, cz: ctx.cz, blocks: ctx.blocks, light: m.computeChunkLight(ctx.blocks), biomes: ctx.biomes, pending: ctx.pendingWrites(),
        fluidTicks: ctx.fluidTicks, blockEntities: ctx.blockEntities, entities: ctx.entities, postProcess: ctx.postProcess });
  }
  return { get, ctxs: [...ctxs.values()], world: w, name: (x, y, z) => blockName(m, Math.max(0, get(x, y, z))) };
}

/** the template's blocks of a portal with what went into the world in their place */
function templateVsWorld(s, chunks) {
  const t = m.portalTemplate(s.template);
  const out = [];
  for (let i = 0; i < t.blocks.length; i += 4) {
    const [x, y, z] = worldPos(s, t.blocks[i], t.blocks[i + 1], t.blocks[i + 2]);
    out.push({ ty: t.blocks[i + 1], was: blockName(m, t.blocks[i + 3]), now: chunks.name(x, y, z), x, y, z });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Placement

{
  const P = portals(m.B.plains);
  // vanilla setLargeFeatureWithSalt(seed, rx, rz, 34222645), then nextInt(25) for x and for z (linear spread)
  let salt = true;
  for (const [rx, rz] of [[0, 0], [3, -2], [-5, 7]]) {
    const seed = BigInt(rx) * 341873128712n + BigInt(rz) * 132897987541n + 987654321n + 34222645n;
    const r = new m.JavaRandom(Number(BigInt.asUintN(48, seed)));
    const i = r.nextInt(25), j = r.nextInt(25);
    const [cx, cz] = P.potentialChunk(rx, rz);
    if (cx !== rx * 40 + i || cz !== rz * 40 + j) salt = false;
  }
  check('placement: the start chunk drawn from the salt 34222645 as vanilla draws it (spacing 40, separation 15)', salt);

  // every region of a one-biome world gets the kind that biome has, with its setups
  const expect = [
    ['plains', m.B.plains, 'standard'], ['desert', m.B.desert, 'desert'], ['jungle', m.B.jungle, 'jungle'], ['swamp', m.B.swamp, 'swamp'],
    ['meadow', m.B.meadow, 'mountain'], ['ocean', m.B.ocean, 'ocean'],
  ];
  for (const [label, biome, kind] of expect) {
    const all = stubs(portals(biome, { floor: 40 }));
    const ok = all.every((s) => s && s.kind === kind);
    const places = [...new Set(all.map((s) => s?.setup.placement))].sort().join(', ');
    check(`placement: a ${kind} portal in every region of an all-${label} world (${places})`, ok);
  }
  const nether = stubs(portals(m.B.nether_wastes, { dimension: 'the_nether' }));
  check('placement: a nether portal in every region of the Nether', nether.every((s) => s?.kind === 'nether' && s.setup.placement === 'in_nether' && s.setup.blackstone));
  check('placement: no portal in the deep dark (no kind has it)', stubs(portals(m.B.deep_dark), 6).every((s) => !s));
  check('placement: no nether portal in the Overworld, nor Overworld ones in the Nether',
    stubs(portals(m.B.nether_wastes), 6).every((s) => !s) && stubs(portals(m.B.plains, { dimension: 'the_nether' }), 6).every((s) => !s));

  // the standard kind: half underground (always an air pocket), half on the ground (half of those with one)
  const std = stubs(P, 20);
  const under = std.filter((s) => s.setup.placement === 'underground'), onGround = std.filter((s) => s.setup.placement === 'on_land_surface');
  const pocket = onGround.filter((s) => s.airPocket).length / onGround.length;
  check(`placement: standard portals half underground, half on the ground (${under.length} / ${onGround.length})`, Math.abs(under.length - onGround.length) < std.length * 0.15);
  check(`placement: underground ones always in an air pocket, on the ground half the time (${(pocket * 100).toFixed(0)}%)`, under.every((s) => s.airPocket) && Math.abs(pocket - 0.5) < 0.12);
  const giant = std.filter((s) => GIANTS.includes(s.template)).length / std.length;
  const names = new Set(std.map((s) => s.template)), rots = new Set(std.map((s) => s.rot)), mirrors = new Set(std.map((s) => s.mirror));
  check(`placement: one in twenty is giant (${(giant * 100).toFixed(1)}%), every template turns up, all four turns, mirrored or not`,
    giant > 0.02 && giant < 0.09 && PORTALS.every((n) => names.has(n)) && rots.size === 4 && mirrors.size === 2);

  // vanilla's draws, in order, for a desert one (one setup, never an air pocket): giant or not, which, the turn, the mirror
  let draws = true;
  for (const s of stubs(portals(m.B.desert), 6)) {
    const r = m.largeFeatureRandom(987654321n, s.cx, s.cz);
    const name = r.nextFloat() < f32(0.05) ? GIANTS[r.nextInt(3)] : PORTALS[r.nextInt(10)];
    const rot = r.nextInt(4), mirror = r.nextFloat() < 0.5 ? 0 : 2;
    const t = m.portalTemplate(name);
    // vanilla findSuitableY for PARTLY_BURIED: the top block less the height, 2 to 8 up, then down to the ground
    const y = Math.min(63, 63 - t.sy + r.nextInt(7) + 2);
    if (s.template !== name || s.rot !== rot || s.mirror !== mirror || s.y !== y) draws = false;
  }
  check('placement: the template, turn, mirror and height drawn from the start chunk\'s random as vanilla draws them', draws);

  // heights: on the ground at the top block, sea bed, under ground within vanilla's range, the Nether's
  const land = onGround.every((s) => s.y === 63), sub = under.every((s) => s.y >= -49 && s.y <= 63 - m.portalTemplate(s.template).sy);
  check('placement: on the ground at the top block; underground between y -49 and the ground less the portal\'s height', land && sub);
  const sea = stubs(portals(m.B.ocean, { floor: 40 }));
  check('placement: ocean portals on the sea bed, not the water\'s surface', sea.every((s) => s.y === 39));
  check('placement: nether portals from y 27 to the ground', nether.every((s) => s.y >= 27 && s.y <= 63));
  const mount = stubs(portals(m.B.meadow, { ground: 120 }));
  check('placement: mountain portals inside the mountain from y 70, or on it', mount.every((s) => (s.setup.placement === 'in_mountain' ? s.y >= 70 && s.airPocket : s.y === 119)));
  // cold: high up, or in a snowy biome, the kinds that can be
  check('placement: cold in snowy plains, not in plains; deserts never are',
    stubs(portals(m.B.snowy_plains), 6).every((s) => s.cold) && std.every((s) => !s.cold) && stubs(portals(m.B.desert), 6).every((s) => !s.cold));

  // the box: vanilla getBoundingBox, mirrored about the corner and turned about the template's middle
  const t = m.portalTemplate('portal_1');
  const box = (rot, mirror) => {
    const [ax, az] = m.transformAbout(0, 0, mirror, rot, 3, 3), [bx, bz] = m.transformAbout(6, 5, mirror, rot, 3, 3);
    return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)].join(',');
  };
  check('placement: turned about the template\'s middle (vanilla transform with a pivot)',
    t.sx === 7 && t.sz === 6 && box(0, 0) === '0,0,6,5' && box(1, 0) === '1,0,6,6' && box(2, 0) === '0,1,6,6' && box(3, 0) === '0,0,5,6' && box(0, 2) === '-6,0,0,5');
}

// ---------------------------------------------------------------------------------------------------------------
// Templates

{
  const all = [...PORTALS, ...GIANTS];
  let chests = true, gold = true, gaps = true, sizes = true, lava = 0;
  for (const name of all) {
    const t = m.portalTemplate(name), f = m.portalFrame(name);
    const names = [];
    for (let i = 0; i < t.blocks.length; i += 4) names.push(blockName(m, t.blocks[i + 3]));
    if (names.filter((n) => n === 'chest').length !== 1) chests = false;
    if (!names.includes('gold_block')) gold = false;
    if (names.includes('lava')) lava++;
    // the frame's ring (corners aside) has lost some blocks but not all
    const at = new Map();
    for (let i = 0; i < t.blocks.length; i += 4) at.set(`${t.blocks[i]},${t.blocks[i + 1]},${t.blocks[i + 2]}`, blockName(m, t.blocks[i + 3]));
    let lost = 0;
    for (let i = 0; i < f.w; i++)
      for (let j = 0; j < f.h; j++) {
        const edge = i === 0 || i === f.w - 1 || j === 0 || j === f.h - 1, corner = (i === 0 || i === f.w - 1) && (j === 0 || j === f.h - 1);
        if (!edge || corner) continue;
        const p = f.lie === 'x' ? [f.x + i, f.y + j, f.z] : f.lie === 'z' ? [f.x, f.y + j, f.z + i] : [f.x + i, f.y, f.z + j];
        if (at.get(p.join(',')) !== 'obsidian') lost++;
      }
    if (lost < 1 || lost > 6) gaps = false;
    const big = GIANTS.includes(name);
    if (big ? f.w < 6 || f.h < 9 : f.w !== 4 || f.h !== 5) sizes = false;
  }
  check('templates: portal_1-10 and giant_portal_1-3', all.every((n) => m.portalTemplate(n)));
  check('templates: one chest each, and gold', chests && gold);
  check('templates: every frame has lost between one and six blocks (corners aside)', gaps);
  check('templates: 4 x 5 frames, bigger ones in the giants', sizes);
  check(`templates: lava in some (${lava})`, lava >= 4);
  const lying = all.filter((n) => m.portalFrame(n).lie === 'flat');
  check(`templates: some have fallen flat (${lying.join(', ')})`, lying.length >= 2 && lying.some((n) => GIANTS.includes(n)));
}

// ---------------------------------------------------------------------------------------------------------------
// Processors, the spread, vines and leaves (portals placed chunk by chunk into flat ground)

{
  const tally = (list, fn) => {
    const c = {};
    for (const e of list) {
      const k = fn(e);
      if (k) c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  };
  const P = portals(m.B.plains);
  const surface = stubs(P, 14).filter((s) => s.setup.placement === 'on_land_surface' && !s.airPocket).slice(0, 30);
  const rows = [];
  let spreadOk = true, farOk = true, drips = 0, chests = 0, lootOk = true, vines = 0, leaves = 0;
  for (const s of surface) {
    const c = portalChunks(P, s);
    rows.push(...templateVsWorld(s, c));
    // the netherrack round it: on the ground about its middle, and none more than 15 blocks off
    const mx = s.box.minX + ((s.box.maxX - s.box.minX + 1) >> 1), mz = s.box.minZ + ((s.box.maxZ - s.box.minZ + 1) >> 1);
    const nr = (x, z) => ['netherrack', 'magma_block'].includes(c.name(x, 63, z));
    if (!nr(mx + 3, mz + 1) && !nr(mx - 2, mz - 2)) spreadOk = false;
    for (let d = -20; d <= 20; d++) if (nr(mx + d, mz + 17) || nr(mx + 17, mz + d)) farOk = false;
    if (['netherrack', 'magma_block'].includes(c.name(mx + 3, 62, mz + 1))) drips++;
    for (const ctx of c.ctxs)
      for (const be of ctx.blockEntities) {
        chests++;
        if (be.data?.lootTable !== 'chests/ruined_portal' || c.name(be.x, be.y, be.z) !== 'chest') lootOk = false;
      }
    for (const ctx of c.ctxs)
      for (let i = 0; i < ctx.blocks.length; i++) {
        const n = blockName(m, ctx.blocks[i]);
        if (n === 'vine') vines++;
        if (n === 'jungle_leaves') leaves++;
      }
  }
  const above = rows.filter((r) => r.ty > 0);
  const obs = tally(above.filter((r) => r.was === 'obsidian'), (r) => r.now);
  const crying = obs.crying_obsidian / (obs.crying_obsidian + obs.obsidian);
  check(`processors: 15% of the obsidian crying (${(crying * 100).toFixed(1)}% of ${obs.crying_obsidian + obs.obsidian})`, Math.abs(crying - 0.15) < 0.04);
  const gold = tally(above.filter((r) => r.was === 'gold_block'), (r) => r.now);
  const taken = (gold.air ?? 0) / ((gold.air ?? 0) + (gold.gold_block ?? 0));
  check(`processors: 30% of the gold taken (${(taken * 100).toFixed(0)}%)`, Math.abs(taken - 0.3) < 0.12);
  const lava = tally(rows.filter((r) => r.was === 'lava'), (r) => r.now);
  const kept = (lava.lava ?? 0) / Object.values(lava).reduce((a, b) => a + b, 0);
  check(`processors: 80% of the lava stays lava in a warm biome (${(kept * 100).toFixed(0)}%, the rest magma)`, Math.abs(kept - 0.8) < 0.12);
  const rack = tally(rows.filter((r) => r.was === 'netherrack'), (r) => r.now);
  const magma = (rack.magma_block ?? 0) / ((rack.magma_block ?? 0) + (rack.netherrack ?? 0));
  check(`processors: 7% of the netherrack magma (${(magma * 100).toFixed(1)}%)`, Math.abs(magma - 0.07) < 0.03);
  const bricks = tally(above.filter((r) => r.was === 'stone_bricks' || r.was === 'chiseled_stone_bricks'), (r) => r.now.replace(/^(stone_bricks|chiseled_stone_bricks)$/, 'kept'));
  const nb = Object.values(bricks).reduce((a, b) => a + b, 0);
  check(`processors: half the bricks aged (${JSON.stringify(bricks)})`, Math.abs(bricks.kept / nb - 0.5) < 0.12 && bricks.cracked_stone_bricks > 0 && bricks.stone_brick_stairs > 0);
  const stairs = tally(above.filter((r) => r.was === 'stone_brick_stairs'), (r) => r.now);
  check(`processors: half the stairs mossy stairs or a mossy slab (${JSON.stringify(stairs)})`, stairs.mossy_stone_brick_stairs > 0 && stairs.mossy_stone_brick_slab > 0 && stairs.stone_brick_stairs > 0);
  check('processors: the chests keep their place, each with the ruined portal loot table', chests === surface.length && lootOk);
  check('spread: netherrack on the ground round each portal, none more than 15 blocks from its middle', spreadOk && farOk);
  check(`spread: netherrack dripping below the ground (${drips} of ${surface.length})`, drips > surface.length / 2);
  check('spread: no vines or jungle leaves on standard portals', vines === 0 && leaves === 0);

  // cold: lava to netherrack, and no magma anywhere
  const C = portals(m.B.snowy_plains);
  const cold = stubs(C, 10).filter((s) => s.setup.placement === 'on_land_surface').slice(0, 12);
  const crow = [];
  let coldMagma = 0;
  for (const s of cold) {
    const c = portalChunks(C, s, { biome: m.B.snowy_plains });
    crow.push(...templateVsWorld(s, c));
    for (const ctx of c.ctxs) for (let i = 0; i < ctx.blocks.length; i++) if (blockName(m, ctx.blocks[i]) === 'magma_block') coldMagma++;
  }
  const coldLava = tally(crow.filter((r) => r.was === 'lava'), (r) => r.now);
  check(`processors: cold, the lava turns to netherrack and there's no magma (${JSON.stringify(coldLava)})`, !coldLava.lava && coldLava.netherrack > 0 && coldMagma === 0);

  // underground: an air pocket clears the box above its floor
  const under = stubs(P, 10).filter((s) => s.setup.placement === 'underground').slice(0, 6);
  let cleared = true;
  for (const s of under) {
    const c = portalChunks(P, s);
    for (const r of templateVsWorld(s, c)) if (r.was === 'air' && r.now !== 'air' && r.now !== 'vine') cleared = false;
  }
  check('air pocket: an underground portal stands in a cleared box in the rock', under.length > 0 && cleared);

  // the sea bed: lava to magma, and what goes into the water is waterlogged
  const O = portals(m.B.ocean, { floor: 40 });
  let seaMagma = true, wet = 0, dry = 0;
  for (const s of stubs(O, 6).slice(0, 10)) {
    const c = portalChunks(O, s, { ground: 63, sea: 40, water: 63, biome: m.B.ocean, fill: 'sand' });
    for (const r of templateVsWorld(s, c)) {
      if (r.was === 'lava' && r.now === 'lava') seaMagma = false;
      const st = c.get(r.x, r.y, r.z);
      const b = m.blockOf(st);
      if (r.ty > 0 && b.propIndex('waterlogged') >= 0) b.get(st, 'waterlogged') ? wet++ : dry++;
    }
  }
  check('processors: on the sea bed the lava is all magma', seaMagma);
  check(`processors: stairs, slabs, walls, bars and chests under water are waterlogged (${wet} of ${wet + dry})`, wet > 0 && dry === 0);

  // the jungle: mossier, vines on the sides of things and jungle leaves on the netherrack
  const J = portals(m.B.jungle);
  let jv = 0, jl = 0, hung = true, persistent = true;
  const jrows = [];
  for (const s of stubs(J, 6).slice(0, 8)) {
    const c = portalChunks(J, s, { biome: m.B.jungle, world: true });
    jrows.push(...templateVsWorld(s, c));
    const w = c.world, b = s.box;
    for (let y = b.minY - 1; y <= b.maxY + 2; y++)
      for (let z = b.minZ - 18; z <= b.maxZ + 18; z++)
        for (let x = b.minX - 18; x <= b.maxX + 18; x++) {
          const st = w.getState(x, y, z), n = blockName(m, st);
          if (n === 'vine') {
            jv++;
            // on a side it hangs from: the block that way has a full face
            const bl = m.blockOf(st);
            const sides = [['north', 0, -1], ['south', 0, 1], ['west', -1, 0], ['east', 1, 0]].filter(([p]) => bl.get(st, p));
            if (sides.length !== 1 || !(m.FLAGS[w.getState(x + sides[0][1], y, z + sides[0][2])] & m.F_COLLIDE)) hung = false;
          } else if (n === 'jungle_leaves') {
            jl++;
            if (!m.blockOf(st).get(st, 'persistent') || !['netherrack'].includes(blockName(m, w.getState(x, y - 1, z)))) persistent = false;
          }
        }
  }
  check(`jungle: vines hang on the portals, each from a solid side (${jv})`, jv > 20 && hung);
  check(`jungle: persistent jungle leaves on the netherrack (${jl})`, jl > 20 && persistent);
  const jb = tally(jrows.filter((r) => r.ty > 0 && (r.was === 'stone_bricks' || r.was === 'chiseled_stone_bricks')), (r) => r.now);
  const mossyShare = ((jb.mossy_stone_bricks ?? 0) + (jb.mossy_stone_brick_stairs ?? 0)) / ((jb.mossy_stone_bricks ?? 0) + (jb.mossy_stone_brick_stairs ?? 0) + (jb.cracked_stone_bricks ?? 0) + (jb.stone_brick_stairs ?? 0));
  check(`jungle: mossiness 0.8, most of the aged bricks mossy (${(mossyShare * 100).toFixed(0)}%)`, mossyShare > 0.6);

  // the Nether: blackstone for the bricks, chains for the bars, lava left as it is
  const N = portals(m.B.nether_wastes, { dimension: 'the_nether' });
  const nrows = [];
  for (const s of stubs(N, 6).slice(0, 10)) nrows.push(...templateVsWorld(s, portalChunks(N, s, { fill: 'netherrack', biome: m.B.nether_wastes })));
  const stone = nrows.filter((r) => /stone_brick|^iron_bars/.test(r.now) && !/blackstone/.test(r.now));
  const black = nrows.filter((r) => /blackstone/.test(r.now)).length, chains = nrows.filter((r) => r.was === 'iron_bars' && r.now === 'chain').length;
  check(`nether: stone bricks become polished blackstone, iron bars chains (${black} blackstone, ${chains} chains, ${stone.length} left)`, black > 50 && stone.length === 0 && (chains > 0 || !nrows.some((r) => r.was === 'iron_bars')));
}

// ---------------------------------------------------------------------------------------------------------------
// Real portals on seed 12345, and lighting a repaired frame

{
  const gen = new m.ChunkGenerator(SEED);
  const P = gen.ruinedPortals;
  const s = P.stub(0, 0);
  check('seed 12345: an underground standard portal near spawn (portal_6 at 16, 15, 0)', s?.kind === 'standard' && s.template === 'portal_6' && s.y === 15 && s.x === 16 && s.z === 0);
  const b = s.box;
  const world = new m.World();
  for (let cx = (b.minX - 17) >> 4; cx <= (b.maxX + 17) >> 4; cx++) for (let cz = (b.minZ - 17) >> 4; cz <= (b.maxZ + 17) >> 4; cz++) world.addChunk({ ...gen.generate(cx, cz) });
  const level = new m.Level(world, SEED);
  level.sound = { play() {}, playUI() {} };
  level.particles = { blockBreak() {}, blockHit() {}, spawn() {}, dust() {}, poof() {}, blockParticle() {}, fallingDust() {} };
  const name = (x, y, z) => blockName(m, world.getState(x, y, z));
  const chest = [...world.blockEntities.values()].find((e) => e.id === 'chest' && e.x >= b.minX && e.x <= b.maxX && e.z >= b.minZ && e.z <= b.maxZ);
  check('seed 12345: its chest, with the ruined portal loot table', !!chest && chest.lootTable === 'chests/ruined_portal' && name(chest.x, chest.y, chest.z) === 'chest');
  chest.unpackLoot();
  const items = chest.container.items.filter((i) => i && i.count > 0);
  const table = new Set(m.LOOT_TABLES['chests/ruined_portal'][0].entries.map((e) => e.item));
  // (vanilla splits the rolled stacks over empty slots, so there can be more stacks than rolls)
  check(`seed 12345: the chest fills from the table when opened (${items.map((i) => i.item.id + ' x' + i.count).join(', ')})`,
    items.length >= 4 && items.every((i) => table.has(i.item.id)));
  let air = true;
  for (let y = b.minY + 1; y <= b.maxY; y++) for (let z = b.minZ; z <= b.maxZ; z++) for (let x = b.minX; x <= b.maxX; x++) if (!/^(air|obsidian|crying_obsidian|chest|iron_bars|glow_lichen)$|stone_brick|magma|netherrack|gold/.test(name(x, y, z))) air = false;
  check('seed 12345: its box cleared in the rock (only the portal\'s blocks in it, and glow lichen grown since)', air);

  // the frame: put back what's missing (and the crying obsidian), then flint and steel on its floor
  const f = m.portalFrame(s.template), t = m.portalTemplate(s.template);
  const ring = [];
  for (let i = 0; i < f.w; i++)
    for (let j = 0; j < f.h; j++) {
      const edge = i === 0 || i === f.w - 1 || j === 0 || j === f.h - 1, corner = (i === 0 || i === f.w - 1) && (j === 0 || j === f.h - 1);
      if (edge && !corner) ring.push(worldPos(s, f.x + i, f.y + j, f.z));
    }
  const inside = [];
  for (let i = 1; i < f.w - 1; i++) for (let j = 1; j < f.h - 1; j++) inside.push(worldPos(s, f.x + i, f.y + j, f.z));
  const broken = ring.filter(([x, y, z]) => name(x, y, z) !== 'obsidian').length;
  const light = () => {
    const [x, y, z] = inside[0];
    if (!m.canPlaceFire(world, x, y, z, 'north')) return false;
    m.placeFire(level, x, y, z, m.fireStateAt(world, x, y, z));
    return inside.every(([ix, iy, iz]) => name(ix, iy, iz) === 'nether_portal');
  };
  const lostBefore = !light();
  for (const [x, y, z] of inside) if (name(x, y, z) === 'fire') world.setState(x, y, z, 0);
  for (const [x, y, z] of ring) if (name(x, y, z) !== 'obsidian') level.setBlock(x, y, z, m.S('obsidian'));
  const lit = light();
  check(`frame: as found (${broken} of its ${ring.length} blocks gone or crying) it doesn't light`, broken > 0 && lostBefore);
  check('frame: repaired with obsidian, flint and steel lights it into a portal', lit, inside.map(([x, y, z]) => name(x, y, z)).join(' '));
  void t;

  // a surface one on seed 12345: on the water of a river (its netherrack floating), a standing frame, the chest
  const r = P.stub(-1, 0);
  check('seed 12345: a standard portal on the ground at [-544, ~, 240] (portal_1, y 62)', r?.template === 'portal_1' && r.y === 62 && r.x === -544 && r.z === 240);
  const d = P.stub(9, 9);
  check('seed 12345: a desert portal half buried at [6000, ~, 6000] (portal_3, y 65)', d?.kind === 'desert' && d.template === 'portal_3' && d.y === 65);
  const n = new m.NetherGenerator(SEED).ruinedPortals.stub(0, 0);
  check('seed 12345: a nether portal at [16, ~, 0] in the Nether (portal_6, y 78)', n?.kind === 'nether' && n.template === 'portal_6' && n.y === 78);
}

// ---------------------------------------------------------------------------------------------------------------
// /locate

{
  const chat = [];
  const game = (x, z, dim = m.OVERWORLD) => ({ meta: { allowCommands: true }, chat: (t) => chat.push(t), world: { dim }, player: { x, z }, level: { seed: SEED } });
  m.executeCommand(game(0, 0), 'locate structure minecraft:ruined_portal');
  m.executeCommand(game(0, 0), 'locate structure ruined_portal_desert');
  m.executeCommand(game(0, 0), 'locate structure ruined_portal_jungle');
  m.executeCommand(game(0, 0, m.DIMENSIONS.the_nether), 'locate structure ruined_portal_nether');
  m.executeCommand(game(0, 0), 'locate structure ruined_portal_nether');
  m.executeCommand(game(0, 0, m.DIMENSIONS.the_nether), 'locate structure ruined_portal');
  check('/locate ruined_portal: the start chunk\'s corner, [16, ~, 0]', chat[0]?.includes('[16, ~, 0]'), chat[0]);
  check('/locate ruined_portal_desert: [6000, ~, 6000]', chat[1]?.includes('[6000, ~, 6000]'), chat[1]);
  check('/locate ruined_portal_jungle: [848, ~, -3056]', chat[2]?.includes('[848, ~, -3056]'), chat[2]);
  check('/locate ruined_portal_nether in the Nether: [16, ~, 0]', chat[3]?.includes('[16, ~, 0]'), chat[3]);
  check('/locate ruined_portal_nether in the Overworld, and ruined_portal in the Nether, find none', /Could not find/.test(chat[4] ?? '') && /Could not find/.test(chat[5] ?? ''), chat[4] + ' / ' + chat[5]);
}

// ---------------------------------------------------------------------------------------------------------------
// What it costs chunk generation

{
  const fresh = new m.ChunkGenerator(SEED);
  const bare = new m.ChunkGenerator(SEED);
  bare.ruinedPortals.place = () => {};
  const t0 = performance.now();
  for (let rx = 10; rx < 20; rx++) fresh.ruinedPortals.stub(rx, 3);
  const spot = (performance.now() - t0) / 10;
  const time = (g, cx0, cz0) => {
    const t = performance.now();
    for (let cx = cx0; cx < cx0 + 3; cx++) for (let cz = cz0; cz < cz0 + 3; cz++) g.generate(cx, cz);
    return (performance.now() - t) / 9;
  };
  // (warm both up on the same chunks first, then time them on the portal's: region 0, 0's, over chunks 0..2, -1..1)
  time(fresh, 10, 10);
  time(bare, 10, 10);
  const withP = time(fresh, 0, -1), without = time(bare, 0, -1);
  console.log(`     (working out a region's portal: ${spot.toFixed(1)} ms; its chunks: ${withP.toFixed(1)} ms each, ${without.toFixed(1)} without it)`);
  check('cost: working out where a region\'s portal goes takes under 20 ms', spot < 20);
  check('cost: a portal\'s chunks take no more than 25% longer', withP < without * 1.25 + 2);
  const t1 = performance.now();
  let k = 0;
  for (let cx = -200; cx < 200; cx += 3) for (let cz = -200; cz < 200; cz += 3) (fresh.ruinedPortals.startsNear(cx, cz), k++);
  const per = (performance.now() - t1) / k;
  console.log(`     (looking for portals round a chunk: ${(per * 1000).toFixed(0)} µs)`);
  check('cost: looking for portals round a chunk takes well under a millisecond', per < 0.5);
}

await exitWithStatus(close);

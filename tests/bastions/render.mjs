// A look at the bastions without the world round them: each kind assembled from its own start (as the world
// generator does, from a start chunk's large-feature random) and placed into a bare voxel map, then drawn from above
// (the highest block, darker the lower it is), from the south and from the east (the nearest block, darker the
// further it is), the same two cut open (the nearest six blocks taken away), and as the pieces' boxes seen from above. The mobs are dots: piglins pink, brutes red, hoglins
// brown. PNGs go to the directory given (default: the system's temporary directory).
//
//   node tests/bastions/render.mjs [outDir] [kind] [seeds]     e.g. node tests/bastions/render.mjs /tmp/b units 3

import os from 'node:os';
import path from 'node:path';
import { loadModules } from '../../scripts/load.mjs';
import { writePNG } from '../../scripts/png.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const outDir = process.argv[2] || os.tmpdir();
const only = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3] : null;
const nSeeds = Number(process.argv[4] || 1);

const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/world/block.ts', '/src/world/gen/jigsaw.ts', '/src/world/gen/bastionTemplates.ts', '/src/world/gen/bastionPieces.ts']);
const m = Object.assign({}, ...mods);
const name = (st) => m.blockOf(st).name;

const COLORS = {
  polished_blackstone_bricks: [70, 62, 74], cracked_polished_blackstone_bricks: [56, 50, 60], polished_blackstone: [86, 78, 92],
  chiseled_polished_blackstone: [104, 96, 112], blackstone: [44, 38, 48], gilded_blackstone: [150, 116, 40], gold_block: [250, 208, 60],
  basalt: [104, 104, 112], polished_basalt: [124, 124, 132], magma_block: [170, 70, 20], lava: [255, 120, 0], chain: [60, 70, 90],
  chest: [190, 120, 30], spawner: [40, 90, 160], soul_lantern: [80, 200, 220], lantern: [250, 200, 120], netherrack: [110, 40, 40],
  soul_sand: [90, 70, 55], soul_soil: [80, 62, 50], nether_wart_block: [130, 20, 20], crimson_nylium: [150, 30, 30], nether_bricks: [60, 30, 36],
  crying_obsidian: [60, 20, 110], obsidian: [20, 16, 30], iron_bars: [150, 150, 150], ancient_debris: [100, 70, 60], lodestone: [150, 150, 160],
};
function colorOf(st) {
  let n = name(st);
  if (COLORS[n]) return COLORS[n];
  const base = n.replace(/_(stairs|slab|wall|button|pressure_plate)$/, '');
  const alias = { polished_blackstone_brick: 'polished_blackstone_bricks', blackstone: 'blackstone', polished_blackstone: 'polished_blackstone' };
  const c = COLORS[alias[base] ?? base];
  if (c) return n.endsWith('_wall') ? c.map((v) => Math.min(255, v + 30)) : n.endsWith('_slab') ? c.map((v) => Math.min(255, v + 15)) : c;
  return [255, 0, 255];
}
const MOB = { piglin: [255, 150, 170], piglin_brute: [230, 20, 20], hoglin: [150, 90, 40] };

/** assemble one kind from a start chunk, as bastion.ts does (start at y 33) */
function assemble(start, seed, cx, cz) {
  const pool = new m.Pool('render', 'empty', [[start, 1]]);
  const r = m.largeFeatureRandom(m.worldSeed64(seed), cx, cz);
  const s = m.jigsawStart(pool, r, cx, cz, null);
  s.piece.move(33 - (s.piece.box.minY + s.piece.groundLevelDelta));
  s.y = 33;
  return m.jigsawAssemble(s, r, 6, 80, false, () => 33);
}

/** place every piece into a map of blocks (a chunk as big as the whole structure) */
function placeAll(pieces) {
  const blocks = new Map();
  const box = new m.Box(Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity);
  for (const p of pieces) {
    box.minX = Math.min(box.minX, p.box.minX); box.minY = Math.min(box.minY, p.box.minY); box.minZ = Math.min(box.minZ, p.box.minZ);
    box.maxX = Math.max(box.maxX, p.box.maxX); box.maxY = Math.max(box.maxY, p.box.maxY); box.maxZ = Math.max(box.maxZ, p.box.maxZ);
  }
  const key = (x, y, z) => `${x},${y},${z}`;
  const ctx = {
    x0: box.minX, z0: box.minZ, cx: 0, cz: 0, blockEntities: [], entities: [],
    set: (x, y, z, st) => { if (st) blocks.set(key(x, y, z), st); else blocks.delete(key(x, y, z)); },
    getOrAir: (x, y, z) => blocks.get(key(x, y, z)) ?? 0,
    get: (x, y, z) => blocks.get(key(x, y, z)) ?? 0,
    scheduleFluid() {}, markForPostprocessing() {},
  };
  const pc = { ctx, chunk: new m.Box(box.minX, -64, box.minZ, box.maxX, 319, box.maxZ), salt: 1234, baseY: pieces[0].box.minY };
  for (const p of pieces) p.element.place(pc, p);
  return { blocks, box, ctx };
}

function render(kind, pieces, file) {
  const { blocks, box, ctx } = placeAll(pieces);
  const S = 4;
  const W = box.maxX - box.minX + 1, D = box.maxZ - box.minZ + 1, H = box.maxY - box.minY + 1;
  const pad = 8;
  // four panels: top, south, east, boxes; laid out 2 x 2
  const pw = Math.max(W, D) * S + pad, ph = Math.max(D, H) * S + pad;
  const img = new Uint8Array(pw * 2 * ph * 3 * 4).fill(255);
  const IW = pw * 2;
  const px = (ox, oy, x, y, c) => {
    for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
      const o = ((oy + y * S + j) * IW + ox + x * S + i) * 4;
      img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; img[o + 3] = 255;
    }
  };
  const shade = (c, f) => c.map((v) => Math.round(v * f));
  const at = (x, y, z) => blocks.get(`${x},${y},${z}`) ?? 0;
  // top view
  for (let x = box.minX; x <= box.maxX; x++)
    for (let z = box.minZ; z <= box.maxZ; z++)
      for (let y = box.maxY; y >= box.minY; y--) {
        const st = at(x, y, z);
        if (!st) continue;
        px(0, 0, x - box.minX, z - box.minZ, shade(colorOf(st), 0.45 + 0.55 * (y - box.minY) / Math.max(1, H - 1)));
        break;
      }
  // from the south (looking north: x to the right, y up)
  for (let x = box.minX; x <= box.maxX; x++)
    for (let y = box.minY; y <= box.maxY; y++)
      for (let z = box.maxZ; z >= box.minZ; z--) {
        const st = at(x, y, z);
        if (!st) continue;
        px(pw, 0, x - box.minX, box.maxY - y, shade(colorOf(st), 1 - 0.6 * (box.maxZ - z) / Math.max(1, D - 1)));
        break;
      }
  // from the east (looking west: z to the left... drawn with north on the left)
  for (let z = box.minZ; z <= box.maxZ; z++)
    for (let y = box.minY; y <= box.maxY; y++)
      for (let x = box.maxX; x >= box.minX; x--) {
        const st = at(x, y, z);
        if (!st) continue;
        px(0, ph, z - box.minZ, box.maxY - y, shade(colorOf(st), 1 - 0.6 * (box.maxX - x) / Math.max(1, W - 1)));
        break;
      }
  // cut open: from the south with the nearest 6 blocks taken away, and from the east the same
  const cut = 6;
  for (let x = box.minX; x <= box.maxX; x++)
    for (let y = box.minY; y <= box.maxY; y++)
      for (let z = box.maxZ - cut; z >= box.minZ; z--) {
        const st = at(x, y, z);
        if (!st) continue;
        px(0, 2 * ph, x - box.minX, box.maxY - y, shade(colorOf(st), 1 - 0.6 * (box.maxZ - cut - z) / Math.max(1, D - 1)));
        break;
      }
  for (let z = box.minZ; z <= box.maxZ; z++)
    for (let y = box.minY; y <= box.maxY; y++)
      for (let x = box.maxX - cut; x >= box.minX; x--) {
        const st = at(x, y, z);
        if (!st) continue;
        px(pw, 2 * ph, z - box.minZ, box.maxY - y, shade(colorOf(st), 1 - 0.6 * (box.maxX - cut - x) / Math.max(1, W - 1)));
        break;
      }
  // the pieces' boxes from above, the deeper the redder; mobs as dots
  const depthColor = [[0, 0, 0], [0, 0, 255], [0, 150, 0], [200, 120, 0], [200, 0, 200], [255, 0, 0], [0, 180, 180]];
  pieces.forEach((p, i) => {
    const c = depthColor[Math.min(6, p.depth ?? 0)] ?? [0, 0, 0];
    for (let x = p.box.minX; x <= p.box.maxX; x++)
      for (let z = p.box.minZ; z <= p.box.maxZ; z++) {
        const edge = x === p.box.minX || x === p.box.maxX || z === p.box.minZ || z === p.box.maxZ;
        if (edge) px(pw, ph, x - box.minX, z - box.minZ, c);
      }
    void i;
  });
  for (const e of ctx.entities) {
    const c = MOB[e.id] ?? [0, 0, 0];
    px(0, 0, Math.floor(e.x) - box.minX, Math.floor(e.z) - box.minZ, c);
    px(pw, ph, Math.floor(e.x) - box.minX, Math.floor(e.z) - box.minZ, c);
  }
  writePNG(file, IW, ph * 3, img);
  const count = (f) => [...blocks.values()].filter((st) => f(name(st))).length;
  const mobs = {};
  for (const e of ctx.entities) mobs[e.id] = (mobs[e.id] ?? 0) + 1;
  const chests = ctx.blockEntities.filter((b) => b.data.lootTable).map((b) => b.data.lootTable.split('/').pop());
  const tally = {};
  for (const c of chests) tally[c] = (tally[c] ?? 0) + 1;
  console.log(`${kind}: ${pieces.length} pieces, ${W} x ${H} x ${D} (x ${box.minX}..${box.maxX}, y ${box.minY}..${box.maxY}, z ${box.minZ}..${box.maxZ}); ` +
    `${blocks.size} blocks, gold ${count((n) => n === 'gold_block')}, chests ${JSON.stringify(tally)}, spawners ${ctx.blockEntities.filter((b) => b.id === 'spawner').length}, mobs ${JSON.stringify(mobs)} -> ${file}`);
}

const starts = m.POOLS.get('bastion/starts').templates;
const seen = new Set();
for (const st of starts) {
  const kind = m.variantOf(st);
  if (seen.has(kind) || (only && kind !== only)) continue;
  seen.add(kind);
  for (let s = 0; s < nSeeds; s++) {
    const pieces = assemble(st, 12345 + s * 7919, 3 + s, 5 - s);
    // (the depth each piece was put at, from the order the assembler works in: parents before children)
    render(kind, pieces, path.join(outDir, `bastion-${kind}-${s}.png`));
    const names = {};
    for (const p of pieces) {
      const id = p.element.template?.id ?? 'feature';
      names[id] = (names[id] ?? 0) + 1;
    }
    console.log('   ' + Object.entries(names).map(([k, v]) => `${k.replace('bastion/', '')}${v > 1 ? ' x' + v : ''}`).join(', '));
  }
}
await close();
process.exit(0);

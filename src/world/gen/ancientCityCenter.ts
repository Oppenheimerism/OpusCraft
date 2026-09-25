// The heart of an ancient city (vanilla templates ancient_city/city_center/city_center_1..3 and the pool
// ancient_city/city_center/walls): the centre, a plaza round a raised platform where the great frame stands, its
// opening lined with reinforced deepslate; and round it the city's eight quarters, the sides and corners of a grid
// three by three, with the city's tall outer wall along their outer edges, streets that run on from quarter to
// quarter, and raised plots where the city's buildings, ruins and walls go (ancient_city/structures and
// ancient_city/walls) and where sculk grows (ancient_city/sculk). The gate in the bottom quarter's wall leads out to
// the tunnel (ancient_city/city/entrance). Written in code from vanilla's as they're known; no game files are used.

import type { Rand } from '../../core/rng';
import { CityBuilder, type CityTemplate } from './ancientCityTemplates';
import {
  TILES, BRICKS, POLISHED, COBBLED, CHISELED, REINFORCED, TILE_WALL, BRICK_WALL, GRAY_CARPET,
  stair, slab, templateRandom, streetBlock, wallBlock, hangingLantern, candles, skull, smoothNoise, pick, type Side,
} from './ancientCityDesign';

/** the centre's size, and every quarter's height */
export const CENTER = 44, CITY_HEIGHT = 30;
/** the name of the start connector (vanilla JigsawStructure.start_jigsaw_name) */
const ANCHOR = 'minecraft:city_anchor';
const QUARTERS = 'ancient_city/city_center/walls';

/** the cave's ceiling over the city, the same line across all its pieces (their places in the unturned city) */
const CEILING = smoothNoise('ancient_city/ceiling', 11);
function ceiling(b: CityBuilder, ox: number, oz: number, low: number, high: number): void {
  for (let z = 0; z < b.sz; z++)
    for (let x = 0; x < b.sx; x++) {
      const top = Math.min(b.sy - 1, low + Math.round((high - low) * CEILING(x + ox + 1000, z + oz + 1000)));
      b.fill(x, 1, z, x, top, z, 'air');
    }
}

/** a lamp post: a basalt pillar with a capital and a soul lantern hanging from each of its four arms */
function lampPost(b: CityBuilder, x: number, y: number, z: number, h = 5): void {
  b.fill(x, y, z, x, y + h - 1, z, 'basalt[axis=y]');
  b.set(x, y + h, z, CHISELED);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    b.set(x + dx, y + h, z + dz, slab('deepslate_tile', true));
    b.set(x + dx, y + h - 1, z + dz, 'soul_lantern[hanging=true]');
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The centre

/**
 * The great frame: its opening (17 across and 13 high, the top stepped in), lined with reinforced deepslate all
 * round and set in a body of tiles, bricks and polished deepslate that thickens toward its back and front, with two
 * horns rising from its top corners. `cx` is its middle, `base` the platform's top, z0..z0+4 its depth.
 */
function frame(b: CityBuilder, cx: number, base: number, z0: number, ruined: Rand | null): void {
  const halfOpen = (dy: number) => (dy < 0 || dy > 12 ? -1 : dy <= 10 ? 8 : dy === 11 ? 7 : 5);
  const inOpening = (dx: number, dy: number) => Math.abs(dx) <= halfOpen(dy);
  const dist = (dx: number, dy: number) => {
    let d = 99;
    for (let oy = 0; oy <= 12; oy++) {
      const w = halfOpen(oy);
      const ex = Math.max(0, Math.abs(dx) - w);
      d = Math.min(d, Math.max(ex, Math.abs(dy - oy)));
    }
    return d;
  };
  const horn = (dx: number, dy: number) => {
    const t = dy - 14;
    if (t < 0 || t > 6) return false;
    return Math.abs(Math.abs(dx) - (10.5 + t * 0.6)) <= 1.1;
  };
  for (let dy = 0; dy <= 21; dy++)
    for (let dx = -15; dx <= 15; dx++) {
      if (inOpening(dx, dy - 1)) continue;
      const d = dist(dx, dy - 1);
      const y = base + dy;
      for (let k = 0; k < 5; k++) {
        const z = z0 + k, face = k === 0 || k === 4;
        let st: string | null = null;
        if (d === 1) st = REINFORCED;
        else if (d === 2) st = TILES;
        else if (d === 3) st = face ? POLISHED : BRICKS;
        else if (d === 4 && !face) st = POLISHED;
        else if (horn(dx, dy - 1) && !face) st = dy - 1 >= 19 ? TILES : BRICKS;
        if (!st) continue;
        // (the capitals of its sides)
        if (d === 3 && !face && (dy - 1 === 5 || dy - 1 === 12) && Math.abs(dx) >= 10) st = CHISELED;
        // (the ruined centre: its body has fallen in places, never its lining)
        if (ruined && st !== REINFORCED && (dy >= 13 && dx > 3 ? ruined.nextFloat() < 0.8 : ruined.nextFloat() < 0.08)) st = 'air';
        b.set(cx + dx, y - 1, z, st);
      }
    }
}

/** vanilla ancient_city/city_center/city_center_1..3: the plaza, the platform and the frame */
function cityCenter(v: 1 | 2 | 3): CityTemplate {
  const id = `ancient_city/city_center/city_center_${v}`;
  const r = templateRandom(id);
  const W = CENTER, cx = 22, cz = 22;
  const b = new CityBuilder(W, CITY_HEIGHT, W);
  ceiling(b, 0, 0, CITY_HEIGHT - 3, CITY_HEIGHT - 1);
  // the plaza: an edge of polished deepslate, a band of bricks round the platform, the axes to the four gates
  for (let z = 0; z < W; z++)
    for (let x = 0; x < W; x++) {
      const ring = Math.max(Math.abs(x - 21.5), Math.abs(z - 21.5));
      let st: string;
      if (ring > 20) st = POLISHED;
      else if (ring > 18.9 && ring < 19.6) st = BRICKS;
      else if (Math.abs(x - cx) <= 3 || Math.abs(z - cz) <= 3) st = Math.abs(x - cx) === 3 || Math.abs(z - cz) === 3 ? POLISHED : TILES;
      else st = streetBlock(r);
      b.set(x, 0, z, st);
    }
  // the platform, three high, with a flight of steps at its front and back
  const px0 = 4, px1 = 40, pz0 = 14, pz1 = 30;
  b.fill(px0, 1, pz0, px1, 3, pz1, BRICKS);
  for (let z = pz0; z <= pz1; z++)
    for (let x = px0; x <= px1; x++) {
      const edge = x === px0 || x === px1 || z === pz0 || z === pz1;
      b.set(x, 3, z, edge ? POLISHED : pick(r, [[TILES, 8], [BRICKS, 2], [CHISELED, (x + z) % 6 === 0 ? 1 : 0]]));
      if (edge && (x - px0) % 6 === 0) b.set(x, 2, z, CHISELED);
    }
  for (let x = cx - 5; x <= cx + 5; x++) {
    b.fill(x, 1, pz0 - 1, x, 2, pz0 - 1, BRICKS).set(x, 3, pz0 - 1, stair('deepslate_tile', 'south'));
    b.set(x, 1, pz0 - 2, BRICKS).set(x, 2, pz0 - 2, stair('deepslate_tile', 'south'));
    b.set(x, 1, pz0 - 3, stair('deepslate_tile', 'south'));
    b.fill(x, 1, pz1 + 1, x, 2, pz1 + 1, BRICKS).set(x, 3, pz1 + 1, stair('deepslate_tile', 'north'));
    b.set(x, 1, pz1 + 2, BRICKS).set(x, 2, pz1 + 2, stair('deepslate_tile', 'north'));
    b.set(x, 1, pz1 + 3, stair('deepslate_tile', 'north'));
  }
  // its railing, open over the steps
  for (let z = pz0; z <= pz1; z++)
    for (let x = px0; x <= px1; x++) {
      const edge = x === px0 || x === px1 || z === pz0 || z === pz1;
      if (!edge || ((z === pz0 || z === pz1) && Math.abs(x - cx) <= 5)) continue;
      if (v === 3 && r.nextFloat() < 0.35) continue;
      b.set(x, 4, z, (x - px0) % 6 === 0 && (z === pz0 || z === pz1) ? 'basalt[axis=y]' : BRICK_WALL);
    }
  frame(b, cx, 4, cz - 2, v === 3 ? r : null);
  // a lantern either side under the opening's top
  hangingLantern(b, cx - 4, 16, cz, 3);
  hangingLantern(b, cx + 4, 16, cz, 3);
  // what lies about the platform: two chests at the frame's feet, candles gone out, skulls
  b.chest(px0 + 3, 4, pz0 + 2, 'east', 'chests/ancient_city');
  b.chest(px1 - 3, 4, pz1 - 2, 'west', 'chests/ancient_city');
  for (let i = 0; i < 10; i++) {
    const x = px0 + 1 + r.nextInt(px1 - px0 - 1), z = pz0 + 1 + r.nextInt(pz1 - pz0 - 1);
    if (b.get(x, 4, z) !== 0 || Math.abs(x - cx) <= 13) continue;
    if (r.nextInt(3) === 0) skull(b, r, x, 4, z);
    else candles(b, r, x, 4, z);
  }
  // the plaza's four lamp posts
  for (const [x, z] of [[8, 8], [35, 8], [8, 35], [35, 35]]) {
    if (v === 3 && x === 35 && z === 8) {
      b.fill(x, 1, z, x, 2, z, 'basalt[axis=y]').set(x + 1, 1, z, 'basalt[axis=x]').set(x + 2, 1, z, COBBLED);
      continue;
    }
    lampPost(b, x, 1, z);
  }
  if (v === 2) {
    // soul fire in two basins on the platform's flanks, and carpets laid in the plaza's corners
    for (const x of [px0 + 2, px1 - 2]) {
      b.fill(x - 1, 3, cz - 1, x + 1, 3, cz + 1, 'soul_soil');
      b.fill(x - 1, 4, cz - 1, x + 1, 4, cz + 1, 'soul_fire');
      for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) b.set(x + dx, 4, cz + dz, TILE_WALL);
    }
    for (const [x0, z0] of [[3, 3], [37, 3], [3, 37], [37, 37]]) b.fill(x0, 1, z0, x0 + 3, 1, z0 + 3, GRAY_CARPET);
  }
  if (v === 3) {
    // rubble fallen from the frame
    for (let i = 0; i < 40; i++) {
      const x = 2 + r.nextInt(W - 4), z = 2 + r.nextInt(W - 4);
      const y = b.get(x, 4, z) === 0 && x >= px0 && x <= px1 && z >= pz0 && z <= pz1 ? 4 : 1;
      if (b.get(x, y, z) !== 0) continue;
      b.set(x, y, z, pick(r, [[COBBLED, 3], [slab('cobbled_deepslate'), 3], [slab('deepslate_tile'), 2], [stair('cobbled_deepslate', (['north', 'south', 'east', 'west'] as Side[])[r.nextInt(4)]), 1]]));
    }
  }
  // where sculk grows: about the plaza, and on the platform
  for (const [x, y, z] of [[6, 0, 6], [37, 0, 6], [6, 0, 37], [37, 0, 37], [14, 0, 4], [29, 0, 39], [4, 0, 29], [39, 0, 14], [12, 3, 17], [32, 3, 27]])
    b.jigsaw(x, y, z, { facing: 'up', target: 'minecraft:bottom', pool: 'ancient_city/sculk', final: y === 0 ? TILES : BRICKS });
  // the connectors: the anchor the city is placed by, and the four quarters
  b.jigsaw(cx, 24, cz, { facing: 'up', name: ANCHOR });
  b.jigsaw(0, 1, cz, { facing: 'west', target: 'minecraft:city_center/left', pool: QUARTERS });
  b.jigsaw(W - 1, 1, cz, { facing: 'east', target: 'minecraft:city_center/right', pool: QUARTERS });
  b.jigsaw(cx, 1, 0, { facing: 'north', target: 'minecraft:city_center/top', pool: QUARTERS });
  b.jigsaw(cx, 1, W - 1, { facing: 'south', target: 'minecraft:city_center/bottom', pool: QUARTERS });
  return b.build(id);
}

// ---------------------------------------------------------------------------------------------------------------
// The quarters

interface QuarterSpec {
  /** vanilla template name under ancient_city/city_center/walls */
  name: string;
  /** which quarter it is: the name its connector toward the centre carries */
  kind: string;
  sx: number;
  sz: number;
  /** where it lies in the unturned city (the centre's corner at 0, 0) */
  ox: number;
  oz: number;
  /** the sides along the city's edge (its outer wall) */
  outer: Side[];
  /** the side and place of its connector toward the piece it grows from */
  from: [Side, number];
  /** the connectors of the pieces that grow from it: side, place, the name they want, the pool */
  to: [Side, number, string, string][];
  /** the streets: the x bands of those running north to south, the z bands of those running east to west */
  ns: [number, number][];
  ew: [number, number][];
  /** a gate in its outer wall (x or z band) */
  gate?: [Side, number, number];
}

const SIDES = 3;

/** a connector's position on a side of a box sx by sz, `at` along it, at height y */
function onSide(side: Side, at: number, sx: number, sz: number): [number, number] {
  return side === 'west' ? [0, at] : side === 'east' ? [sx - 1, at] : side === 'north' ? [at, 0] : [at, sz - 1];
}

/** the ranges of [lo, hi] not covered by the bands */
function gaps(lo: number, hi: number, bands: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let a = lo;
  for (const [b0, b1] of bands.slice().sort((p, q) => p[0] - q[0])) {
    if (b0 > a) out.push([a, Math.min(hi, b0 - 1)]);
    a = Math.max(a, b1 + 1);
  }
  if (a <= hi) out.push([a, hi]);
  return out;
}

/** vanilla ancient_city/city_center/walls/*: one of the eight quarters round the centre */
function quarter(q: QuarterSpec): CityTemplate {
  const id = `ancient_city/city_center/walls/${q.name}`;
  const r = templateRandom(id);
  const b = new CityBuilder(q.sx, CITY_HEIGHT, q.sz);
  ceiling(b, q.ox, q.oz, 19, 27);
  const out = new Set(q.outer);
  const x0 = out.has('west') ? SIDES : 0, x1 = q.sx - 1 - (out.has('east') ? SIDES : 0);
  const z0 = out.has('north') ? SIDES : 0, z1 = q.sz - 1 - (out.has('south') ? SIDES : 0);
  const inNs = (x: number) => q.ns.some(([a, c]) => x >= a && x <= c);
  const inEw = (z: number) => q.ew.some(([a, c]) => z >= a && z <= c);
  // the streets' floor everywhere, a curb of polished deepslate along each street
  for (let z = 0; z < q.sz; z++)
    for (let x = 0; x < q.sx; x++) {
      const curb = q.ns.some(([a, c]) => (x === a || x === c) && !inEw(z)) || q.ew.some(([a, c]) => (z === a || z === c) && !inNs(x));
      b.set(x, 0, z, curb ? POLISHED : streetBlock(r));
    }
  // the plots between the streets: raised two, railed, with steps down to the streets, and a place for a building
  const plots: [number, number, number, number][] = [];
  for (const [ax, bx] of gaps(x0, x1, q.ns))
    for (const [az, bz] of gaps(z0, z1, q.ew)) if (bx - ax >= 6 && bz - az >= 6) plots.push([ax + 1, az + 1, bx - 1, bz - 1]);
  let wallSlots = 0;
  for (const [ax, az, bx, bz] of plots) {
    b.fill(ax, 1, az, bx, 1, bz, BRICKS);
    for (let z = az; z <= bz; z++)
      for (let x = ax; x <= bx; x++) {
        const edge = x === ax || x === bx || z === az || z === bz;
        b.set(x, 2, z, edge ? POLISHED : pick(r, [[TILES, 6], [COBBLED, 2], [BRICKS, 2]]));
        if (edge && r.nextFloat() < 0.7) b.set(x, 3, z, (x === ax || x === bx) && (z === az || z === bz) ? 'basalt[axis=y]' : BRICK_WALL);
      }
    // steps in the middle of each side
    const mx = (ax + bx) >> 1, mz = (az + bz) >> 1;
    for (const [sx, sz, face] of [[mx, az, 'south'], [mx, bz, 'north'], [ax, mz, 'east'], [bx, mz, 'west']] as [number, number, Side][]) {
      for (const d of [-1, 0, 1]) {
        const x = face === 'south' || face === 'north' ? sx + d : sx, z = face === 'east' || face === 'west' ? sz + d : sz;
        b.set(x, 3, z, 'air').set(x, 2, z, stair('deepslate_brick', face));
      }
    }
    // a building (or a wall), one to a small plot, two to a long one
    const long = bx - ax >= bz - az;
    const len = long ? bx - ax : bz - az;
    const spots: [number, number][] = len >= 20
      ? long ? [[ax + Math.round(len / 4), mz], [bx - Math.round(len / 4), mz]] : [[mx, az + Math.round(len / 4)], [mx, bz - Math.round(len / 4)]]
      : [[mx, mz]];
    for (const [x, z] of spots) {
      const wall = wallSlots < 2 && r.nextFloat() < 0.2;
      if (wall) wallSlots++;
      b.jigsaw(x, 2, z, { facing: 'up', target: 'minecraft:bottom', pool: wall ? (r.nextBool() ? 'ancient_city/walls' : 'ancient_city/walls/no_corners') : 'ancient_city/structures', final: TILES });
    }
    // candles and skulls left on the plot
    for (let i = 0; i < 3; i++) {
      const x = ax + 1 + r.nextInt(bx - ax - 1), z = az + 1 + r.nextInt(bz - az - 1);
      if (b.get(x, 3, z) !== 0) continue;
      if (r.nextInt(4) === 0) skull(b, r, x, 3, z);
      else candles(b, r, x, 3, z);
    }
  }
  // the city's outer wall: three thick and fourteen high, buttressed inside, crenellated on top
  for (const side of q.outer) {
    const alongX = side === 'north' || side === 'south';
    const n = alongX ? q.sx : q.sz;
    for (let t = 0; t < n; t++)
      for (let k = 0; k < SIDES; k++) {
        const [x, z] = side === 'west' ? [k, t] : side === 'east' ? [q.sx - 1 - k, t] : side === 'north' ? [t, k] : [t, q.sz - 1 - k];
        for (let y = 0; y <= 13; y++) b.set(x, y, z, y === 5 || y === 10 ? TILES : wallBlock(r));
        b.set(x, 14, z, POLISHED);
        if (k === 0) b.set(x, 15, z, t % 2 === 0 ? TILE_WALL : 'air');
      }
    // buttresses every eight, a lantern hanging from each
    for (let t = 4; t < n - 3; t += 8) {
      const [x, z] = side === 'west' ? [SIDES, t] : side === 'east' ? [q.sx - 1 - SIDES, t] : side === 'north' ? [t, SIDES] : [t, q.sz - 1 - SIDES];
      if (inNs(x) || inEw(z)) continue;
      for (let y = 1; y <= 11; y++) b.set(x, y, z, y === 11 ? CHISELED : BRICKS);
      const [lx, lz] = side === 'west' ? [x + 1, z] : side === 'east' ? [x - 1, z] : side === 'north' ? [x, z + 1] : [x, z - 1];
      b.set(lx, 11, lz, slab('deepslate_tile', true));
      hangingLantern(b, lx, 10, lz, 1);
    }
  }
  // the gate in the outer wall, an arch seven wide and nine high
  if (q.gate) {
    const [side, a, c] = q.gate;
    for (let t = a; t <= c; t++)
      for (let k = 0; k < SIDES; k++) {
        const [x, z] = side === 'south' ? [t, q.sz - 1 - k] : side === 'north' ? [t, k] : side === 'west' ? [k, t] : [q.sx - 1 - k, t];
        const m = Math.abs(t - (a + c) / 2);
        const top = m >= 3 ? 7 : m >= 2 ? 8 : 9;
        b.fill(x, 1, z, x, top, z, 'air');
        b.set(x, top + 1, z, m < 1 ? CHISELED : POLISHED);
      }
  }
  // lamp posts along the streets, sculk growing here and there on them
  const lamps: [number, number][] = [], sculk: [number, number][] = [];
  for (const [a, c] of q.ns)
    for (let z = z0 + 5; z <= z1 - 3; z += 10) {
      if (inEw(z)) continue;
      lamps.push([a + 1, z]);
      sculk.push([c - 1, z + 5]);
    }
  for (const [a, c] of q.ew)
    for (let x = x0 + 5; x <= x1 - 3; x += 10) {
      if (inNs(x)) continue;
      lamps.push([x, c - 1]);
      sculk.push([x + 5, a + 1]);
    }
  for (const [x, z] of lamps) if (b.get(x, 1, z) === 0) lampPost(b, x, 1, z, 4 + r.nextInt(2));
  for (const [x, z] of sculk)
    if (x > 0 && z > 0 && x < q.sx - 1 && z < q.sz - 1 && b.get(x, 1, z) === 0 && b.name(x, 0, z) !== '')
      b.jigsaw(x, 0, z, { facing: 'up', target: 'minecraft:bottom', pool: 'ancient_city/sculk', final: TILES });
  // the connectors
  const [fs, fa] = q.from;
  const [fx, fz] = onSide(fs, fa, q.sx, q.sz);
  b.jigsaw(fx, 1, fz, { facing: fs, name: `minecraft:city_center/${q.kind}` });
  for (const [side, at, target, pool] of q.to) {
    const [x, z] = onSide(side, at, q.sx, q.sz);
    b.jigsaw(x, 1, z, { facing: side, target, pool });
  }
  return b.build(id);
}

/** the eight quarters and their places round the centre (vanilla's ten templates: two bottoms, two bottom right corners) */
function quarters(): CityTemplate[] {
  const SIDE_W = 56, ROW_D = 32;
  const corner = (name: string, kind: string, ox: number, oz: number, outer: Side[], from: Side, at: number, ns: number, ew: number): QuarterSpec => ({
    name, kind, sx: SIDE_W, sz: ROW_D, ox, oz, outer, from: [from, at], to: [], ns: [[ns - 2, ns + 2]], ew: [[ew - 2, ew + 2]],
  });
  const specs: QuarterSpec[] = [
    {
      name: 'left', kind: 'left', sx: SIDE_W, sz: CENTER, ox: -SIDE_W, oz: 0, outer: ['west'], from: ['east', 22],
      to: [['north', 28, 'minecraft:city_center/top_left_corner', QUARTERS], ['south', 28, 'minecraft:city_center/bottom_left_corner', QUARTERS]],
      ns: [[26, 30]], ew: [[19, 25]],
    },
    {
      name: 'right', kind: 'right', sx: SIDE_W, sz: CENTER, ox: CENTER, oz: 0, outer: ['east'], from: ['west', 22],
      to: [['north', 27, 'minecraft:city_center/top_right_corner', QUARTERS], ['south', 27, 'minecraft:city_center/bottom_right_corner', QUARTERS]],
      ns: [[25, 29]], ew: [[19, 25]],
    },
    { name: 'top', kind: 'top', sx: CENTER, sz: ROW_D, ox: 0, oz: -ROW_D, outer: ['north'], from: ['south', 22], to: [], ns: [[19, 25]], ew: [[14, 18]] },
    {
      name: 'bottom_1', kind: 'bottom', sx: CENTER, sz: ROW_D, ox: 0, oz: CENTER, outer: ['south'], from: ['north', 22],
      to: [['south', 22, 'minecraft:entrance_connector', 'ancient_city/city/entrance']], ns: [[19, 25]], ew: [[13, 17]], gate: ['south', 19, 25],
    },
    {
      name: 'bottom_2', kind: 'bottom', sx: CENTER, sz: ROW_D, ox: 0, oz: CENTER, outer: ['south'], from: ['north', 22],
      to: [['south', 22, 'minecraft:entrance_connector', 'ancient_city/city/entrance']], ns: [[19, 25], [7, 9], [35, 37]], ew: [[13, 17]], gate: ['south', 19, 25],
    },
    corner('top_left_corner', 'top_left_corner', -SIDE_W, -ROW_D, ['north', 'west'], 'south', 28, 28, 16),
    corner('top_right_corner', 'top_right_corner', CENTER, -ROW_D, ['north', 'east'], 'south', 27, 27, 16),
    corner('bottom_left_corner', 'bottom_left_corner', -SIDE_W, CENTER, ['south', 'west'], 'north', 28, 28, 15),
    corner('bottom_right_corner_1', 'bottom_right_corner', CENTER, CENTER, ['south', 'east'], 'north', 27, 27, 15),
    { ...corner('bottom_right_corner_2', 'bottom_right_corner', CENTER, CENTER, ['south', 'east'], 'north', 27, 27, 15), ns: [[25, 29], [44, 46]] },
  ];
  return specs.map(quarter);
}

export function centerTemplates(): CityTemplate[] {
  return [cityCenter(1), cityCenter(2), cityCenter(3)];
}

export function quarterTemplates(): CityTemplate[] {
  return quarters();
}


// Nether terrain: netherrack and its ores, soul sand and soul soil, basalt,
// blackstone, the two nyliums and wart blocks, ancient debris, and the
// nether portal's swirl.

import { TexImage, img, setPx, getPx, cloneImg, mulC, anim, AnimTex } from '../tex';
import { N, rng, wrap, idx, fbm, quantize, paint, modeFilter, cluster } from './core';
import { speckled, stones, ore } from './terrain';

// ---------------------------------------------------------------------------
// Netherrack

export const NETHERRACK_PAL = [0x3a1010, 0x4d1717, 0x5e1f1f, 0x6b2727, 0x7a2f2f, 0x8a3939, 0x9d4646];

/** fleshy red rock: horizontally drawn-out ridges, dark pits and bright rims */
export function netherrack(seed = 'netherrack'): TexImage {
  return speckled(seed, NETHERRACK_PAL, {
    oct: [[4, 2, 0.45], [2, 2, 0.35]], white: 0.38, weights: [0.25, 1.1, 2.6, 4, 2.6, 1.1, 0.25], mode: 1,
    dark: 12, darkSize: [2, 4], darkTone: 1, light: 9, lightSize: [1, 3], lightTone: 5, hbias: 1.5, rim: 0.55,
  });
}

export function netherQuartzOre(base: TexImage): TexImage {
  // flat white shards, drawn out diagonally
  return ore(base, 'nether_quartz_ore', { dark: 0xa99c91, mid: 0xd8cfc5, light: 0xebe5dd, hi: 0xfdfbf8 }, { count: 7, shapes: [1, 2, 5, 7], minSep: 1 });
}

/** gold nuggets: a scatter of one to three pixel specks */
export function netherGoldOre(base: TexImage): TexImage {
  const t = cloneImg(base);
  const r = rng('nether_gold_ore', 5);
  const G = { dark: 0xa4700e, mid: 0xe7b227, light: 0xfbd547, hi: 0xfff29a };
  const taken = new Set<number>();
  let placed = 0;
  for (let guard = 0; placed < 13 && guard < 600; guard++) {
    const x = r.nextInt(N), y = r.nextInt(N);
    const n = 1 + r.nextInt(3);
    const pts = cluster(r, x, y, n, [0, 0], true).filter(([px, py]) => px < 15 && py < 15);
    if (!pts.length || pts.some(([px, py]) => [0, 1, -1].some((dx) => [0, 1, -1].some((dy) => taken.has(idx(px + dx, py + dy)))))) continue;
    placed++;
    const sums = pts.map(([px, py]) => px + py);
    const mn = Math.min(...sums), mx = Math.max(...sums);
    pts.forEach(([px, py], j) => {
      const c = pts.length === 1 ? (r.chance(0.5) ? G.light : G.mid) : sums[j] === mn ? G.hi : sums[j] === mx ? G.dark : G.mid;
      setPx(t, px, py, c);
      taken.add(idx(px, py));
    });
    // a warm shadow below right
    for (const [px, py] of pts) if (!taken.has(idx(px + 1, py + 1)) && r.chance(0.6)) setPx(t, px + 1, py + 1, mulC(getPx(t, px + 1, py + 1), 0.8));
  }
  return t;
}

// ---------------------------------------------------------------------------
// Soul sand and soul soil

const SOUL_SAND_PAL = [0x281a13, 0x38271d, 0x473428, 0x564133, 0x654e3e, 0x76604d, 0x8a735f];

/** one trapped soul: a lighter head with two sunken eyes over a gaping mouth ('.' leaves the sand) */
const SOUL_FACES: string[][] = [
  ['.555.', '50505', '41414', '44444', '.400.', '..11.'],
  ['.55.', '5005', '4114', '4444', '.00.', '.11.'],
  ['.555.', '50405', '41414', '.4004', '..11.'],
];

/** soul sand: grainy brown with the faces of trapped souls, two dark eyes over a gaping mouth */
export function soulSand(): TexImage {
  const r = rng('soul_sand', 2);
  const H = fbm(r, [[4, 4, 0.3], [2, 2, 0.35]], 0.55);
  let tones = quantize(H, [0.2, 0.8, 2.4, 4, 2.8, 1, 0.2]);
  tones = modeFilter(tones, r, 1);
  // faces on a loose grid so they don't pile up
  const spots: [number, number][] = [[0, 0], [8, 2], [2, 9], [10, 10]];
  for (const [sx, sy] of spots) {
    const face = SOUL_FACES[r.nextInt(SOUL_FACES.length)];
    const x0 = sx + r.nextInt(3), y0 = sy + r.nextInt(2);
    face.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const ch = row[dx];
        if (ch === '.') continue;
        const k = +ch;
        // the head's shading varies a little; the sockets stay dark
        tones[idx(x0 + dx, y0 + dy)] = k >= 4 && r.chance(0.2) ? k - 1 : k;
      }
    });
  }
  return paint(tones, SOUL_SAND_PAL);
}

const SOUL_SOIL_PAL = [0x251a14, 0x2f2219, 0x3a2a20, 0x443227, 0x4f3b2e, 0x5b4536, 0x6a5141];

/** soul soil: darker packed earth with pits and a few faint sockets */
export function soulSoil(): TexImage {
  const t = speckled('soul_soil', SOUL_SOIL_PAL, {
    oct: [[4, 4, 0.35], [2, 2, 0.4]], white: 0.5, weights: [0.3, 1.2, 2.8, 4, 2.4, 0.9, 0.2], mode: 1,
    dark: 14, darkSize: [1, 3], darkTone: 0, light: 7, lightSize: [1, 2], lightTone: 5, rim: 0.4,
  });
  return t;
}

// ---------------------------------------------------------------------------
// Basalt

const BASALT_PAL = [0x2a2a2e, 0x35353a, 0x414146, 0x4c4c51, 0x58585d, 0x646469, 0x737378];

/** basalt side: tall columns, split by dark vertical cracks */
export function basaltSide(): TexImage {
  const r = rng('basalt_side', 1);
  const H = fbm(r, [[2, 16, 0.5], [1, 8, 0.25], [4, 4, 0.15]], 0.18);
  const tones = quantize(H, [0.3, 1.2, 2.8, 4, 2.8, 1.2, 0.4]);
  // cracks between the columns, each broken in one or two places
  for (const x of [0, 4 + r.nextInt(2), 9 + r.nextInt(2), 13]) {
    let y = r.nextInt(N);
    const len = 8 + r.nextInt(8);
    for (let i = 0; i < len; i++, y++) {
      tones[idx(x, y)] = r.chance(0.8) ? 0 : 1;
      if (r.chance(0.5)) tones[idx(x + 1, y)] = Math.max(tones[idx(x + 1, y)], 4);
    }
  }
  return paint(tones, BASALT_PAL);
}

/** basalt top: the column's cut end, rough rings round a darker core */
export function basaltTop(): TexImage {
  const r = rng('basalt_top', 1);
  const nz = fbm(r, [[4, 4, 0.6], [2, 2, 0.4]], 0.4);
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const d = Math.max(Math.abs(dx), Math.abs(dy)) * 0.7 + Math.hypot(dx, dy) * 0.3 + (nz[y * N + x] - 0.5) * 1.6;
      const ring = Math.floor(d / 1.9);
      let k = ring % 2 === 0 ? 3 : 4;
      if (ring === 0) k = 2;
      if (x === 0 || y === 0) k = 5;
      if (x === 15 || y === 15) k = 1;
      const w = nz[y * N + x];
      if (w > 0.8) k++;
      if (w < 0.2) k--;
      setPx(t, x, y, BASALT_PAL[Math.max(0, Math.min(6, k))]);
    }
  return t;
}

// ---------------------------------------------------------------------------
// Blackstone

const BLACKSTONE_PAL = [0x141115, 0x1b171c, 0x221d23, 0x2a242b, 0x332c34, 0x3d353f, 0x4a414c];

export function blackstone(): TexImage {
  return speckled('blackstone', BLACKSTONE_PAL, {
    oct: [[4, 4, 0.4], [2, 2, 0.35]], white: 0.4, weights: [0.2, 1, 2.8, 4, 2.4, 1, 0.3], mode: 1,
    dark: 9, darkSize: [2, 4], darkTone: 0, light: 10, lightSize: [1, 3], lightTone: 5, rim: 0.5,
  });
}

/** blackstone top: the same stone with round lighter pockets */
export function blackstoneTop(): TexImage {
  const t = blackstone();
  const r = rng('blackstone_top', 3);
  for (let k = 0; k < 6; k++) {
    const cx = r.nextInt(N), cy = r.nextInt(N);
    const pts = cluster(r, cx, cy, 3 + r.nextInt(4));
    const sums = pts.map(([x, y]) => x + y);
    const mn = Math.min(...sums);
    pts.forEach(([x, y], j) => setPx(t, x, y, BLACKSTONE_PAL[sums[j] === mn ? 6 : 5]));
    for (const [x, y] of pts) if (!pts.some(([a, b]) => a === wrap(x + 1) && b === wrap(y + 1))) setPx(t, x + 1, y + 1, BLACKSTONE_PAL[1]);
  }
  return t;
}

// ---------------------------------------------------------------------------
// Nylium and wart blocks

const CRIMSON_PAL = [0x4d0a0a, 0x661010, 0x7d1616, 0x8e1d1d, 0xa02525, 0xb33131, 0xc84646];
const WARPED_PAL = [0x0f3f37, 0x155046, 0x1b6154, 0x227062, 0x2b8070, 0x369180, 0x48a795];

function nyliumTop(seed: string, pal: number[]): TexImage {
  return speckled(seed, pal, {
    oct: [[2, 2, 0.45]], white: 0.65, weights: [0.3, 1.3, 2.8, 4, 2.6, 1.1, 0.35], mode: 0,
    dark: 10, darkSize: [1, 2], darkTone: 0, light: 12, lightSize: [1, 2], lightTone: 6,
  });
}

export const crimsonNyliumTop = (): TexImage => nyliumTop('crimson_nylium', CRIMSON_PAL);
export const warpedNyliumTop = (): TexImage => nyliumTop('warped_nylium', WARPED_PAL);

/** nylium side: netherrack with the fungal mat hanging over the top edge */
export function nyliumSide(base: TexImage, top: TexImage, seed: string, pal: number[]): TexImage {
  const t = cloneImg(base);
  const r = rng(seed + '_side', 4);
  let depth = 3 + r.nextInt(2);
  for (let x = 0; x < N; x++) {
    depth = Math.max(2, Math.min(5, depth + r.nextInt(3) - 1));
    let d = depth;
    // the odd strand reaching further down
    if (r.chance(0.2)) d += 1 + r.nextInt(2);
    for (let y = 0; y < d; y++) setPx(t, x, y, y === d - 1 ? pal[1] : getPx(top, x, (y + 5) & 15));
    // the rock under the mat is in its shade
    setPx(t, x, d, mulC(getPx(t, x, d), 0.78));
  }
  return t;
}

export const CRIMSON_NYLIUM_PAL = CRIMSON_PAL;
export const WARPED_NYLIUM_PAL = WARPED_PAL;

const WART_PAL = [0x3a0000, 0x4d0101, 0x5f0202, 0x700404, 0x820707, 0x960d0d, 0xab1919];
const WARPED_WART_PAL = [0x03353a, 0x05474e, 0x085961, 0x0c6a73, 0x137c86, 0x1d8f99, 0x2ba5ae];

/** wart blocks: a lumpy fungal mass, blobs split by thin dark folds */
function wart(seed: string, pal: number[]): TexImage {
  return stones(seed, pal, { sites: 17, minDist: 2.7, mortar: [pal[0], pal[1]], mortarW: 0.45, shadeTones: [2, 3, 3, 4, 4], rim: 0.55, noiseAmt: 1.3 });
}

export const netherWartBlock = (): TexImage => wart('nether_wart_block', WART_PAL);
export const warpedWartBlock = (): TexImage => wart('warped_wart_block', WARPED_WART_PAL);

// ---------------------------------------------------------------------------
// Ancient debris

const DEBRIS_PAL = [0x36221e, 0x442b25, 0x53352d, 0x613f36, 0x70493f, 0x80554a, 0x936457];

/** ancient debris side: swirled bands, as if the rock had been stirred */
export function ancientDebrisSide(): TexImage {
  const r = rng('ancient_debris_side', 2);
  const nz = fbm(r, [[8, 8, 0.6], [4, 4, 0.4]], 0.25);
  const t = img();
  const centres: [number, number][] = [[4, 4], [12, 11], [3, 13]];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let best = Infinity;
      for (const [cx, cy] of centres) {
        let dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy);
        dx = Math.min(dx, N - dx);
        dy = Math.min(dy, N - dy);
        best = Math.min(best, Math.hypot(dx * 1.2, dy));
      }
      const v = best + (nz[y * N + x] - 0.5) * 3;
      const band = ((Math.floor(v / 1.6) % 3) + 3) % 3;
      let k = [2, 4, 3][band];
      if (v < 1.4) k = 5;
      const w = nz[y * N + x];
      if (w > 0.78) k++;
      if (w < 0.22) k--;
      setPx(t, x, y, DEBRIS_PAL[Math.max(0, Math.min(6, k))]);
    }
  return t;
}

/** ancient debris top: tight rings round a lighter heart */
export function ancientDebrisTop(): TexImage {
  const r = rng('ancient_debris_top', 2);
  const nz = fbm(r, [[4, 4, 0.6], [2, 2, 0.4]], 0.3);
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) + (nz[y * N + x] - 0.5) * 1.8;
      const ring = Math.floor(d / 1.5);
      let k = ring === 0 ? 6 : ring === 1 ? 5 : ring % 2 === 0 ? 2 : 4;
      if (x === 0 || y === 0) k = Math.max(k, 3);
      if (x === 15 || y === 15) k = 1;
      setPx(t, x, y, DEBRIS_PAL[Math.max(0, Math.min(6, k))]);
    }
  return t;
}

// ---------------------------------------------------------------------------
// Nether portal

/**
 * The swirling portal, 32 frames: two counter-rotating spirals round the tile's
 * centre and corner, the brightness of the sum mapped from deep violet to pale
 * lilac (and made more opaque where it's bright).
 */
export function netherPortal(): AnimTex {
  const r = rng('nether_portal', 1);
  const grain: Float32Array[] = [];
  for (let i = 0; i < 32; i++) {
    const g = new Float32Array(N * N);
    for (let k = 0; k < g.length; k++) g[k] = r.next() * 0.1;
    grain.push(g);
  }
  return anim(N, N, 32, 1, (i) => {
    const t = img();
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let f = 0;
        for (let l = 0; l < 2; l++) {
          const o = l * 8;
          let u = ((x - o) / 16) * 2, v = ((y - o) / 16) * 2;
          if (u < -1) u += 2;
          if (u >= 1) u -= 2;
          if (v < -1) v += 2;
          if (v >= 1) v -= 2;
          const d2 = u * u + v * v;
          let a = Math.atan2(v, u) + ((i / 32) * Math.PI * 2 - d2 * 10 + l * 2) * (l * 2 - 1);
          a = (Math.sin(a) + 1) / 2;
          a /= d2 + 1;
          f += a * 0.5;
        }
        f = Math.min(1, f + grain[i][y * N + x]);
        const red = Math.min(255, f * f * 200 + 55);
        const green = Math.min(255, f * f * f * f * 255);
        const blue = Math.min(255, f * 100 + 155);
        const alpha = Math.min(255, f * 100 + 155);
        setPx(t, x, y, (Math.round(red) << 16) | (Math.round(green) << 8) | Math.round(blue), Math.round(alpha));
      }
    return t;
  });
}


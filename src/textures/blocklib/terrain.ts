// Natural terrain materials: stone family, dirt family, grass, sand, gravel,
// ores, deepslate...

import { TexImage, img, setPx, getPx, cloneImg, mixC, mulC } from '../tex';
import { N, rng, wrap, idx, noise, white, mix, fbm, equalize, blur, slope, quantize, paint, modeFilter, cluster } from './core';

// ---------------------------------------------------------------------------
// Generic generators

/**
 * Bumpy "rock" material: height field -> tone, plus emboss (top-left light).
 * palette dark->light (7 entries recommended).
 */
export function rockTex(seed: string, pal: number[], o: {
  weights?: number[];
  octaves?: [number, number, number][];
  white?: number;
  emboss?: number;
  mode?: number;
  light?: [number, number];
} = {}): TexImage {
  const r = rng(seed);
  const H = fbm(r, o.octaves ?? [[8, 4, 0.5], [4, 4, 0.35], [2, 2, 0.2]], o.white ?? 0.12);
  const S = slope(blur(H, 1), ...(o.light ?? [-1, -1]));
  const E = equalize(S);
  const base = equalize(H);
  const em = o.emboss ?? 0.35;
  const f = new Float32Array(N * N);
  for (let i = 0; i < f.length; i++) f[i] = base[i] + (E[i] - 0.5) * em * 2;
  let tones = quantize(f, o.weights ?? [0.3, 1.2, 3, 5, 3, 1.2, 0.3]);
  if (o.mode) tones = modeFilter(tones, r, o.mode);
  return paint(tones, pal);
}

export interface SpeckleOpts {
  oct?: [number, number, number][];
  white?: number;
  weights?: number[];
  mode?: number;
  dark?: number;
  darkSize?: [number, number];
  light?: number;
  lightSize?: [number, number];
  darkTone?: number;
  lightTone?: number;
  coreP?: number;
  hbias?: number;
  /** probability of a lit pixel directly above each dark-cluster pixel (embossed look) */
  rim?: number;
}

/** Speckled material: fine clustered noise + stamped dark/light clusters (7-colour palette). */
export function speckled(seed: string, pal: number[], o: SpeckleOpts = {}): TexImage {
  const r = rng(seed);
  const H = fbm(r, o.oct ?? [[4, 4, 0.35], [2, 2, 0.4]], o.white ?? 0.45);
  let tones = quantize(H, o.weights ?? [0, 0.6, 2.4, 5, 2.4, 0.6, 0]);
  if (o.mode) tones = modeFilter(tones, r, o.mode);
  const hb = o.hbias ?? 0;
  const [dmin, dmax] = o.darkSize ?? [2, 4];
  const dt = o.darkTone ?? 1;
  const darkPts: [number, number][] = [];
  for (let k = 0; k < (o.dark ?? 10); k++) {
    const n = dmin + r.nextInt(dmax - dmin + 1);
    const pts = cluster(r, r.nextInt(N), r.nextInt(N), n, [hb, 0]);
    pts.forEach(([x, y], j) => (tones[idx(x, y)] = j === 0 && n >= 3 && r.chance(o.coreP ?? 0.6) ? Math.max(0, dt - 1) : dt));
    darkPts.push(...pts);
  }
  if (o.rim) for (const [x, y] of darkPts) if (tones[idx(x, y - 1)] > dt + 1 && r.chance(o.rim)) tones[idx(x, y - 1)] = Math.min(pal.length - 1, 4);
  const [lmin, lmax] = o.lightSize ?? [1, 3];
  const lt = o.lightTone ?? 5;
  for (let k = 0; k < (o.light ?? 8); k++) {
    const n = lmin + r.nextInt(lmax - lmin + 1);
    const pts = cluster(r, r.nextInt(N), r.nextInt(N), n, [hb, 0]);
    pts.forEach(([x, y], j) => (tones[idx(x, y)] = j === 0 && n >= 2 && r.chance(0.4) ? Math.min(pal.length - 1, lt + 1) : lt));
  }
  return paint(tones, pal);
}

export interface StonesOpts {
  sites?: number;
  minDist?: number;
  mortar?: number[]; // [dark, mid]
  mortarW?: number;
  shadeTones?: number[]; // possible base tone indices per stone
  emboss?: number;
  noiseAmt?: number;
  stretch?: [number, number];
  rim?: number;
}

/** Rounded stones separated by mortar lines (cobblestone, gravel, cobbled deepslate). */
export function stones(seed: string, pal: number[], o: StonesOpts = {}): TexImage {
  const r = rng(seed);
  const K = pal.length;
  const [sx, sy] = o.stretch ?? [1, 1];
  const pts: [number, number][] = [];
  const md = o.minDist ?? 3.4;
  let guard = 0;
  while (pts.length < (o.sites ?? 10) && guard++ < 5000) {
    const p: [number, number] = [r.next() * N, r.next() * N];
    let ok = true;
    for (const q of pts) {
      let dx = Math.abs(p[0] - q[0]), dy = Math.abs(p[1] - q[1]);
      dx = Math.min(dx, N - dx);
      dy = Math.min(dy, N - dy);
      if (Math.hypot(dx / sx, dy / sy) < md) ok = false;
    }
    if (ok) pts.push(p);
  }
  const tonesFor = o.shadeTones ?? [2, 3, 3, 4, 4, 5];
  const baseTone = pts.map(() => tonesFor[r.nextInt(tonesFor.length)]);
  const nz = fbm(r, [[4, 4, 0.5], [2, 2, 0.5]], 0.6);
  const t = img();
  const mortar = o.mortar ?? [pal[0], pal[1]];
  const mw = o.mortarW ?? 0.9;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let b1 = Infinity, b2 = Infinity, bi = 0, bdx = 0, bdy = 0;
      for (let i = 0; i < pts.length; i++) {
        let dx = x + 0.5 - pts[i][0], dy = y + 0.5 - pts[i][1];
        if (dx > N / 2) dx -= N;
        if (dx < -N / 2) dx += N;
        if (dy > N / 2) dy -= N;
        if (dy < -N / 2) dy += N;
        const d = Math.hypot(dx / sx, dy / sy);
        if (d < b1) {
          b2 = b1;
          b1 = d;
          bi = i;
          bdx = dx;
          bdy = dy;
        } else if (d < b2) b2 = d;
      }
      const i = y * N + x;
      const edge = b2 - b1 + (nz[i] - 0.5) * 0.5;
      if (edge < mw) {
        setPx(t, x, y, nz[i] > 0.55 ? mortar[1] : mortar[0]);
        continue;
      }
      let k = baseTone[bi];
      const lightDir = -(bdx + bdy) / Math.max(1.5, b1 + edge);
      const em = o.emboss ?? 1;
      if (lightDir * em > 0.45) k++;
      if (lightDir * em > 1.0) k++;
      if (lightDir * em < -0.55) k--;
      if (edge < mw + (o.rim ?? 0.8)) k--;
      const nn = (nz[i] - 0.5) * (o.noiseAmt ?? 1.6);
      if (nn > 0.45) k++;
      if (nn < -0.45) k--;
      setPx(t, x, y, pal[Math.max(1, Math.min(K - 1, k))]);
    }
  return t;
}

/** Smooth material with a bevelled 1px border (polished stones, smooth stone). */
export function bevelled(seed: string, pal: number[], o: { hi?: number; lo?: number; inner?: boolean; soft?: number } = {}): TexImage {
  const t = speckled(seed, pal, { oct: [[8, 8, 0.5], [4, 4, 0.3]], white: o.soft ?? 0.3, weights: [0, 0.3, 2, 6, 2, 0.3, 0], dark: 3, darkSize: [1, 2], light: 3, lightSize: [1, 2], darkTone: 2, lightTone: 4 });
  const hi = o.hi ?? pal[5], lo = o.lo ?? pal[1];
  for (let i = 0; i < N; i++) {
    setPx(t, i, 0, hi);
    setPx(t, 0, i, hi);
    setPx(t, i, 15, lo);
    setPx(t, 15, i, lo);
  }
  setPx(t, 15, 0, pal[3]);
  setPx(t, 0, 15, pal[3]);
  return t;
}

// ---------------------------------------------------------------------------
// Stone family

export const STONE_PAL = [0x5f5f5f, 0x686868, 0x737373, 0x7e7e7e, 0x888888, 0x939393, 0x9e9e9e];

export function stone(seed = 'stone'): TexImage {
  return speckled(seed, STONE_PAL, {
    oct: [[4, 2, 0.4], [2, 2, 0.4]], white: 0.3, weights: [0, 0.3, 2.5, 6, 2.5, 0.3, 0], mode: 1,
    dark: 8, light: 5, hbias: 2, darkSize: [2, 5], rim: 0.45,
  });
}

export const ANDESITE_PAL = [0x5d5d5e, 0x6b6b6c, 0x797a7a, 0x858586, 0x909192, 0x9d9e9e, 0xadaeae];
export function andesite(seed = 'andesite'): TexImage {
  return speckled(seed, ANDESITE_PAL, {
    oct: [[4, 4, 0.3], [2, 2, 0.4]], white: 0.6, weights: [0, 1.2, 2.5, 4, 2.5, 1.2, 0], mode: 0,
    dark: 10, darkSize: [1, 3], light: 9, lightSize: [1, 3],
  });
}

export const GRANITE_PAL = [0x6e4538, 0x805344, 0x8f5f4e, 0x9a6a58, 0xa67563, 0xb88472, 0xc99a88];
export function granite(seed = 'granite'): TexImage {
  return speckled(seed, GRANITE_PAL, {
    oct: [[4, 4, 0.3], [2, 2, 0.4]], white: 0.65, weights: [0, 1.4, 2.5, 3.6, 2.5, 1.3, 0], mode: 0,
    dark: 12, darkSize: [1, 3], light: 10, lightSize: [1, 3],
  });
}

export const DIORITE_PAL = [0x6f6f70, 0x8e8e8f, 0xa9a9aa, 0xbcbcbd, 0xcacacb, 0xd8d8d8, 0xe8e8e8];
export function diorite(seed = 'diorite'): TexImage {
  return speckled(seed, DIORITE_PAL, {
    oct: [[4, 4, 0.35], [2, 2, 0.4]], white: 0.5, weights: [0, 0.5, 1.5, 4, 3, 1.5, 0.3], mode: 1,
    dark: 12, darkSize: [1, 4], darkTone: 1, coreP: 0.7, light: 8, lightSize: [1, 3],
  });
}

// ---------------------------------------------------------------------------
// Deepslate family

export const DEEPSLATE_PAL = [0x333338, 0x3d3d43, 0x47474d, 0x505056, 0x5a5a60, 0x65656b, 0x727278];

export function deepslate(seed = 'deepslate'): TexImage {
  const r = rng(seed);
  const H = fbm(r, [[16, 4, 0.35], [8, 2, 0.35], [4, 1, 0.3]], 0.2);
  const tones = quantize(H, [0.2, 1.2, 3, 4.5, 3, 1.2, 0.3]);
  // horizontal streaks: darker seams with a lit row above
  for (let k = 0; k < 9; k++) {
    const x = r.nextInt(N), y = r.nextInt(N), len = 3 + r.nextInt(6);
    const light = r.chance(0.4);
    for (let i = 0; i < len; i++) {
      const yy = y + (i > 1 && r.chance(0.15) ? 1 : 0);
      if (light) tones[idx(x + i, yy)] = Math.max(tones[idx(x + i, yy)], 5);
      else {
        tones[idx(x + i, yy)] = r.chance(0.3) ? 0 : 1;
        if (tones[idx(x + i, yy - 1)] >= 3 && r.chance(0.5)) tones[idx(x + i, yy - 1)] = 4;
      }
    }
  }
  return paint(tones, DEEPSLATE_PAL);
}

export function deepslateTop(seed = 'deepslate_top'): TexImage {
  const r = rng(seed);
  // swirly: distance rings around a few centres warped by noise
  const nz = fbm(r, [[8, 8, 0.6], [4, 4, 0.4]]);
  const f = new Float32Array(N * N);
  const cs: [number, number][] = [[r.next() * 16, r.next() * 16], [r.next() * 16, r.next() * 16]];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let best = Infinity;
      for (const [cx, cy] of cs) {
        let dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy);
        dx = Math.min(dx, N - dx);
        dy = Math.min(dy, N - dy);
        best = Math.min(best, Math.hypot(dx, dy));
      }
      const v = best / 2.2 + nz[y * N + x] * 2.2;
      f[y * N + x] = Math.abs(Math.sin(v * Math.PI * 0.5));
    }
  const tones = quantize(mix([[f, 0.75], [white(r), 0.25]]), [0.3, 1.5, 3, 4, 3, 1.5, 0.3]);
  return paint(modeFilter(tones, r, 1), DEEPSLATE_PAL.map((c) => mulC(c, 0.96)));
}

export function cobbledDeepslate(seed = 'cobbled_deepslate'): TexImage {
  return stones(seed, [0x2c2c30, 0x3a3a3f, 0x47474c, 0x535358, 0x5f5f64, 0x6b6b70, 0x79797e], {
    sites: 13, minDist: 3.0, mortar: [0x2a2a2e, 0x333338], mortarW: 0.75, shadeTones: [3, 3, 4, 4, 5], rim: 0.5,
  });
}

export function polishedDeepslate(seed = 'polished_deepslate'): TexImage {
  return bevelled(seed, [0x303035, 0x3a3a3f, 0x434348, 0x4a4a50, 0x525258, 0x5c5c62, 0x68686e], { hi: 0x606066, lo: 0x2f2f34 });
}

/** Brick grid: rows of height rh, bricks width bw with half offset on odd rows. */
export function brickGrid(seed: string, pal: number[], mortar: number[], rh: number, bw: number, o: { offset?: number; hiRow?: boolean; tileShade?: boolean } = {}): TexImage {
  const r = rng(seed);
  const base = speckled(seed, pal, { oct: [[4, 4, 0.4], [2, 2, 0.4]], white: 0.45, weights: [0, 0.8, 2.5, 4, 2.5, 0.8, 0], dark: 5, darkSize: [1, 2], light: 4, lightSize: [1, 2] });
  const t = cloneImg(base);
  const off = o.offset ?? bw / 2;
  for (let y = 0; y < N; y++) {
    const row = Math.floor(y / rh);
    const ox = row % 2 ? off : 0;
    for (let x = 0; x < N; x++) {
      const ly = y % rh, lx = wrap(x + ox, bw);
      if (ly === rh - 1 || lx === bw - 1) setPx(t, x, y, mortar[r.chance(0.3) ? 1 : 0]);
      else if (o.hiRow !== false && (ly === 0 || lx === 0)) setPx(t, x, y, mixC(getPx(t, x, y), pal[6], 0.45));
      else if (ly === rh - 2 || lx === bw - 2) setPx(t, x, y, mixC(getPx(t, x, y), pal[0], 0.25));
    }
  }
  return t;
}

export function deepslateBricks(seed = 'deepslate_bricks'): TexImage {
  return brickGrid(seed, [0x333337, 0x3d3d42, 0x46464b, 0x505055, 0x59595e, 0x636368, 0x6e6e73], [0x232326, 0x2d2d31], 4, 8);
}

export function deepslateTiles(seed = 'deepslate_tiles'): TexImage {
  return brickGrid(seed, [0x28282c, 0x303035, 0x38383d, 0x404045, 0x48484d, 0x515156, 0x5b5b60], [0x19191c, 0x222226], 4, 4, { offset: 0 });
}

// ---------------------------------------------------------------------------
// Ores

export interface OreCols {
  dark: number;
  mid: number;
  light: number;
  hi?: number;
  extra?: number; // secondary colour (copper patina)
}

export const ORE_COLS: Record<string, OreCols> = {
  coal: { dark: 0x161616, mid: 0x2b2b2b, light: 0x3e3e3e, hi: 0x4e4e4e },
  iron: { dark: 0x9c6f55, mid: 0xc79c80, light: 0xd8af93, hi: 0xecd2bd },
  copper: { dark: 0x7d4228, mid: 0xb4653e, light: 0xd88a5c, hi: 0xefb088, extra: 0x5aa58c },
  gold: { dark: 0xab7e11, mid: 0xf2c833, light: 0xfbe56b, hi: 0xfffbc2 },
  redstone: { dark: 0x7a0000, mid: 0xc10b0b, light: 0xfc2d2d, hi: 0xff8c8c },
  lapis: { dark: 0x0f2c73, mid: 0x1d4cb3, light: 0x3f73d8, hi: 0x86a9f0 },
  diamond: { dark: 0x1c8b8e, mid: 0x3ecfcb, light: 0x7df1e5, hi: 0xd9fff9 },
  emerald: { dark: 0x0a6b2c, mid: 0x17a948, light: 0x3fda71, hi: 0xb1ffcb },
};

/** Compact ore-spot shapes ('#' = ore pixel). */
const ORE_SHAPES: string[][] = [
  ['##', '##'],
  ['.#', '##', '#.'],
  ['##.', '.##'],
  ['###', '.#.'],
  ['.##', '###', '.#.'],
  ['#.', '##', '.#'],
  ['.#.', '###', '#..'],
  ['.##', '##.'],
  ['#..', '###', '.##'],
  ['###', '##.'],
  ['.##.', '####', '.#..'],
  ['##.', '###', '.#.'],
  ['.#', '##', '##'],
];

/** Ore spots on a background: highlight top-left, dark bottom-right, soft shadow on the rock. */
export function ore(base: TexImage, seed: string, c: OreCols, o: { count?: number; shapes?: number[]; minSep?: number } = {}): TexImage {
  const t = cloneImg(base);
  const r = rng(seed, 7);
  const count = o.count ?? 5;
  const taken = new Set<number>();
  const placed: [number, number, number, number][] = [];
  let guard = 0;
  while (placed.length < count && guard++ < 800) {
    const shape = ORE_SHAPES[(o.shapes ?? ORE_SHAPES.map((_, i) => i))[r.nextInt((o.shapes ?? ORE_SHAPES).length)]];
    const sw = shape[0].length, sh = shape.length;
    const x0 = r.nextInt(N - sw + 1), y0 = r.nextInt(N - sh + 1);
    const sep = o.minSep ?? 1;
    if (placed.some(([px, py, pw, ph]) => x0 < px + pw + sep && px < x0 + sw + sep && y0 < py + ph + sep && py < y0 + sh + sep)) continue;
    placed.push([x0, y0, sw, sh]);
    const pts: [number, number][] = [];
    shape.forEach((row, yy) => [...row].forEach((ch, xx) => ch === '#' && pts.push([x0 + xx, y0 + yy])));
    const sum = pts.map(([x, y]) => x + y);
    const mn = Math.min(...sum), mx = Math.max(...sum);
    pts.forEach(([x, y], j) => {
      const s = sum[j];
      let col = c.mid;
      if (s === mn) col = c.hi ?? c.light;
      else if (s === mn + 1) col = r.chance(0.6) ? c.light : c.mid;
      else if (s === mx) col = c.dark;
      else if (s === mx - 1 && pts.length > 4 && r.chance(0.4)) col = c.dark;
      if (c.extra && s !== mn && r.chance(0.35)) col = c.extra;
      setPx(t, x, y, col);
      taken.add(y * N + x);
    });
    // soft shadow on the rock below/right
    for (const [x, y] of pts)
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx > 15 || ny > 15 || taken.has(ny * N + nx)) continue;
        if (r.chance(dx && dy ? 0.25 : 0.5)) setPx(t, nx, ny, mulC(getPx(t, nx, ny), 0.82));
      }
  }
  return t;
}

// ---------------------------------------------------------------------------
// Dirt family

export const DIRT_PAL = [0x593d29, 0x6c4b34, 0x79553a, 0x866043, 0x966c4a, 0xab7e55, 0xb9855c];

export function dirt(seed = 'dirt'): TexImage {
  return speckled(seed, DIRT_PAL, {
    oct: [[2, 2, 0.5]], white: 0.6, weights: [0, 1.5, 3, 4, 2.5, 0.8, 0], mode: 0,
    dark: 12, darkSize: [1, 3], light: 6, lightSize: [1, 2],
  });
}

export function coarseDirt(seed = 'coarse_dirt'): TexImage {
  const t = speckled(seed, DIRT_PAL.map((c) => mulC(c, 0.9)), {
    oct: [[2, 2, 0.5]], white: 0.6, weights: [0, 1.5, 3, 4, 2.5, 0.8, 0], dark: 12, darkSize: [1, 3], light: 6, lightSize: [1, 2],
  });
  const r = rng(seed, 3);
  // gravelly stones
  const cols = [[0x5b5550, 0x77706a, 0x958d86], [0x4f4944, 0x6a635d, 0x847c75]];
  for (let k = 0; k < 11; k++) {
    const [d, m, l] = cols[r.nextInt(2)];
    const n = 2 + r.nextInt(3);
    const pts = cluster(r, r.nextInt(N), r.nextInt(N), n);
    const sums = pts.map(([x, y]) => x + y);
    const mn = Math.min(...sums), mx = Math.max(...sums);
    pts.forEach(([x, y], j) => setPx(t, x, y, sums[j] === mn ? l : sums[j] === mx && n > 2 ? d : m));
  }
  return t;
}

export function rootedDirt(seed = 'rooted_dirt'): TexImage {
  const t = dirt(seed);
  const r = rng(seed, 5);
  for (let k = 0; k < 5; k++) {
    let x = r.nextInt(N), y = r.nextInt(N);
    const len = 4 + r.nextInt(5);
    for (let s = 0; s < len; s++) {
      setPx(t, x, y, s === 0 ? 0xc9a57c : s % 3 === 2 ? 0x9a7550 : 0xb48e66);
      if (r.chance(0.5)) x += r.nextBool() ? 1 : -1;
      else y++;
    }
  }
  return t;
}

// ---------------------------------------------------------------------------
// Grass (grayscale; biome-tinted at render time)

export const GRASS_PAL = [0x818181, 0x8e8e8e, 0x9a9a9a, 0xa6a6a6, 0xb1b1b1, 0xbdbdbd, 0xc9c9c9];

export function grassTop(seed = 'grass_top', o: { blades?: number; darks?: number; pal?: number[] } = {}): TexImage {
  const r = rng(seed);
  const H = fbm(r, [[4, 4, 0.3], [2, 2, 0.4]], 0.6);
  const tones = quantize(H, [0, 0, 1, 2.2, 1, 0, 0]);
  // light blades (2px diagonal/vertical strokes with lit tip)
  for (let k = 0; k < (o.blades ?? 34); k++) {
    const x = r.nextInt(N), y = r.nextInt(N);
    const dx = r.nextInt(3) - 1;
    tones[idx(x, y)] = r.chance(0.35) ? 6 : 5;
    tones[idx(x + dx, y + 1)] = Math.max(tones[idx(x + dx, y + 1)], 4);
  }
  // dark gaps between blades
  for (let k = 0; k < (o.darks ?? 26); k++) {
    const x = r.nextInt(N), y = r.nextInt(N);
    const i = idx(x, y);
    if (tones[i] >= 5) continue;
    tones[i] = r.chance(0.3) ? 0 : 1;
    if (r.chance(0.4)) {
      const j = idx(x + (r.nextBool() ? 1 : 0), y + 1);
      if (tones[j] < 5) tones[j] = 2;
    }
  }
  return paint(tones, o.pal ?? GRASS_PAL);
}

/** Rows covered by the side fringe per column (vanilla-like ragged edge). */
export const FRINGE = [4, 3, 3, 4, 5, 4, 3, 3, 4, 3, 4, 6, 4, 3, 3, 4];

/** Grass-side style fringe: copies `top` colours into the fringe; bottom pixel of each column shaded. */
export function fringe(top: TexImage, depths = FRINGE, shadeF = 0.86): TexImage {
  const t = img();
  for (let x = 0; x < N; x++)
    for (let y = 0; y < depths[x]; y++) {
      let c = getPx(top, x, (y + 5) % N);
      if (y === depths[x] - 1 && depths[x] > 3) c = mulC(c, shadeF);
      setPx(t, x, y, c);
    }
  return t;
}

export function grassSideOverlay(): TexImage {
  return fringe(grassTop('grass_side'));
}

// ---------------------------------------------------------------------------
// Loose materials

export const SAND_PAL = [0xc2b283, 0xcfc08f, 0xd7ca9a, 0xdbcfa3, 0xe1d6ac, 0xe8dfb8, 0xefe8c6];
export function sand(seed = 'sand', pal = SAND_PAL): TexImage {
  return speckled(seed, pal, {
    oct: [[2, 2, 0.5]], white: 0.7, weights: [0, 0.8, 2.5, 5, 2.5, 0.8, 0], mode: 0,
    dark: 9, darkSize: [1, 2], light: 7, lightSize: [1, 2], coreP: 0.4,
  });
}

export const RED_SAND_PAL = [0x9a4c16, 0xab561c, 0xb65f22, 0xbe6621, 0xc46e2c, 0xcd7b37, 0xd88a46];

export const GRAVEL_PAL = [0x565251, 0x6a6665, 0x7d7978, 0x8f8b8a, 0xa19d9c, 0xb3afae, 0xc5c1c0];
export function gravel(seed = 'gravel'): TexImage {
  const t = stones(seed, GRAVEL_PAL, { sites: 26, minDist: 2.3, mortar: [0x545050, 0x625e5d], mortarW: 0.45, shadeTones: [2, 3, 3, 4, 4, 5], rim: 0.4, noiseAmt: 1.4 });
  // some pebbles brownish / pinkish, some slightly cooler
  const r = rng(seed, 9);
  const n = noise(r, 4, 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const c = getPx(t, x, y);
      const v = n[y * N + x];
      if (v > 0.62) setPx(t, x, y, tintC(c, 0xfff0e6));
      else if (v < 0.3) setPx(t, x, y, tintC(c, 0xf4f4ff));
    }
  return t;
}

function tintC(c: number, t: number): number {
  const [r, g, b] = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const [tr, tg, tb] = [(t >> 16) & 255, (t >> 8) & 255, t & 255];
  return (Math.round((r * tr) / 255) << 16) | (Math.round((g * tg) / 255) << 8) | Math.round((b * tb) / 255);
}

export const CLAY_PAL = [0x8c93a0, 0x969daa, 0x9ea5b2, 0xa2a8b5, 0xa8aebb, 0xb0b6c2, 0xb9bfca];
export function clay(seed = 'clay'): TexImage {
  return speckled(seed, CLAY_PAL, {
    oct: [[4, 4, 0.5], [2, 2, 0.3]], white: 0.4, weights: [0, 0.6, 2, 6, 2, 0.6, 0], mode: 1,
    dark: 6, darkSize: [1, 2], light: 5, lightSize: [1, 2],
  });
}

export const SNOW_PAL = [0xd5e0e3, 0xdfe9eb, 0xe8f1f2, 0xf1f8f8, 0xf6fbfb, 0xfbfefe, 0xffffff];
export function snow(seed = 'snow', pal = SNOW_PAL): TexImage {
  return speckled(seed, pal, {
    oct: [[4, 4, 0.4], [2, 2, 0.4]], white: 0.5, weights: [0, 0.4, 1.5, 4, 4, 1.5, 0], mode: 1,
    dark: 7, darkSize: [1, 2], light: 0,
  });
}

export function bedrock(seed = 'bedrock'): TexImage {
  const pal = [0x121212, 0x2a2a2a, 0x404040, 0x575757, 0x6e6e6e, 0x878787, 0xa2a2a2];
  return speckled(seed, pal, {
    oct: [[4, 4, 0.4], [2, 2, 0.45]], white: 0.55, weights: [1, 1.6, 2, 2, 1.8, 1.1, 0.5], mode: 1,
    dark: 7, darkSize: [1, 3], darkTone: 1, light: 5, lightSize: [1, 2], lightTone: 5,
  });
}

export function obsidian(seed = 'obsidian'): TexImage {
  const pal = [0x040308, 0x0a0711, 0x0f0b19, 0x151022, 0x21182f, 0x322546, 0x4b3a69];
  const r = rng(seed);
  const H = fbm(r, [[8, 8, 0.4], [4, 4, 0.35], [2, 2, 0.25]], 0.25);
  const tones = quantize(H, [1.5, 3, 4, 3, 1.2, 0.6, 0.25]);
  // crystalline highlight streaks (diagonal)
  for (let k = 0; k < 7; k++) {
    const x = r.nextInt(N), y = r.nextInt(N), len = 2 + r.nextInt(3);
    const dx = r.nextBool() ? 1 : -1;
    for (let i = 0; i < len; i++) tones[idx(x + i * dx, y + i)] = i === 0 ? 6 : 5;
    tones[idx(x + dx, y)] = 4;
  }
  return paint(tones, pal);
}

/**
 * crying obsidian: obsidian weeping glowing purple, tears welling in a few spots and running down in streaks that
 * thin and dim as they go
 */
export function cryingObsidian(): TexImage {
  const t = obsidian('crying_obsidian');
  const r = rng('crying_obsidian_tears');
  const TEAR = [0x36105e, 0x521889, 0x6f22b4, 0x8f33dc, 0xb257f5, 0xd894ff];
  for (let k = 0; k < 7; k++) {
    const x = r.nextInt(N), y0 = r.nextInt(N), len = 2 + r.nextInt(5);
    // the well: a bright pool a pixel or two wide
    setPx(t, x, y0, TEAR[5]);
    if (r.chance(0.6)) setPx(t, wrap(x + (r.nextBool() ? 1 : -1)), y0, TEAR[4]);
    for (let i = 1; i <= len; i++) {
      const tone = Math.max(0, 4 - Math.floor((i * 4) / (len + 1)) - (r.chance(0.25) ? 1 : 0));
      setPx(t, x, wrap(y0 + i), TEAR[tone]);
    }
  }
  return t;
}

export function mud(seed = 'mud'): TexImage {
  return speckled(seed, [0x27221f, 0x2f2926, 0x36302c, 0x3c3633, 0x433c39, 0x4b4441, 0x554e4b], {
    oct: [[4, 4, 0.4], [2, 2, 0.4]], white: 0.45, weights: [0, 0.8, 2.5, 5, 2.5, 0.8, 0], mode: 1,
    dark: 8, darkSize: [2, 3], light: 6, lightSize: [1, 2],
  });
}


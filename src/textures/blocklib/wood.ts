// Wood: log bark, log tops (growth rings), planks, stripped logs.

import { TexImage, img, setPx, mixC, mulC } from '../tex';
import { N, rng, idx, wrap, noise, white, fbm, quantize, paint } from './core';

export interface WoodDef {
  /** bark ramp dark -> light (6) */
  bark: number[];
  /** plank / inner wood ramp dark -> light (6); [0] is the board gap colour */
  wood: number[];
  /** log-top ring colours: [light wood, mid ring, dark ring] */
  ring: number[];
  style?: 'ridged' | 'birch' | 'cherry' | 'jungle' | 'acacia' | 'mangrove' | 'spruce' | 'dark_oak';
  /** plank board seams x positions for the 4 boards */
  seams?: number[][];
}

/** Scale every colour of a palette (brightness tuning). */
const sc = (pal: number[], f: number): number[] => pal.map((c) => mulC(c, f));

export const WOOD: Record<string, WoodDef> = {
  oak: {
    bark: sc([0x3f311d, 0x4e3d25, 0x5f4b2d, 0x6d5634, 0x7c643d, 0x8c7248], 1.07),
    wood: sc([0x735a37, 0x8e7144, 0x9e7f4c, 0xab8a53, 0xb8945c, 0xc49f65], 1.05),
    ring: [0xb89560, 0xa3834f, 0x8f7142],
  },
  spruce: {
    bark: [0x21160b, 0x2b1d0f, 0x362513, 0x402d18, 0x4b351d, 0x584025],
    wood: sc([0x4a351e, 0x5d4428, 0x68492b, 0x73512f, 0x7e5a35, 0x88633b], 1.13),
    ring: [0x7a5a35, 0x6a4c2c, 0x5a4024],
    style: 'spruce',
  },
  birch: {
    bark: [0x2a2a26, 0x55554f, 0xa9a9a1, 0xc6c6be, 0xd8d8d0, 0xe8e8e2],
    wood: sc([0x9b8a5b, 0xb09e6c, 0xbcaa76, 0xc6b57f, 0xd0bf88, 0xd9c991], 1.03),
    ring: [0xd1c08a, 0xc0ae78, 0xab9a67],
    style: 'birch',
  },
  jungle: {
    bark: [0x33260e, 0x413113, 0x4f3d19, 0x5c4a1f, 0x6a5526, 0x78602e],
    wood: sc([0x71502f, 0x8a6240, 0x976b46, 0xa2744c, 0xad7d52, 0xb88659], 1.09),
    ring: [0xae7e53, 0x9b6c45, 0x86593a],
    style: 'jungle',
  },
  acacia: {
    bark: [0x3d3a33, 0x4d4940, 0x5c574d, 0x696459, 0x767065, 0x847e72],
    wood: sc([0x7c4222, 0x96502a, 0xa2582e, 0xad5f33, 0xb86737, 0xc2703d], 1.05),
    ring: [0xb3663b, 0xa05530, 0x8a4827],
    style: 'acacia',
  },
  dark_oak: {
    bark: sc([0x1c1409, 0x271c0e, 0x322412, 0x3c2c17, 0x47351c, 0x544022], 1.13),
    wood: [0x2c1c0c, 0x3a2612, 0x422b15, 0x4a3118, 0x52371b, 0x5c3e1f],
    ring: [0x5a3f22, 0x4b331b, 0x3d2914],
    style: 'dark_oak',
  },
  mangrove: {
    bark: sc([0x2f2119, 0x3d2b20, 0x4a3527, 0x56402e, 0x634a35, 0x70553d], 1.12),
    wood: sc([0x55221e, 0x6b2b27, 0x76302b, 0x7f3530, 0x893b35, 0x94423b], 1.04),
    ring: [0x8a3c36, 0x76302b, 0x622621],
    style: 'mangrove',
  },
  cherry: {
    bark: [0x1f1014, 0x2b161b, 0x361c22, 0x42232a, 0x4f2b33, 0x5d343d],
    wood: sc([0xc58a82, 0xd49e95, 0xdca79e, 0xe3b1a8, 0xe9bbb2, 0xefc6bd], 1.03),
    ring: [0xe6b7ae, 0xd7a198, 0xc58c84],
    style: 'cherry',
  },
};

// ---------------------------------------------------------------------------
// Bark

/** Periodic vertical wiggle path: x offset for each row (sums of sines, period 16). */
function wiggle(r: ReturnType<typeof rng>, amp: number): number[] {
  const p1 = r.next() * Math.PI * 2, p2 = r.next() * Math.PI * 2;
  const a1 = amp * (0.6 + r.next() * 0.6), a2 = amp * 0.5 * r.next();
  const out: number[] = [];
  for (let y = 0; y < N; y++) out.push(Math.round(a1 * Math.sin((y / N) * Math.PI * 2 + p1) + a2 * Math.sin((y / N) * Math.PI * 4 + p2)));
  return out;
}

/**
 * Ridged bark: vertical plates separated by dark crevices that wiggle and
 * break; plates lit on their left edge.
 */
export function barkRidged(seed: string, pal: number[], o: { crevices?: number; breakP?: number; amp?: number; plateNoise?: number; knots?: number; hlines?: number; partial?: number; weights?: number[] } = {}): TexImage {
  const r = rng(seed);
  // tone field: 0 crevice .. 5 highlight
  const base = fbm(r, [[2, 8, 0.45], [1, 4, 0.25], [4, 16, 0.3]], o.plateNoise ?? 0.25);
  const tones = quantize(base, o.weights ?? [0, 0.5, 2, 3, 2, 0.5]);
  const nC = o.crevices ?? 5;
  const crevX: number[] = [];
  for (let k = 0; k < nC; k++) crevX.push(Math.round((k * N) / nC + r.next() * 1.6));
  for (const cx of crevX) {
    const wig = wiggle(r, o.amp ?? 0.6);
    // partial crevices: only a segment of the column
    const partial = r.chance(o.partial ?? 0.35);
    const segStart = r.nextInt(N), segLen = partial ? 5 + r.nextInt(7) : N;
    // breaks: skip some row segments
    const gapStart = r.nextInt(N), gapLen = r.chance(o.breakP ?? 0.5) ? 1 + r.nextInt(2) : 0;
    for (let y = 0; y < N; y++) {
      if (wrap(y - segStart) >= segLen) continue;
      const inGap = gapLen > 0 && wrap(y - gapStart) < gapLen;
      const x = cx + wig[y];
      if (inGap) {
        tones[idx(x, y)] = Math.max(1, tones[idx(x, y)] - 1);
        continue;
      }
      tones[idx(x, y)] = r.chance(0.2) ? 1 : 0;
      // lit plate edge to the right of the crevice, shadow to the left
      const ri = idx(x + 1, y), li = idx(x - 1, y);
      if (tones[ri] >= 2 && r.chance(0.5)) tones[ri] = Math.min(5, tones[ri] + 1);
      if (tones[li] >= 2 && r.chance(0.35)) tones[li] = Math.max(1, tones[li] - 1);
    }
  }
  // short horizontal splits / knots
  for (let k = 0; k < (o.hlines ?? 0); k++) {
    const x = r.nextInt(N), y = r.nextInt(N), len = 2 + r.nextInt(2);
    for (let i = 0; i < len; i++) tones[idx(x + i, y)] = 0;
    for (let i = 0; i < len; i++) if (tones[idx(x + i, y - 1)] >= 2) tones[idx(x + i, y - 1)] = 4;
  }
  for (let k = 0; k < (o.knots ?? 0); k++) {
    const x = r.nextInt(N), y = r.nextInt(N);
    tones[idx(x, y)] = 0;
    tones[idx(x + 1, y)] = 1;
    tones[idx(x, y - 1)] = 4;
    tones[idx(x - 1, y)] = 3;
  }
  return paint(tones, pal);
}

export function barkBirch(seed: string, pal: number[]): TexImage {
  // pal: [black, darkgray, midgray, light, lighter, white]
  const r = rng(seed);
  const base = fbm(r, [[4, 16, 0.5], [2, 8, 0.3]], 0.25);
  const tones = quantize(base, [0, 0, 0.5, 2.5, 4, 2.5]);
  // vertical faint shading lines
  for (let k = 0; k < 3; k++) {
    const x = r.nextInt(N), y0 = r.nextInt(N), len = 3 + r.nextInt(6);
    for (let i = 0; i < len; i++) if (tones[idx(x, y0 + i)] > 2) tones[idx(x, y0 + i)] = 2 + (r.chance(0.5) ? 1 : 0);
  }
  // black horizontal marks (lenticels / scars)
  const marks = 7;
  const rows: number[] = [];
  for (let k = 0; k < marks; k++) {
    let y = r.nextInt(N);
    let tries = 0;
    while (rows.some((ry) => Math.min(Math.abs(ry - y), N - Math.abs(ry - y)) < 2) && tries++ < 20) y = r.nextInt(N);
    rows.push(y);
    const x = r.nextInt(N), len = 2 + r.nextInt(k < 2 ? 5 : 3);
    for (let i = 0; i < len; i++) {
      const edge = i === 0 || i === len - 1;
      tones[idx(x + i, y)] = edge && r.chance(0.6) ? 1 : 0;
      if (!edge && r.chance(0.35)) tones[idx(x + i, y + 1)] = 1;
      else if (tones[idx(x + i, y + 1)] > 2 && r.chance(0.5)) tones[idx(x + i, y + 1)] = 2;
    }
  }
  return paint(tones, pal);
}

export function barkCherry(seed: string, pal: number[]): TexImage {
  const r = rng(seed);
  const base = fbm(r, [[8, 2, 0.5], [4, 2, 0.3]], 0.3);
  const tones = quantize(base, [0.4, 1.5, 3, 3, 1.5, 0.4]);
  // horizontal lenticel bands (lighter streaks with dark below)
  for (let k = 0; k < 9; k++) {
    const x = r.nextInt(N), y = r.nextInt(N), len = 2 + r.nextInt(4);
    for (let i = 0; i < len; i++) {
      tones[idx(x + i, y)] = i === 0 || i === len - 1 ? 4 : 5;
      tones[idx(x + i, y + 1)] = r.chance(0.6) ? 0 : 1;
    }
  }
  return paint(tones, pal);
}

export function barkFor(name: string, w: WoodDef): TexImage {
  const seed = name + '_log';
  switch (w.style) {
    case 'birch':
      return barkBirch(seed, w.bark);
    case 'cherry':
      return barkCherry(seed, w.bark);
    case 'jungle':
      return barkRidged(seed, w.bark, { crevices: 5, breakP: 0.6, amp: 0.5, knots: 2, hlines: 4, partial: 0.3 });
    case 'acacia':
      return barkRidged(seed, w.bark, { crevices: 4, breakP: 0.5, amp: 0.7, hlines: 1, partial: 0.5 });
    case 'spruce':
      return barkRidged(seed, w.bark, { crevices: 6, breakP: 0.4, amp: 0.5 });
    case 'dark_oak':
      return barkRidged(seed, w.bark, { crevices: 5, breakP: 0.5, amp: 0.6, knots: 1 });
    case 'mangrove':
      return barkRidged(seed, w.bark, { crevices: 6, breakP: 0.3, amp: 0.5, plateNoise: 0.35, partial: 0.5 });
    default:
      return barkRidged(seed, w.bark, { crevices: 5, breakP: 0.35, amp: 0.45, partial: 0.15, weights: [0, 0.7, 2.2, 3, 2, 0.5] });
  }
}

// ---------------------------------------------------------------------------
// Log top (end grain)

export function logTop(seed: string, w: WoodDef, stripped = false): TexImage {
  const r = rng(seed);
  const t = img();
  const nz = fbm(r, [[8, 8, 0.55], [4, 4, 0.45]]);
  const wn = white(r);
  const [light, mid, dark] = w.ring;
  const cx = 7.5 + (r.next() - 0.5) * 1.2, cy = 7.5 + (r.next() - 0.5) * 1.2;
  const birch = w.style === 'birch';
  const p = 2.6;
  const spacing = 2.3 + r.next() * 0.3;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const e = Math.min(x, y, 15 - x, 15 - y);
      if (e === 0) {
        if (stripped) setPx(t, x, y, wn[i] < 0.5 ? w.wood[2] : w.wood[1]);
        else if (birch) setPx(t, x, y, w.bark[wn[i] < 0.12 ? 1 : wn[i] < 0.3 ? 2 : wn[i] < 0.7 ? 3 : 4]);
        else setPx(t, x, y, w.bark[wn[i] < 0.3 ? 1 : wn[i] < 0.75 ? 2 : 3]);
        continue;
      }
      const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
      // rounded-square distance warped by low-frequency noise (organic rings)
      const d = Math.pow(Math.pow(dx, p) + Math.pow(dy, p), 1 / p) + (nz[i] - 0.5) * 1.2;
      let c: number;
      if (d < 0.9) c = dark; // pith
      else {
        const ph = (d - 0.9) / spacing;
        const f = ph - Math.floor(ph);
        c = f > 0.62 ? mid : light;
        if (f > 0.8) c = dark;
      }
      if (e === 1) c = mixC(c, dark, 0.3);
      if (wn[i] > 0.94) c = mixC(c, dark, 0.35);
      setPx(t, x, y, c);
    }
  return t;
}

// ---------------------------------------------------------------------------
// Planks

const DEFAULT_SEAMS = [[12], [4], [9], [1, 14]];

export function planks(seed: string, w: WoodDef): TexImage {
  const r = rng(seed);
  const pal = w.wood; // [gap, dark grain, midDark, base, light, highlight]
  const tones = new Int32Array(N * N);
  const grain = fbm(r, [[8, 1, 0.5], [4, 1, 0.3], [16, 2, 0.2]], 0.35);
  const g = quantize(grain, [0.8, 2, 5, 2.2, 0.5]);
  for (let i = 0; i < N * N; i++) tones[i] = g[i] + 1; // 1..5
  const seams = w.seams ?? DEFAULT_SEAMS;
  for (let b = 0; b < 4; b++) {
    const y0 = b * 4;
    // board bottom line
    for (let x = 0; x < N; x++) tones[idx(x, y0 + 3)] = 0;
    // top row slightly lighter
    for (let x = 0; x < N; x++) if (tones[idx(x, y0)] < 4 && r.chance(0.5)) tones[idx(x, y0)]++;
    // grain dashes inside the board
    for (let k = 0; k < 2; k++) {
      const x = r.nextInt(N), y = y0 + 1 + r.nextInt(2), len = 2 + r.nextInt(4);
      for (let i = 0; i < len; i++) tones[idx(x + i, y)] = Math.max(1, Math.min(tones[idx(x + i, y)], 2));
    }
    for (const sx of seams[b]) {
      for (let y = y0; y < y0 + 3; y++) {
        tones[idx(sx, y)] = 0;
        if (tones[idx(sx + 1, y)] < 5) tones[idx(sx + 1, y)] = Math.min(5, tones[idx(sx + 1, y)] + 1);
      }
    }
  }
  return paint(tones, pal);
}

/** Stripped log side: smooth wood with vertical grain. */
export function strippedSide(seed: string, w: WoodDef): TexImage {
  const r = rng(seed);
  const f = fbm(r, [[2, 16, 0.45], [4, 8, 0.35], [1, 4, 0.2]], 0.2);
  const tones = quantize(f, [0.3, 1.5, 3, 5, 3, 0.8]);
  // a few darker vertical grain lines
  for (let k = 0; k < 3; k++) {
    const x = r.nextInt(N), y0 = r.nextInt(N), len = 4 + r.nextInt(8);
    for (let i = 0; i < len; i++) tones[idx(x, y0 + i)] = Math.min(tones[idx(x, y0 + i)], 1);
  }
  return paint(tones, w.wood);
}

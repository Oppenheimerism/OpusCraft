// Leaves (fancy-graphics cutout) and other foliage textures.

import { TexImage, img, setPx, getPx, getA, cloneImg, mulC } from '../tex';
import { N, rng, idx, noise, white, fbm, equalize, quantize } from './core';

export const LEAF_GRAYS = [0x636363, 0x737373, 0x838383, 0x939393, 0xa4a4a4, 0xb5b5b5, 0xc6c6c6];

export interface LeafOpts {
  blobs?: number;
  minDist?: number;
  radius?: [number, number];
  holes?: number; // fraction transparent
  shadow?: number; // fraction darkest (rim around holes)
  pal?: number[];
  light?: number; // shading strength
  noise?: number;
  stretch?: [number, number]; // anisotropy of blobs
}

/**
 * Leaf canopy: round leaf clusters (periodic Poisson blobs), shaded from the
 * top-left; the gaps between clusters become holes / dark shadow pixels.
 */
export function leafCanopy(seed: string, o: LeafOpts = {}): TexImage {
  const r = rng(seed);
  const pal = o.pal ?? LEAF_GRAYS;
  const K = pal.length;
  const [sx, sy] = o.stretch ?? [1, 1];
  // Poisson-ish centers
  const pts: { x: number; y: number; rad: number }[] = [];
  const md = o.minDist ?? 3.6;
  const want = o.blobs ?? 14;
  let guard = 0;
  while (pts.length < want && guard++ < 4000) {
    const x = r.next() * N, y = r.next() * N;
    let ok = true;
    for (const p of pts) {
      let dx = Math.abs(p.x - x), dy = Math.abs(p.y - y);
      dx = Math.min(dx, N - dx);
      dy = Math.min(dy, N - dy);
      if (Math.hypot(dx / sx, dy / sy) < md) ok = false;
    }
    if (ok) pts.push({ x, y, rad: (o.radius ?? [2.2, 3.0])[0] + r.next() * ((o.radius ?? [2.2, 3.0])[1] - (o.radius ?? [2.2, 3.0])[0]) });
  }
  const nz = noise(r, 4, 4);
  const wn = white(r);
  const gap = new Float32Array(N * N); // how far "outside" leaves a pixel is
  const lit = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let best = Infinity, bi = 0, bdx = 0, bdy = 0;
      for (let i = 0; i < pts.length; i++) {
        let dx = x + 0.5 - pts[i].x, dy = y + 0.5 - pts[i].y;
        if (dx > N / 2) dx -= N;
        if (dx < -N / 2) dx += N;
        if (dy > N / 2) dy -= N;
        if (dy < -N / 2) dy += N;
        const d = Math.hypot(dx / sx, dy / sy) / pts[i].rad;
        if (d < best) {
          best = d;
          bi = i;
          bdx = dx;
          bdy = dy;
        }
      }
      const i = y * N + x;
      gap[i] = best + (wn[i] - 0.5) * 0.35 + (nz[i] - 0.5) * 0.3;
      // lighting: -(dx+dy) normalized by radius => top-left lit
      const rad = pts[bi].rad;
      lit[i] = (-(bdx + bdy) / (rad * 1.6)) * (o.light ?? 1) - best * 0.55 + (wn[i] - 0.5) * (o.noise ?? 0.5);
    }
  const geq = equalize(gap);
  const holes = o.holes ?? 0.28, shadow = o.shadow ?? 0.12;
  const leq = equalize(lit);
  const t = img();
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0;
    if (geq[i] > 1 - holes) continue; // transparent
    if (geq[i] > 1 - holes - shadow) {
      setPx(t, x, y, pal[r.chance(0.6) ? 0 : 1]);
      continue;
    }
    const k = 1 + Math.min(K - 2, Math.floor(leq[i] * (K - 1)));
    setPx(t, x, y, pal[k]);
  }
  return t;
}

/** Needle foliage (spruce): herringbone diagonal needle strokes, few holes. */
export function needles(seed: string, o: { pal?: number[]; holes?: number; strokes?: number } = {}): TexImage {
  const r = rng(seed);
  const pal = o.pal ?? LEAF_GRAYS;
  const K = pal.length;
  const base = fbm(r, [[4, 4, 0.5], [2, 2, 0.5]], 0.5);
  const tones = quantize(base, [0.6, 1.4, 2.4, 2, 0.8, 0, 0]);
  const t = img();
  // strokes: short diagonal needles with lit tips
  for (let k = 0; k < (o.strokes ?? 30); k++) {
    const x = r.nextInt(N), y = r.nextInt(N);
    const dir = r.nextBool() ? 1 : -1;
    const len = 2 + r.nextInt(3);
    for (let i = 0; i < len; i++) tones[idx(x + i * dir, y + i)] = i === 0 ? K - 2 + (r.chance(0.3) ? 1 : 0) : Math.max(3, K - 3 - (i > 1 ? 1 : 0));
    // dark gap under the needle
    if (r.chance(0.7)) tones[idx(x + (len - 1) * dir, y + len)] = 0;
  }
  const holeF = fbm(r, [[2, 2, 0.4]], 0.8);
  const heq = equalize(holeF);
  const holes = o.holes ?? 0.16;
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0;
    if (heq[i] > 1 - holes && tones[i] < K - 2) continue;
    setPx(t, x, y, pal[Math.max(0, Math.min(K - 1, tones[i]))]);
  }
  // shade pixels below holes
  const src = cloneImg(t);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!getA(src, x, y)) continue;
      if (!getA(src, x, (y + 15) % N) && getA(src, x, y)) setPx(t, x, y, mulC(getPx(src, x, y), 0.9));
    }
  return t;
}

export const LEAF_PINK = [0xb35a7c, 0xc76d8f, 0xd683a2, 0xe199b4, 0xebaec5, 0xf3c3d5, 0xf9d8e4];
export const LEAF_AZALEA = [0x3b561b, 0x486622, 0x55762a, 0x628532, 0x71953b, 0x80a445, 0x92b552];

export const LEAVES: Record<string, () => TexImage> = {
  oak: () => leafCanopy('oak_leaves', { blobs: 22, minDist: 2.6, radius: [1.5, 2.2], noise: 0.8, light: 0.8, holes: 0.27, shadow: 0.13 }),
  spruce: () => needles('spruce_leaves', { holes: 0.14 }),
  birch: () => leafCanopy('birch_leaves', { blobs: 26, minDist: 2.4, radius: [1.3, 1.9], noise: 0.9, light: 0.7, holes: 0.3, shadow: 0.1 }),
  jungle: () => leafCanopy('jungle_leaves', { blobs: 12, minDist: 3.8, radius: [2.4, 3.3], noise: 0.6, light: 1.1, holes: 0.16, shadow: 0.14 }),
  acacia: () => leafCanopy('acacia_leaves', { blobs: 26, minDist: 2.3, radius: [1.3, 1.9], noise: 0.9, light: 0.7, holes: 0.32, shadow: 0.1, stretch: [1.3, 0.85] }),
  dark_oak: () => leafCanopy('dark_oak_leaves', { blobs: 16, minDist: 3.2, radius: [2.0, 2.8], noise: 0.7, light: 0.9, holes: 0.21, shadow: 0.15 }),
  mangrove: () => leafCanopy('mangrove_leaves', { blobs: 20, minDist: 2.7, radius: [1.6, 2.4], noise: 0.8, light: 0.8, holes: 0.25, shadow: 0.12, stretch: [1.4, 0.8] }),
  cherry: () => leafCanopy('cherry_leaves', { blobs: 20, minDist: 2.7, radius: [1.6, 2.3], noise: 0.8, light: 0.8, holes: 0.26, shadow: 0.1, pal: LEAF_PINK }),
  azalea: () => leafCanopy('azalea_leaves', { blobs: 16, minDist: 3.1, radius: [1.9, 2.7], noise: 0.7, light: 0.9, holes: 0.2, shadow: 0.12, pal: LEAF_AZALEA }),
};

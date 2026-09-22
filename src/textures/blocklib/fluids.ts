// Animated fluids (water, lava), glass and ice.

import { TexImage, AnimTex, img, setPx, anim } from '../tex';
import { N, rng, white, sample, fbm, quantize, paint } from './core';

const TAU = Math.PI * 2;

interface Wave {
  kx: number;
  ky: number;
  w: number; // temporal cycles over the animation
  a: number;
  p: number;
}

function waveSum(waves: Wave[], x: number, y: number, f: number, frames: number): number {
  let v = 0;
  for (const wv of waves) v += wv.a * Math.sin(TAU * ((wv.kx * x + wv.ky * y) / N - (wv.w * f) / frames) + wv.p);
  return v;
}

/** 4x4 ordered dither thresholds (0..1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// ---------------------------------------------------------------------------
// Water (grayscale, tinted by biome water colour)

const WATER_GRAYS = [0x9c9c9c, 0xa9a9a9, 0xb6b6b6, 0xc3c3c3, 0xd1d1d1, 0xdfdfdf];
const WATER_ALPHA = [176, 178, 180, 183, 187, 192];

/** Sample periodic field shifted by (sx, sy) pixels (bilinear). */
function at(f: Float32Array, x: number, y: number, sx: number, sy: number): number {
  return sample(f, x - sx, y - sy);
}

export function waterStill(): AnimTex {
  const frames = 32;
  const r = rng('water_still');
  const A = fbm(r, [[8, 8, 0.5], [4, 4, 0.35], [2, 2, 0.15]]);
  const B = fbm(r, [[8, 8, 0.45], [4, 4, 0.4], [2, 2, 0.15]]);
  const C = fbm(r, [[4, 4, 0.6], [2, 2, 0.4]]);
  return anim(N, N, frames, 2, (f) => {
    const t = img();
    const ph = f / frames;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        // two layers drifting in different directions (whole-period shifts over the loop)
        const a = at(A, x, y, ph * 16, 0);
        const b = at(B, x, y, 0, ph * 16);
        const c = at(C, x, y, -ph * 16, -ph * 16);
        // ridged combination -> soft ripple lines
        const v = 1 - Math.abs(a - b) * 2.2;
        let u = v * 0.75 + c * 0.35 - 0.12;
        u = Math.max(0, Math.min(0.999, u + (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.1));
        const k = Math.min(WATER_GRAYS.length - 1, Math.floor(u * WATER_GRAYS.length));
        setPx(t, x, y, WATER_GRAYS[k], WATER_ALPHA[k]);
      }
    return t;
  });
}

export function waterFlow(): AnimTex {
  const frames = 32;
  const r = rng('water_flow');
  const A = fbm(r, [[4, 16, 0.5], [2, 8, 0.35], [2, 4, 0.15]]);
  const B = fbm(r, [[4, 8, 0.5], [2, 4, 0.5]]);
  return anim(N, N, frames, 2, (f) => {
    const t = img();
    const ph = f / frames;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const a = at(A, x, y, 0, ph * 16);
        const b = at(B, x, y, 0, ph * 32);
        const v = 1 - Math.abs(a - b) * 2.2;
        let u = v * 0.7 + a * 0.3 - 0.05; // flowing water streams faster than still water
        u = Math.max(0, Math.min(0.999, u + (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.1));
        const k = Math.min(WATER_GRAYS.length - 1, Math.floor(u * WATER_GRAYS.length));
        setPx(t, x, y, WATER_GRAYS[k], WATER_ALPHA[k]);
      }
    return t;
  });
}

// ---------------------------------------------------------------------------
// Lava

const LAVA_PAL = [0x8e2a06, 0xae3a08, 0xcb4e0c, 0xdf6511, 0xec8119, 0xf6a226, 0xfcc53f, 0xffe27a];

export function lava(flow: boolean): AnimTex {
  const frames = flow ? 16 : 20;
  const r = rng(flow ? 'lava_flow' : 'lava_still');
  const A = fbm(r, [[8, 8, 0.45], [4, 4, 0.4], [2, 2, 0.15]]);
  const B = fbm(r, [[8, 8, 0.4], [4, 4, 0.45], [2, 2, 0.15]]);
  const C = fbm(r, [[4, 4, 0.5], [2, 2, 0.5]]);
  return anim(N, N, frames, flow ? 2 : 3, (f) => {
    const t = img();
    const ph = f / frames;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const a = flow ? at(A, x, y, 0, ph * 16) : at(A, x, y, ph * 16, 0);
        const b = flow ? at(B, x, y, 0, ph * 32) : at(B, x, y, 0, -ph * 16);
        const c = flow ? at(C, x, y, 0, ph * 16) : at(C, x, y, -ph * 16, ph * 16);
        // bright where the layers meet (ridges), dark crust in the troughs
        const ridge = 1 - Math.abs(a - b) * 2;
        let u = ridge * 0.6 + c * 0.45 - 0.08;
        u = Math.max(0, Math.min(0.999, u + (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.08));
        const k = Math.floor(u * LAVA_PAL.length);
        setPx(t, x, y, LAVA_PAL[Math.min(LAVA_PAL.length - 1, k)]);
      }
    return t;
  });
}

// ---------------------------------------------------------------------------
// Glass & ice

export function glass(): TexImage {
  const t = img();
  const hi = 0xf4fbfd, lt = 0xdcecf1, md = 0xbdd6de, dk = 0x98b6c1;
  for (let i = 0; i < N; i++) {
    setPx(t, i, 0, i < 12 ? hi : lt);
    setPx(t, 0, i, i < 12 ? hi : lt);
    setPx(t, i, 15, i > 3 ? md : lt);
    setPx(t, 15, i, i > 3 ? md : lt);
  }
  setPx(t, 15, 15, dk);
  setPx(t, 14, 15, dk);
  setPx(t, 15, 14, dk);
  // highlight streaks near top-left and bottom-right
  for (const [x, y] of [[2, 4], [3, 3], [4, 2], [2, 6], [3, 5], [4, 4], [5, 3], [6, 2]]) setPx(t, x, y, hi, 255);
  for (const [x, y] of [[11, 13], [12, 12], [13, 11]]) setPx(t, x, y, lt, 255);
  return t;
}

export function ice(): TexImage {
  const r = rng('ice');
  const t = img();
  const f = fbm(r, [[8, 8, 0.5], [4, 4, 0.3], [2, 2, 0.2]], 0.15);
  const tones = quantize(f, [1, 3, 4, 2]);
  const pal = [0x6f9be8, 0x7ea8ee, 0x8ab2f1, 0x9bbff4];
  for (let i = 0; i < N * N; i++) setPx(t, i % N, (i / N) | 0, pal[tones[i]], 160);
  // white diagonal streaks
  const streaks: [number, number, number][] = [[1, 6, 5], [7, 3, 4], [9, 12, 5], [3, 14, 3], [12, 7, 3]];
  for (const [x0, y0, len] of streaks)
    for (let i = 0; i < len; i++) setPx(t, x0 + i, y0 - i, i === 0 || i === len - 1 ? 0xc3d8f8 : 0xe2edfd, 190);
  return t;
}

export function packedIce(seed: string, pal: number[], crack: number): TexImage {
  const r = rng(seed);
  const f = fbm(r, [[8, 8, 0.45], [4, 4, 0.35], [2, 2, 0.2]], 0.2);
  const tones = quantize(f, [0, 0.8, 2.5, 4, 2.5, 0.8, 0]);
  // cracks: short diagonal lighter/darker lines
  for (let k = 0; k < 6; k++) {
    let x = r.nextInt(N), y = r.nextInt(N);
    const len = 3 + r.nextInt(4);
    const dx = r.nextBool() ? 1 : -1;
    for (let i = 0; i < len; i++) {
      tones[((y + 16) % 16) * 16 + ((x + 16) % 16)] = 6;
      const bi = (((y + 17) % 16) * 16 + ((x + 16) % 16));
      if (tones[bi] < 6) tones[bi] = 1;
      x += dx;
      if (r.chance(0.5)) y--;
    }
  }
  void crack;
  return paint(tones, pal);
}


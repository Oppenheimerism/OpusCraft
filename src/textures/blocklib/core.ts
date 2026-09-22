// Shared helpers for the procedural block textures (fields on a periodic
// 16x16 grid, palette quantization, cluster stamping, local shading).
// Everything is deterministic: seeds come from texture names.

import { TexImage, img, setPx, packRGB, rgbOf, valueNoise, Rand } from '../tex';
import { hashString } from '../../core/rng';

export const N = 16;

/** Seeded RNG from a name (+ optional salt). */
export function rng(name: string, salt = 0): Rand {
  return new Rand(hashString(name) ^ Math.imul(salt + 1, 0x9e3779b1), 1234 + salt);
}

export type Field = Float32Array;

export const wrap = (v: number, n = N): number => ((v % n) + n) % n;
export const idx = (x: number, y: number, w = N, h = N): number => wrap(y, h) * w + wrap(x, w);

/** Periodic value noise normalized to [0,1]; cell sizes should divide the texture size. */
export function noise(r: Rand, cw: number, ch = cw, w = N, h = N, smooth = true): Field {
  return valueNoise(r, w, h, cw, ch, smooth);
}

export function white(r: Rand, w = N, h = N): Field {
  const f = new Float32Array(w * h);
  for (let i = 0; i < f.length; i++) f[i] = r.next();
  return f;
}

/** Sum of layers: [field, weight][] */
export function mix(layers: [Field, number][]): Field {
  const out = new Float32Array(layers[0][0].length);
  for (const [f, wt] of layers) for (let i = 0; i < out.length; i++) out[i] += f[i] * wt;
  return out;
}

/** Multi-octave periodic noise: octaves = [cellW, cellH, weight][] (+ optional white weight). */
export function fbm(r: Rand, octaves: [number, number, number][], whiteW = 0, w = N, h = N): Field {
  const layers: [Field, number][] = octaves.map(([cw, ch, wt]) => [noise(r, cw, ch, w, h), wt]);
  if (whiteW) layers.push([white(r, w, h), whiteW]);
  return normalize(mix(layers));
}

export function normalize(f: Field): Field {
  let lo = Infinity, hi = -Infinity;
  for (const v of f) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const rr = hi - lo || 1;
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) / rr;
  return f;
}

/** Rank-equalize to uniform [0,1). Ties broken by index (stable). */
export function equalize(f: Field): Field {
  const order = Array.from(f.keys()).sort((a, b) => f[a] - f[b] || a - b);
  const out = new Float32Array(f.length);
  for (let r = 0; r < order.length; r++) out[order[r]] = (r + 0.5) / order.length;
  return out;
}

/** Periodic box blur (radius 1) repeated `n` times. */
export function blur(f: Field, n = 1, w = N, h = N): Field {
  let cur = f;
  for (let k = 0; k < n; k++) {
    const o = new Float32Array(cur.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += cur[idx(x + dx, y + dy, w, h)] * (dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1);
        o[y * w + x] = s / 16;
      }
    cur = o;
  }
  return cur;
}

/** Sample field with periodic bilinear interpolation. */
export function sample(f: Field, x: number, y: number, w = N, h = N): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = x - x0, ty = y - y0;
  const a = f[idx(x0, y0, w, h)], b = f[idx(x0 + 1, y0, w, h)], c = f[idx(x0, y0 + 1, w, h)], d = f[idx(x0 + 1, y0 + 1, w, h)];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/** Directional derivative (light from top-left by default): positive = lit. */
export function slope(f: Field, dx = -1, dy = -1, w = N, h = N): Field {
  const o = new Float32Array(f.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) o[y * w + x] = f[y * w + x] - f[idx(x + dx, y + dy, w, h)];
  return o;
}

/**
 * Quantize a field into tone indices 0..k-1 with relative coverage `weights`
 * (after rank equalization, so coverage is exact).
 */
export function quantize(f: Field, weights: number[]): Int32Array {
  const eq = equalize(f);
  const total = weights.reduce((a, b) => a + b, 0);
  const cuts: number[] = [];
  let acc = 0;
  for (const wt of weights) cuts.push((acc += wt / total));
  const out = new Int32Array(f.length);
  for (let i = 0; i < f.length; i++) {
    let k = 0;
    while (k < cuts.length - 1 && eq[i] > cuts[k]) k++;
    out[i] = k;
  }
  return out;
}

/** Paint tone indices through a palette (index -> color). Negative index = transparent. */
export function paint(tones: Int32Array, palette: number[], w = N, h = N): TexImage {
  const t = img(w, h);
  for (let i = 0; i < tones.length; i++) {
    const k = tones[i];
    if (k < 0) continue;
    setPx(t, i % w, Math.floor(i / w), palette[Math.max(0, Math.min(palette.length - 1, k))]);
  }
  return t;
}

/** Majority (mode) filter over 3x3 (periodic); creates blobby clusters. */
export function modeFilter(tones: Int32Array, r: Rand, iters = 1, w = N, h = N): Int32Array {
  let cur = tones;
  for (let it = 0; it < iters; it++) {
    const o = new Int32Array(cur.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const cnt = new Map<number, number>();
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const v = cur[idx(x + dx, y + dy, w, h)];
            cnt.set(v, (cnt.get(v) ?? 0) + (dx === 0 && dy === 0 ? 1.5 : 1));
          }
        let best = cur[y * w + x], bc = -1;
        for (const [v, c] of cnt) {
          const cc = c + r.next() * 0.9;
          if (cc > bc) {
            bc = cc;
            best = v;
          }
        }
        o[y * w + x] = best;
      }
    cur = o;
  }
  return cur;
}

/** Random-walk cluster of `n` connected pixels starting at (x,y) (periodic). */
export function cluster(r: Rand, x: number, y: number, n: number, bias: [number, number] = [0, 0], diag = false): [number, number][] {
  const pts: [number, number][] = [[wrap(x), wrap(y)]];
  const has = (px: number, py: number) => pts.some(([a, b]) => a === px && b === py);
  let guard = 0;
  while (pts.length < n && guard++ < 200) {
    const [px, py] = pts[r.nextInt(pts.length)];
    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    if (diag) dirs.push([1, 1], [-1, -1], [1, -1], [-1, 1]);
    // bias weights
    const ws = dirs.map(([dx, dy]) => 1 + Math.max(0, dx * bias[0] + dy * bias[1]));
    let s = ws.reduce((a, b) => a + b, 0) * r.next();
    let d = 0;
    while (d < ws.length - 1 && (s -= ws[d]) > 0) d++;
    const nx = wrap(px + dirs[d][0]), ny = wrap(py + dirs[d][1]);
    if (!has(nx, ny)) pts.push([nx, ny]);
  }
  return pts;
}

/** Luminance 0..1 of a color. */
export function lum(c: number): number {
  const [r, g, b] = rgbOf(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function grayOf(v: number): number {
  const g = Math.max(0, Math.min(255, Math.round(v)));
  return packRGB(g, g, g);
}

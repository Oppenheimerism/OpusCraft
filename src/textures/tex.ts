// Procedural pixel-art toolkit. All textures are generated at startup from
// code (no image files). Pure functions over RGBA byte buffers so they can
// run in the browser and in Node (for preview sheets).

import { Rand } from '../core/rng';

export interface TexImage {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export interface AnimTex {
  w: number;
  h: number;
  frames: Uint8ClampedArray[];
  /** ticks per frame */
  frameTime: number;
  /** blend between frames (vanilla "interpolate") */
  interpolate?: boolean;
  /** explicit frame order (indices into frames) */
  order?: number[];
}

export type TexDef = TexImage | AnimTex;

export function isAnim(t: TexDef): t is AnimTex {
  return (t as AnimTex).frames !== undefined;
}

export function img(w = 16, h = 16): TexImage {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

export function cloneImg(t: TexImage): TexImage {
  return { w: t.w, h: t.h, data: new Uint8ClampedArray(t.data) };
}

// ---------------------------------------------------------------------------
// Colors are 0xRRGGBB numbers.

export function rgbOf(c: number): [number, number, number] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

export function packRGB(r: number, g: number, b: number): number {
  const cl = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  return (cl(r) << 16) | (cl(g) << 8) | cl(b);
}

export function mixC(a: number, b: number, t: number): number {
  const [ar, ag, ab] = rgbOf(a);
  const [br, bg, bb] = rgbOf(b);
  return packRGB(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

export function mulC(c: number, f: number): number {
  const [r, g, b] = rgbOf(c);
  return packRGB(r * f, g * f, b * f);
}

export function addC(c: number, d: number): number {
  const [r, g, b] = rgbOf(c);
  return packRGB(r + d, g + d, b + d);
}

export function gray(v: number): number {
  const g = Math.round(v < 0 ? 0 : v > 255 ? 255 : v);
  return (g << 16) | (g << 8) | g;
}

/** Tint a grayscale-ish color by a tint color (multiply). */
export function tintC(c: number, tint: number): number {
  const [r, g, b] = rgbOf(c);
  const [tr, tg, tb] = rgbOf(tint);
  return packRGB((r * tr) / 255, (g * tg) / 255, (b * tb) / 255);
}

// ---------------------------------------------------------------------------
// Pixel access

export function setPx(t: TexImage, x: number, y: number, c: number, a = 255): void {
  x = ((x % t.w) + t.w) % t.w;
  y = ((y % t.h) + t.h) % t.h;
  const i = (y * t.w + x) * 4;
  t.data[i] = (c >> 16) & 255;
  t.data[i + 1] = (c >> 8) & 255;
  t.data[i + 2] = c & 255;
  t.data[i + 3] = a;
}

/** set pixel without wrapping (ignored if outside) */
export function plot(t: TexImage, x: number, y: number, c: number, a = 255): void {
  if (x < 0 || y < 0 || x >= t.w || y >= t.h) return;
  const i = (y * t.w + x) * 4;
  t.data[i] = (c >> 16) & 255;
  t.data[i + 1] = (c >> 8) & 255;
  t.data[i + 2] = c & 255;
  t.data[i + 3] = a;
}

export function getPx(t: TexImage, x: number, y: number): number {
  x = ((x % t.w) + t.w) % t.w;
  y = ((y % t.h) + t.h) % t.h;
  const i = (y * t.w + x) * 4;
  return (t.data[i] << 16) | (t.data[i + 1] << 8) | t.data[i + 2];
}

export function getA(t: TexImage, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= t.w || y >= t.h) return 0;
  return t.data[(y * t.w + x) * 4 + 3];
}

export function fill(t: TexImage, c: number, a = 255): TexImage {
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) setPx(t, x, y, c, a);
  return t;
}

export function rect(t: TexImage, x0: number, y0: number, w: number, h: number, c: number, a = 255): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) plot(t, x, y, c, a);
}

export function clear(t: TexImage, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= t.w || y >= t.h) return;
  const i = (y * t.w + x) * 4;
  t.data[i] = t.data[i + 1] = t.data[i + 2] = t.data[i + 3] = 0;
}

/** Draw from a string pattern: each char maps to a color (or '.'/' ' = skip). */
export function pattern(t: TexImage, x0: number, y0: number, rows: string[], colors: Record<string, number | null>): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const c = colors[ch];
      if (c === undefined) continue;
      if (c === null) clear(t, x0 + x, y0 + y);
      else plot(t, x0 + x, y0 + y, c);
    }
  }
}

export function mapPixels(t: TexImage, f: (x: number, y: number, c: number, a: number) => [number, number] | number | null): void {
  for (let y = 0; y < t.h; y++)
    for (let x = 0; x < t.w; x++) {
      const i = (y * t.w + x) * 4;
      const c = (t.data[i] << 16) | (t.data[i + 1] << 8) | t.data[i + 2];
      const r = f(x, y, c, t.data[i + 3]);
      if (r === null) continue;
      if (typeof r === 'number') plot(t, x, y, r, t.data[i + 3]);
      else plot(t, x, y, r[0], r[1]);
    }
}

/** Copy src onto dst at offset, alpha-over. */
export function blit(dst: TexImage, src: TexImage, ox = 0, oy = 0): void {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const si = (y * src.w + x) * 4;
      const a = src.data[si + 3];
      if (a === 0) continue;
      const dx = x + ox, dy = y + oy;
      if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
      const di = (dy * dst.w + dx) * 4;
      if (a === 255) {
        dst.data[di] = src.data[si];
        dst.data[di + 1] = src.data[si + 1];
        dst.data[di + 2] = src.data[si + 2];
        dst.data[di + 3] = 255;
      } else {
        const fa = a / 255;
        const da = dst.data[di + 3] / 255;
        const oa = fa + da * (1 - fa);
        for (let k = 0; k < 3; k++) {
          dst.data[di + k] = oa > 0 ? (src.data[si + k] * fa + dst.data[di + k] * da * (1 - fa)) / oa : 0;
        }
        dst.data[di + 3] = oa * 255;
      }
    }
}

export function flipH(t: TexImage): TexImage {
  const o = img(t.w, t.h);
  for (let y = 0; y < t.h; y++)
    for (let x = 0; x < t.w; x++) {
      const si = (y * t.w + x) * 4, di = (y * t.w + (t.w - 1 - x)) * 4;
      for (let k = 0; k < 4; k++) o.data[di + k] = t.data[si + k];
    }
  return o;
}

export function rotate90(t: TexImage): TexImage {
  const o = img(t.h, t.w);
  for (let y = 0; y < t.h; y++)
    for (let x = 0; x < t.w; x++) {
      const si = (y * t.w + x) * 4;
      const nx = t.h - 1 - y, ny = x;
      const di = (ny * o.w + nx) * 4;
      for (let k = 0; k < 4; k++) o.data[di + k] = t.data[si + k];
    }
  return o;
}

// ---------------------------------------------------------------------------
// Noise (periodic → seamless tiling)

/** Periodic value noise in [0,1], lattice cell size `cell`, smooth interpolation. */
export function valueNoise(rng: Rand, w: number, h: number, cellW: number, cellH = cellW, smooth = true): Float32Array {
  const gw = Math.max(1, Math.round(w / cellW)), gh = Math.max(1, Math.round(h / cellH));
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * gw, fy = (y / h) * gh;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy;
      if (smooth) {
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
      }
      const x0 = ix % gw, x1 = (ix + 1) % gw, y0 = iy % gh, y1 = (iy + 1) % gh;
      const a = grid[y0 * gw + x0], b = grid[y0 * gw + x1], c = grid[y1 * gw + x0], d = grid[y1 * gw + x1];
      out[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  return out;
}

export function whiteNoise(rng: Rand, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = rng.next();
  return out;
}

/** Weighted sum of layers, normalized to [0,1]. */
export function combine(layers: Float32Array[], weights: number[]): Float32Array {
  const n = layers[0].length;
  const out = new Float32Array(n);
  let tw = 0;
  for (const w of weights) tw += Math.abs(w);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < layers.length; k++) s += layers[k][i] * weights[k];
    out[i] = s / tw;
  }
  return out;
}

export function normalize(v: Float32Array): Float32Array {
  let lo = Infinity, hi = -Infinity;
  for (const x of v) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  const r = hi - lo || 1;
  for (let i = 0; i < v.length; i++) v[i] = (v[i] - lo) / r;
  return v;
}

/** Histogram-equalize a field so palette bands get predictable coverage. */
export function equalize(v: Float32Array): Float32Array {
  const idx = Array.from(v.keys()).sort((a, b) => v[a] - v[b]);
  const out = new Float32Array(v.length);
  for (let r = 0; r < idx.length; r++) out[idx[r]] = (r + 0.5) / idx.length;
  return out;
}

/** Map field to palette (dark→light). `weights` give relative coverage of each band. */
export function paletteMap(t: TexImage, v: Float32Array, palette: number[], weights?: number[]): void {
  const w = weights ?? palette.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  const cuts: number[] = [];
  let acc = 0;
  for (let i = 0; i < w.length; i++) {
    acc += w[i] / total;
    cuts.push(acc);
  }
  const eq = equalize(v);
  for (let y = 0; y < t.h; y++)
    for (let x = 0; x < t.w; x++) {
      const val = eq[y * t.w + x];
      let k = 0;
      while (k < cuts.length - 1 && val > cuts[k]) k++;
      setPx(t, x, y, palette[k]);
    }
}

/** Periodic Voronoi: returns nearest-site id and F1/F2 distances per pixel. */
export function voronoi(rng: Rand, w: number, h: number, sites: number, jitterMinDist = 0): { id: Int32Array; f1: Float32Array; f2: Float32Array; pts: [number, number][] } {
  const pts: [number, number][] = [];
  let guard = 0;
  while (pts.length < sites && guard++ < 5000) {
    const p: [number, number] = [rng.next() * w, rng.next() * h];
    let ok = true;
    for (const q of pts) {
      let dx = Math.abs(p[0] - q[0]), dy = Math.abs(p[1] - q[1]);
      dx = Math.min(dx, w - dx);
      dy = Math.min(dy, h - dy);
      if (Math.hypot(dx, dy) < jitterMinDist) ok = false;
    }
    if (ok) pts.push(p);
  }
  const id = new Int32Array(w * h), f1 = new Float32Array(w * h), f2 = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let b1 = Infinity, b2 = Infinity, bi = 0;
      for (let i = 0; i < pts.length; i++) {
        let dx = Math.abs(x + 0.5 - pts[i][0]), dy = Math.abs(y + 0.5 - pts[i][1]);
        dx = Math.min(dx, w - dx);
        dy = Math.min(dy, h - dy);
        const d = Math.hypot(dx, dy);
        if (d < b1) {
          b2 = b1;
          b1 = d;
          bi = i;
        } else if (d < b2) b2 = d;
      }
      id[y * w + x] = bi;
      f1[y * w + x] = b1;
      f2[y * w + x] = b2;
    }
  return { id, f1, f2, pts };
}

/** Make an animation from a frame generator. */
export function anim(w: number, h: number, count: number, frameTime: number, gen: (i: number) => TexImage, interpolate = false): AnimTex {
  const frames: Uint8ClampedArray[] = [];
  for (let i = 0; i < count; i++) frames.push(gen(i).data);
  return { w, h, frames, frameTime, interpolate };
}

/** Average color of opaque pixels. */
export function avgColor(t: TexImage): number {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < t.data.length; i += 4) {
    if (t.data[i + 3] < 128) continue;
    r += t.data[i];
    g += t.data[i + 1];
    b += t.data[i + 2];
    n++;
  }
  return n ? packRGB(r / n, g / n, b / n) : 0;
}

/** Draw a 1px outline of `c` around opaque pixels (into transparent neighbours). */
export function outline(t: TexImage, c: number, diagonal = false): void {
  const src = cloneImg(t);
  for (let y = 0; y < t.h; y++)
    for (let x = 0; x < t.w; x++) {
      if (getA(src, x, y) > 0) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (!diagonal && dx && dy) continue;
          if (getA(src, x + dx, y + dy) > 0) near = true;
        }
      if (near) plot(t, x, y, c);
    }
}

/** Shade pixels: darken those whose neighbour in (dx,dy) is transparent/edge. */
export function edgeShade(t: TexImage, dx: number, dy: number, f: number): void {
  const src = cloneImg(t);
  for (let y = 0; y < t.h; y++)
    for (let x = 0; x < t.w; x++) {
      if (getA(src, x, y) === 0) continue;
      if (getA(src, x + dx, y + dy) === 0) plot(t, x, y, mulC(getPx(src, x, y), f));
    }
}

export function line(t: TexImage, x0: number, y0: number, x1: number, y1: number, c: number): void {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(t, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

export { Rand };

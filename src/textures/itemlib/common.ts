// Shared helpers for hand-pixeled item sprites (16x16, alpha 0/255 only).

import { TexImage, img, plot, getA, getPx, cloneImg, mixC, mulC, clear, Rand, valueNoise } from '../tex';
import { hashString } from '../../core/rng';

export type Pal = Record<string, number | null>;
export type Gen = () => TexImage;

/**
 * Build a 16x16 sprite from string rows. '.' and ' ' are transparent; every
 * other character must be in `pal` (throws on typos so mistakes surface in the
 * preview script instead of silently producing holes).
 */
export function spr(rows: string[], pal: Pal, name = 'sprite'): TexImage {
  const t = img(16, 16);
  if (rows.length > 16) throw new Error(`item ${name}: ${rows.length} rows`);
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    if (row.length > 16) throw new Error(`item ${name}: row ${y} has ${row.length} chars`);
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (c === undefined) throw new Error(`item ${name}: unknown char '${ch}' at ${x},${y}`);
      if (c === null) clear(t, x, y);
      else plot(t, x, y, c);
    }
  }
  return t;
}

/** Draw rows onto an existing image (same rules as spr). */
export function over(t: TexImage, rows: string[], pal: Pal, ox = 0, oy = 0): TexImage {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (c === undefined) throw new Error(`item overlay: unknown char '${ch}' at ${x},${y}`);
      if (c === null) clear(t, ox + x, oy + y);
      else plot(t, ox + x, oy + y, c);
    }
  }
  return t;
}

/**
 * A material ramp: outline + 5 shades (dark -> light). Maps the template
 * characters '#', '1'..'5' (and '6' = extra highlight if present).
 */
export interface Ramp {
  o: number;
  s: [number, number, number, number, number];
  hi?: number;
}

export function rampPal(r: Ramp, prefix: Partial<Record<'o' | '1' | '2' | '3' | '4' | '5' | '6', string>> = {}): Pal {
  const p: Pal = {};
  p[prefix.o ?? '#'] = r.o;
  for (let i = 0; i < 5; i++) p[(prefix as Record<string, string>)[String(i + 1)] ?? String(i + 1)] = r.s[i];
  p[prefix['6'] ?? '6'] = r.hi ?? r.s[4];
  return p;
}

/** Deterministic RNG for a sprite name. */
export function rng(name: string, salt = 0): Rand {
  return new Rand(hashString('item:' + name) ^ salt, 1337);
}

/** Recolor exact colors. */
export function recolor(t: TexImage, map: Map<number, number> | Record<number, number>): TexImage {
  const o = cloneImg(t);
  const m = map instanceof Map ? map : new Map(Object.entries(map).map(([k, v]) => [Number(k), v] as [number, number]));
  for (let y = 0; y < o.h; y++)
    for (let x = 0; x < o.w; x++) {
      if (!getA(o, x, y)) continue;
      const c = getPx(o, x, y);
      const n = m.get(c);
      if (n !== undefined) plot(o, x, y, n);
    }
  return o;
}

/** Recolor a sprite built with ramp A into ramp B (outline + shades). */
export function swapRamp(t: TexImage, a: Ramp, b: Ramp): TexImage {
  const m = new Map<number, number>();
  m.set(a.o, b.o);
  for (let i = 0; i < 5; i++) m.set(a.s[i], b.s[i]);
  if (a.hi !== undefined) m.set(a.hi, b.hi ?? b.s[4]);
  return recolor(t, m);
}

/** Add a 1px 4-connected outline of color c around opaque pixels. */
export function outline4(t: TexImage, c: number): TexImage {
  const src = cloneImg(t);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (getA(src, x, y)) continue;
      if (getA(src, x - 1, y) || getA(src, x + 1, y) || getA(src, x, y - 1) || getA(src, x, y + 1)) plot(t, x, y, c);
    }
  return t;
}

/** Shift a sprite by (dx,dy) (pixels moved off-canvas are dropped). */
export function shift(t: TexImage, dx: number, dy: number): TexImage {
  const o = img(t.w, t.h);
  for (let y = 0; y < t.h; y++)
    for (let x = 0; x < t.w; x++) {
      if (!getA(t, x, y)) continue;
      plot(o, x + dx, y + dy, getPx(t, x, y));
    }
  return o;
}

/** Multiply-tint every opaque pixel (keeps luminance structure). */
export function tint(t: TexImage, f: (c: number, x: number, y: number) => number): TexImage {
  const o = cloneImg(t);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) if (getA(o, x, y)) plot(o, x, y, f(getPx(o, x, y), x, y));
  return o;
}

/** Luminance 0..255 of a packed color. */
export function lum(c: number): number {
  return ((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114;
}

/**
 * Build a ramp of n colors from a base color: darker to lighter by blending
 * toward `dark` and `light` anchors.
 */
export function makeRamp(base: number, dark: number, light: number): number[] {
  return [mixC(base, dark, 0.62), mixC(base, dark, 0.38), mixC(base, dark, 0.15), base, mixC(base, light, 0.45)];
}

export { mixC, mulC };

/**
 * Auto-shade a silhouette. `mask` rows: '.' transparent, 'X' fill (auto),
 * digits '0'..'9' force a ramp index, other chars looked up in `extra`.
 * Shading follows a height field (distance to edge) lit from the top-left,
 * quantized to `ramp` (dark -> light), plus optional seeded dither noise.
 * An outline of `outlineColor` is added around the silhouette (4-connected)
 * unless outlineColor is null.
 */
export function autoShade(
  mask: string[],
  ramp: number[],
  outlineColor: number | null,
  opts: { noise?: number; seed?: string; bias?: number; edge?: number; extra?: Pal; relief?: number; cluster?: number; cell?: number; low?: string } = {},
): TexImage {
  const t = img(16, 16);
  const W = 16, H = 16;
  const fill = new Uint8Array(W * H);
  for (let y = 0; y < mask.length; y++)
    for (let x = 0; x < mask[y].length; x++) {
      const ch = mask[y][x];
      if (ch !== '.' && ch !== ' ' && !(opts.low && opts.low.includes(ch))) fill[y * W + x] = 1;
    }
  // distance to nearest non-fill (4-connected), capped
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = fill[i] ? 99 : 0;
  for (let it = 0; it < 6; it++)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!fill[i]) continue;
        const nb = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : d[yy * W + xx]);
        d[i] = Math.min(d[i], nb(x - 1, y) + 1, nb(x + 1, y) + 1, nb(x, y - 1) + 1, nb(x, y + 1) + 1);
      }
  const cap = opts.relief ?? 3;
  const h = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : Math.min(cap, d[y * W + x]));
  const r = rng(opts.seed ?? mask.join(''), 3);
  const smooth = opts.cluster ? valueNoise(rng(opts.seed ?? mask.join(''), 5), 16, 16, opts.cell ?? 4) : null;
  const n = ramp.length;
  for (let y = 0; y < mask.length; y++)
    for (let x = 0; x < mask[y].length; x++) {
      const ch = mask[y][x];
      if (ch === '.' || ch === ' ') continue;
      if (ch >= '0' && ch <= '9') {
        plot(t, x, y, ramp[Math.min(n - 1, +ch)]);
        continue;
      }
      if (ch !== 'X') {
        const c = opts.extra?.[ch];
        if (c === undefined) throw new Error(`autoShade: unknown char '${ch}'`);
        if (c !== null) plot(t, x, y, c);
        continue;
      }
      const gx = h(x + 1, y) - h(x - 1, y);
      const gy = h(x, y + 1) - h(x, y - 1);
      const gx2 = h(x + 2, y) - h(x - 2, y);
      const gy2 = h(x, y + 2) - h(x, y - 2);
      let v = 0.5 + (opts.bias ?? 0);
      v += ((gx + gy) * 0.16 + (gx2 + gy2) * 0.05) * (opts.edge ?? 1);
      v += (Math.min(cap, d[y * W + x]) - 1.5) * 0.06;
      v += (r.next() - 0.5) * (opts.noise ?? 0);
      if (smooth) v += (smooth[y * 16 + x] - 0.5) * (opts.cluster ?? 0);
      const k = Math.max(0, Math.min(n - 1, Math.floor(v * n)));
      plot(t, x, y, ramp[k]);
    }
  if (outlineColor !== null) outline4(t, outlineColor);
  return t;
}


/** Mask rows from a predicate over pixel centers. */
export function maskFn(f: (x: number, y: number) => boolean, ch = 'X'): string[] {
  const rows: string[] = [];
  for (let y = 0; y < 16; y++) {
    let r = '';
    for (let x = 0; x < 16; x++) r += f(x + 0.5, y + 0.5) ? ch : '.';
    rows.push(r);
  }
  return rows;
}

/** Rotated ellipse predicate (angle in degrees, counter-clockwise on screen). */
export function inEllipse(cx: number, cy: number, rx: number, ry: number, deg = 0): (x: number, y: number) => boolean {
  const a = (-deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return (x, y) => {
    const dx = x - cx, dy = y - cy;
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1;
  };
}

/** Union / edit masks: returns a new mask where `b`'s non-'.' chars overwrite `a`. */
export function maskOver(a: string[], b: string[]): string[] {
  return a.map((row, y) => {
    let r = '';
    for (let x = 0; x < 16; x++) {
      const cb = b[y]?.[x] ?? '.';
      r += cb !== '.' && cb !== ' ' ? cb : row[x] ?? '.';
    }
    return r;
  });
}

/** Per-pixel edit of an image by predicate. */
export function paint(t: TexImage, f: (x: number, y: number, c: number) => number | null | undefined): TexImage {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!getA(t, x, y)) continue;
      const r = f(x, y, getPx(t, x, y));
      if (r !== null && r !== undefined) plot(t, x, y, r);
    }
  return t;
}

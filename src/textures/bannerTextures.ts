// Banner textures (vanilla textures/entity/banner_base.png and textures/entity/banner/<pattern>.png, all 64x64 in
// BannerRenderer's box-UV layout). The pole and bar are wood; the flag is 20x40 cloth. Each pattern is a mask over
// the flag's front, mirrored onto its back (the cloth shows through) and carried round its edges; BannerRenderer
// draws the base colour's mask and then every layer's, each tinted by its dye. Here the layers are composited once
// per design into one texture (the same picture, one draw). The masks are this game's own drawings of vanilla's
// charges, in vanilla's places and proportions.

import { img, cloneImg, rgbOf, valueNoise, Rand, type TexImage } from './tex';
import { DYE } from './dyes';
import type { BannerLayer } from '../item/item';

/** the flag's front face (vanilla flag cube: 20x40x1 at texOffs 0,0) */
export const FLAG_W = 20;
export const FLAG_H = 40;
const N = FLAG_W * FLAG_H;

// ---------------------------------------------------------------------------
// The cloth: a faint weave all the layers share, so a dyed layer keeps the cloth's grain

let clothCache: Float32Array | null = null;

/** brightness of the cloth at each front pixel (0.84..1) */
function cloth(): Float32Array {
  if (clothCache) return clothCache;
  const r = new Rand(0xba77e4);
  const coarse = valueNoise(r, FLAG_W, FLAG_H, 5, 8);
  const fine = valueNoise(r, FLAG_W, FLAG_H, 1, 1, false);
  const out = new Float32Array(N);
  for (let y = 0; y < FLAG_H; y++)
    for (let x = 0; x < FLAG_W; x++) {
      const i = y * FLAG_W + x;
      // the weave: every other thread a touch darker, with a slow unevenness over the cloth
      const weave = (x + y) % 2 ? 0 : 0.015;
      out[i] = Math.min(1, 0.9 + 0.07 * coarse[i] + 0.04 * fine[i] - weave);
    }
  clothCache = out;
  return out;
}

// ---------------------------------------------------------------------------
// The patterns' masks over the front (x 0..19 left to right as seen from the front, y 0..39 top to bottom)

type Shape = (px: number, py: number, x: number, y: number) => number | boolean;

const cx = FLAG_W / 2, cy = FLAG_H / 2;
/** thirds of the height and width (vanilla's chief, fess and base; pales) */
const TOP = 13, BOTTOM = 27, LEFT = 7, RIGHT = 13;
/** a canton: half the width by a third of the height */
const CANTON_W = 10;

/** a band `half` wide (measured across) about the line through (x0, 0) and (x1, 40) */
function band(px: number, py: number, x0: number, x1: number, half: number): boolean {
  const lx = x0 + ((x1 - x0) * py) / FLAG_H;
  return Math.abs(px - lx) < half;
}

/** vanilla's indented edge: five teeth, four pixels apart */
function tooth(px: number): number {
  return 6 - Math.abs((px % 4) - 2) * 2;
}

/** the bordure indented's inward depth at `t` along an edge */
function curl(t: number): number {
  return [1, 2, 3, 2][Math.floor(t) % 4];
}

/** the globe's lands, over its middle (x 3..16, y 13..26) */
// prettier-ignore
const GLOBE_LANDS = [
  '..............',
  '...XXX........',
  '..XXXXX...XX..',
  '.XXXXXX..XXXX.',
  '.XXXXX...XXXX.',
  '..XXX.....XX..',
  '...XX.........',
  '....XX........',
  '....XXX...XX..',
  '.....XX..XXXX.',
  '.....X...XXX..',
  '..........X...',
  '..............',
  '..............',
];

const SHAPES: Record<string, Shape> = {
  base: () => true,
  square_bottom_left: (_px, _py, x, y) => x < CANTON_W && y >= BOTTOM,
  square_bottom_right: (_px, _py, x, y) => x >= FLAG_W - CANTON_W && y >= BOTTOM,
  square_top_left: (_px, _py, x, y) => x < CANTON_W && y < TOP,
  square_top_right: (_px, _py, x, y) => x >= FLAG_W - CANTON_W && y < TOP,
  stripe_bottom: (_px, _py, _x, y) => y >= BOTTOM,
  stripe_top: (_px, _py, _x, y) => y < TOP,
  stripe_left: (_px, _py, x) => x < LEFT,
  stripe_right: (_px, _py, x) => x >= RIGHT,
  stripe_center: (_px, _py, x) => x >= LEFT && x < RIGHT,
  stripe_middle: (_px, _py, _x, y) => y >= TOP && y < BOTTOM,
  stripe_downright: (px, py) => band(px, py, 0, FLAG_W, 3),
  stripe_downleft: (px, py) => band(px, py, FLAG_W, 0, 3),
  small_stripes: (_px, _py, x) => x % 4 === 1 || x % 4 === 2,
  cross: (px, py) => band(px, py, 0, FLAG_W, 2) || band(px, py, FLAG_W, 0, 2),
  straight_cross: (_px, _py, x, y) => (x >= 8 && x < 12) || (y >= 18 && y < 22),
  triangle_bottom: (px, py) => py > BOTTOM + Math.abs(px - cx) * 1.3,
  triangle_top: (px, py) => py < TOP - Math.abs(px - cx) * 1.3,
  triangles_bottom: (px, py) => py > FLAG_H - tooth(px),
  triangles_top: (px, py) => py < tooth(px),
  diagonal_left: (px, py) => px / FLAG_W + py / FLAG_H < 1,
  diagonal_right: (px, py) => py / FLAG_H < px / FLAG_W,
  diagonal_up_left: (px, py) => py / FLAG_H > px / FLAG_W,
  diagonal_up_right: (px, py) => px / FLAG_W + py / FLAG_H > 1,
  circle: (px, py) => (px - cx) ** 2 + (py - cy) ** 2 < 5.2 ** 2,
  rhombus: (px, py) => Math.abs(px - cx) / 7 + Math.abs(py - cy) / 14 < 1,
  half_vertical: (px) => px < cx,
  half_horizontal: (_px, py) => py < cy,
  half_vertical_right: (px) => px > cx,
  half_horizontal_bottom: (_px, py) => py > cy,
  border: (_px, _py, x, y) => x === 0 || y === 0 || x === FLAG_W - 1 || y === FLAG_H - 1,
  curly_border: (_px, _py, x, y) =>
    x < curl(y) || FLAG_W - 1 - x < curl(y) || y < curl(x) || FLAG_H - 1 - y < curl(x),
  // (the gradients fade row by row: the colour at the top, or the bottom, gone by the other end)
  gradient: (_px, py) => 1 - py / FLAG_H,
  gradient_up: (_px, py) => py / FLAG_H,
  // courses of bricks four pixels high, the mortar in the colour
  bricks: (_px, _py, x, y) => y % 4 === 0 || (x + (Math.floor(y / 4) % 2 ? 0 : 3)) % 6 === 0,
  flower: (px, py) => {
    const r = Math.hypot(px - cx, py - cy);
    if (r < 1.3) return false;
    if (r < 2.9) return true;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      if (Math.hypot(px - cx - Math.cos(a) * 5.4, py - cy - Math.sin(a) * 5.4) < 1.9) return true;
    }
    return false;
  },
  // a globe: its rim, and the lands on it
  globe: (px, py, x, y) => {
    const r = Math.hypot(px - cx, py - cy);
    if (r >= 7.6) return false;
    if (r >= 6.6) return true;
    return GLOBE_LANDS[y - 13]?.[x - 3] === 'X';
  },
  // a spiral wound out from the middle
  flow: (px, py) => {
    const dx = px - cx, dy = py - cy;
    const r = Math.hypot(dx, dy);
    if (r > 8.6) return false;
    const pitch = 3.4;
    const th = Math.atan2(dy, dx) / (2 * Math.PI) + 0.5;
    const d = (((r / pitch - th) % 1) + 1) % 1;
    return d < 0.42 && r > 0.8;
  },
};

/** the charges, drawn pixel by pixel ('X': the colour), and where their top-left corner goes */
const CHARGES: Record<string, [number, number, string[]]> = {
  // the creeper's face: its eyes and mouth
  creeper: [3, 12, [
    'XXXXX....XXXXX',
    'XXXXX....XXXXX',
    'XXXXX....XXXXX',
    'XXXXX....XXXXX',
    'XXXXX....XXXXX',
    '.....XXXX.....',
    '.....XXXX.....',
    '.....XXXX.....',
    '..XXXXXXXXXX..',
    '..XXXXXXXXXX..',
    '..XXXXXXXXXX..',
    '..XXXXXXXXXX..',
    '..XXXXXXXXXX..',
    '..XXX....XXX..',
    '..XXX....XXX..',
    '..XXX....XXX..',
  ]],
  // a skull over crossed bones
  skull: [2, 8, [
    '.....XXXXXX.....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XX...XX...XX..',
    '..XX...XX...XX..',
    '..XX...XX...XX..',
    '..XXXXXXXXXXXX..',
    '...XXXX..XXXX...',
    '....XXXXXXXX....',
    '....X.X..X.X....',
    '....XXXXXXXX....',
    '................',
    '.X............X.',
    'XXX..........XXX',
    '.XXX........XXX.',
    '...XXX....XXX...',
    '.....XXXXXX.....',
    '......XXXX......',
    '.....XXXXXX.....',
    '...XXX....XXX...',
    '.XXX........XXX.',
    'XXX..........XXX',
    '.X............X.',
  ]],
  // "the Thing": an emblem in a rounded frame (this game's own)
  mojang: [3, 13, [
    '..XXXXXXXXXX..',
    '.X..........X.',
    'X............X',
    'X.XX......XX.X',
    'X.XXX....XXX.X',
    'X.XX.X..X.XX.X',
    'X.XX..XX..XX.X',
    'X.XX......XX.X',
    'X.XX......XX.X',
    'X.XX......XX.X',
    'X.XX......XX.X',
    'X............X',
    '.X..........X.',
    '..XXXXXXXXXX..',
  ]],
  // a piglin's snout: the nose with its nostrils, and the tusks under it
  piglin: [3, 15, [
    '..XXXXXXXXXX..',
    '.XXXXXXXXXXXX.',
    'XXXXXXXXXXXXXX',
    'XXX..XXXX..XXX',
    'XXX..XXXX..XXX',
    'XXXXXXXXXXXXXX',
    '.XXXXXXXXXXXX.',
    '..XXXXXXXXXX..',
    '..X........X..',
    '..X........X..',
  ]],
  // a gust: the wind's curls
  guster: [2, 12, [
    '....XXXXXX......',
    '..XX......X.....',
    '.X...XXX...X....',
    '.X..X...X..X....',
    '.X...XX.X..X....',
    '..X.....X.X.....',
    '...XXXXX..XXXXX.',
    '................',
    '.XXXXXXXXXXXXX..',
    '..............X.',
    '...XXXXXXXXX..X.',
    '............XX..',
    '................',
    '.....XXXXXXXXXX.',
    '...............X',
    '..............X.',
  ]],
};

const maskCache = new Map<string, Float32Array>();

/** a pattern's coverage of each front pixel, 0..1 (row by row; an unknown pattern covers nothing) */
export function patternMask(pattern: string): Float32Array {
  let m = maskCache.get(pattern);
  if (m) return m;
  m = new Float32Array(N);
  const shape = SHAPES[pattern];
  const charge = CHARGES[pattern];
  for (let y = 0; y < FLAG_H; y++)
    for (let x = 0; x < FLAG_W; x++) {
      let a = 0;
      if (shape) {
        const v = shape(x + 0.5, y + 0.5, x, y);
        a = typeof v === 'number' ? Math.max(0, Math.min(1, v)) : v ? 1 : 0;
      } else if (charge) {
        const [ox, oy, rows] = charge;
        a = rows[y - oy]?.[x - ox] === 'X' ? 1 : 0;
      }
      m[y * FLAG_W + x] = a;
    }
  maskCache.set(pattern, m);
  return m;
}

// ---------------------------------------------------------------------------
// Where each texel of the flag's cube takes its pixel from (vanilla box UV: the front at (1,1), the back at (22,1)
// mirrored, the edges along the top row and the outer columns)

let flagMapCache: Int16Array | null = null;

/** for each texel of the 64x64 texture, the front pixel it shows (-1: not the flag) */
function flagMap(): Int16Array {
  if (flagMapCache) return flagMapCache;
  const m = new Int16Array(64 * 64).fill(-1);
  const at = (u: number, v: number, x: number, y: number) => (m[v * 64 + u] = y * FLAG_W + x);
  for (let y = 0; y < FLAG_H; y++)
    for (let x = 0; x < FLAG_W; x++) {
      at(1 + x, 1 + y, x, y); // north: the front
      at(22 + x, 1 + y, FLAG_W - 1 - x, y); // south: the back, mirrored
    }
  for (let x = 0; x < FLAG_W; x++) {
    at(1 + x, 0, x, 0); // the top edge
    at(21 + x, 0, x, FLAG_H - 1); // the bottom edge
  }
  for (let y = 0; y < FLAG_H; y++) {
    at(0, 1 + y, 0, y); // west
    at(21, 1 + y, FLAG_W - 1, y); // east
  }
  flagMapCache = m;
  return m;
}

// ---------------------------------------------------------------------------
// The pole and the bar (vanilla banner_base.png: the pole at texOffs 44,0, 2x42x2; the bar at 0,42, 20x2x2)

let baseCache: TexImage | null = null;

const WOOD = [0x6a4f22, 0x7d5f2a, 0x8c6b30, 0x9a7738];

/** the banner's wood, with the flag's place left pale under the base colour */
export function bannerBaseTexture(): TexImage {
  if (baseCache) return baseCache;
  const t = img(64, 64);
  const r = new Rand(0xba7e);
  const grain = valueNoise(r, 64, 64, 1, 6);
  const put = (u: number, v: number, c: number) => {
    const o = (v * 64 + u) * 4;
    const [cr, cg, cb] = rgbOf(c);
    t.data[o] = cr;
    t.data[o + 1] = cg;
    t.data[o + 2] = cb;
    t.data[o + 3] = 255;
  };
  const shade = (g: number) => WOOD[Math.max(0, Math.min(3, Math.floor((g * 0.8 + r.next() * 0.2) * 4)))];
  // the pole: grain running along it (the noise is stretched down the texture)
  for (let v = 0; v < 44; v++) for (let u = 44; u < 52; u++) put(u, v, shade(grain[v * 64 + u]));
  // the bar: grain running across (the same noise, read crosswise)
  for (let v = 42; v < 46; v++) for (let u = 0; u < 44; u++) put(u, v, shade(grain[u * 64 + v]));
  // the flag's cube: pale cloth (the base colour's layer covers it)
  const fm = flagMap(), sh = cloth();
  for (let i = 0; i < 64 * 64; i++) {
    const p = fm[i];
    if (p < 0) continue;
    const c = Math.round(200 * sh[p]);
    put(i % 64, Math.floor(i / 64), (c << 16) | (c << 8) | c);
  }
  baseCache = t;
  return t;
}

// ---------------------------------------------------------------------------
// Compositing (vanilla BannerRenderer.renderPatterns: the base colour's layer, then up to sixteen more, each the
// pattern's texture tinted by DyeColor.getTextureDiffuseColor and blended over what's there)

/** a design's key: its base colour and layers */
export function bannerKey(base: string, layers: readonly BannerLayer[] = []): string {
  return layers.length ? `${base}|${layers.slice(0, 16).map((l) => `${l.pattern}:${l.color}`).join(',')}` : base;
}

/** blend one layer over the flag texels of `t` (`map`: texel → front pixel) */
function paint(t: TexImage, map: Int16Array | null, pattern: string, color: string): void {
  const m = patternMask(pattern), sh = cloth();
  const [dr, dg, db] = rgbOf(DYE[color]?.dye ?? 0xffffff);
  const count = t.w * t.h;
  for (let i = 0; i < count; i++) {
    const p = map ? map[i] : i;
    if (p < 0) continue;
    const a = m[p];
    if (a <= 0) continue;
    const s = sh[p], o = i * 4;
    t.data[o] += (dr * s - t.data[o]) * a;
    t.data[o + 1] += (dg * s - t.data[o + 1]) * a;
    t.data[o + 2] += (db * s - t.data[o + 2]) * a;
  }
}

/** the whole 64x64 texture of a banner: its wood, its base colour and its layers */
export function bannerTexture(base: string, layers: readonly BannerLayer[] = []): TexImage {
  const t = cloneImg(bannerBaseTexture());
  const map = flagMap();
  paint(t, map, 'base', base);
  for (const l of layers.slice(0, 16)) paint(t, map, l.pattern, l.color);
  return t;
}

/** just the flag's front, 20x40 (the loom's preview and its pattern buttons) */
export function flagFront(base: string, layers: readonly BannerLayer[] = []): TexImage {
  const t = img(FLAG_W, FLAG_H);
  for (let i = 3; i < t.data.length; i += 4) t.data[i] = 255;
  paint(t, null, 'base', base);
  for (const l of layers.slice(0, 16)) paint(t, null, l.pattern, l.color);
  return t;
}

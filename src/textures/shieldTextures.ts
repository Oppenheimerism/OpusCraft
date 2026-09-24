// Shield textures (vanilla textures/entity/shield_base_nopattern.png, shield_base.png and entity/shield/<pattern>.png,
// all 64x64 in ShieldModel's box-UV layout: the plate, 12x22x1, at texOffs 0,0 (its front face at 1,1, its back at
// 14,1, the edges round them); the handle, 2x6x6, at 26,0). A plain shield is wooden boards in an iron rim; a
// decorated one has its face painted over: the base colour, then the banner's layers, each tinted by its dye (vanilla
// BannerRenderer.renderPatterns with the shield's pattern textures). The patterns are the banner's masks
// (textures/bannerTextures.ts) laid over the shield's smaller face; all of it is this game's own drawing.

import { img, cloneImg, rgbOf, valueNoise, Rand, type TexImage } from './tex';
import { DYE } from './dyes';
import { FLAG_W, FLAG_H, patternMask } from './bannerTextures';
import type { BannerLayer } from '../item/item';

/** the plate's front face (vanilla plate cube: 12x22x1 at texOffs 0,0) */
export const PLATE_W = 12;
export const PLATE_H = 22;
const N = PLATE_W * PLATE_H;

const WOOD = [0x4a3118, 0x573a1d, 0x644423, 0x714d29, 0x7f5830];
const IRON = { dark: 0x4f4f4f, mid: 0x7b7b7b, light: 0xa3a3a3, glint: 0xc6c6c6 };
const HANDLE = [0x2f1f11, 0x3a2715, 0x46301a];

function put(t: TexImage, u: number, v: number, c: number): void {
  const o = (v * t.w + u) * 4;
  const [r, g, b] = rgbOf(c);
  t.data[o] = r;
  t.data[o + 1] = g;
  t.data[o + 2] = b;
  t.data[o + 3] = 255;
}

/** boards running down the face, a seam between them, the grain along each (w x h, row by row) */
function boards(r: Rand, w: number, h: number, mirror: boolean): number[] {
  const grain = valueNoise(r, w, h, 1, 7);
  const knots = valueNoise(r, w, h, 3, 3);
  const out: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const bx = mirror ? w - 1 - x : x;
      // two boards, their seam a shade in from the middle
      if (bx === Math.floor(w / 2)) {
        out.push(WOOD[0]);
        continue;
      }
      let k = Math.floor(grain[y * w + x] * 3.2) + 1;
      if (knots[y * w + x] > 0.82) k = 0;
      out.push(WOOD[Math.max(0, Math.min(4, k))]);
    }
  return out;
}

/** the iron of the rim at a point along it: lit on the top and left edges, darker down the others */
function rimIron(r: Rand, lit: boolean): number {
  const c = lit ? IRON.light : IRON.mid;
  return r.next() < 0.12 ? (lit ? IRON.glint : IRON.dark) : c;
}

let plainCache: TexImage | null = null;
let baseCache: TexImage | null = null;

/** the parts every shield shares: the back, the edges and the handle (the front left for the caller) */
function frame(): TexImage {
  const t = img(64, 64);
  const r = new Rand(0x5417d);
  // the back: the boards from behind, in the rim
  const back = boards(r, PLATE_W, PLATE_H, true);
  for (let y = 0; y < PLATE_H; y++)
    for (let x = 0; x < PLATE_W; x++) {
      const rim = x === 0 || y === 0 || x === PLATE_W - 1 || y === PLATE_H - 1;
      put(t, 14 + x, 1 + y, rim ? rimIron(r, false) : back[y * PLATE_W + x]);
    }
  // the edges: iron all round (the top and bottom strips, the two sides)
  for (let x = 0; x < PLATE_W; x++) {
    put(t, 1 + x, 0, rimIron(r, true));
    put(t, 13 + x, 0, rimIron(r, false));
  }
  for (let y = 0; y < PLATE_H; y++) {
    put(t, 0, 1 + y, rimIron(r, true));
    put(t, 13, 1 + y, rimIron(r, false));
  }
  // the handle: dark wood, its grain along it
  const hg = valueNoise(r, 16, 12, 1, 4);
  for (let v = 0; v < 12; v++)
    for (let u = 0; u < 16; u++) {
      const k = Math.max(0, Math.min(2, Math.floor(hg[v * 16 + u] * 3)));
      put(t, 26 + u, v, HANDLE[k]);
    }
  return t;
}

/** vanilla shield_base_nopattern: a plain shield, its face boards in the rim */
export function plainShieldTexture(): TexImage {
  if (plainCache) return plainCache;
  const t = frame();
  const r = new Rand(0xb0a2d);
  const front = boards(r, PLATE_W, PLATE_H, false);
  for (let y = 0; y < PLATE_H; y++)
    for (let x = 0; x < PLATE_W; x++) {
      const rim = x === 0 || y === 0 || x === PLATE_W - 1 || y === PLATE_H - 1;
      put(t, 1 + x, 1 + y, rim ? rimIron(r, x === 0 || y === 0) : front[y * PLATE_W + x]);
    }
  // (a rivet at each corner of the boards)
  for (const [x, y] of [[2, 2], [PLATE_W - 3, 2], [2, PLATE_H - 3], [PLATE_W - 3, PLATE_H - 3]]) put(t, 1 + x, 1 + y, IRON.light);
  plainCache = t;
  return t;
}

/** vanilla shield_base: the same shield, its face left pale for the base colour to cover */
function baseShieldTexture(): TexImage {
  if (baseCache) return baseCache;
  const t = frame();
  for (let y = 0; y < PLATE_H; y++) for (let x = 0; x < PLATE_W; x++) put(t, 1 + x, 1 + y, 0xc8c8c8);
  baseCache = t;
  return t;
}

let shadeCache: Float32Array | null = null;

/** the painted face's brightness (0.86..1): the boards' grain showing faintly through the paint */
function faceShade(): Float32Array {
  if (shadeCache) return shadeCache;
  const r = new Rand(0x5ade);
  const grain = valueNoise(r, PLATE_W, PLATE_H, 1, 6);
  const out = new Float32Array(N);
  for (let y = 0; y < PLATE_H; y++)
    for (let x = 0; x < PLATE_W; x++) {
      const i = y * PLATE_W + x;
      out[i] = x === PLATE_W / 2 ? 0.86 : Math.min(1, 0.92 + 0.08 * grain[i]);
    }
  shadeCache = out;
  return out;
}

/** a pattern's mask over the shield's face: the banner's, each face pixel taking the flag pixel it falls on */
function shieldMask(pattern: string): Float32Array {
  const m = patternMask(pattern);
  const out = new Float32Array(N);
  for (let y = 0; y < PLATE_H; y++)
    for (let x = 0; x < PLATE_W; x++) {
      const fx = Math.min(FLAG_W - 1, Math.floor(((x + 0.5) * FLAG_W) / PLATE_W));
      const fy = Math.min(FLAG_H - 1, Math.floor(((y + 0.5) * FLAG_H) / PLATE_H));
      out[y * PLATE_W + x] = m[fy * FLAG_W + fx];
    }
  return out;
}

/** blend one layer over the face */
function paint(t: TexImage, pattern: string, color: string): void {
  const m = shieldMask(pattern), sh = faceShade();
  const [dr, dg, db] = rgbOf(DYE[color]?.dye ?? 0xffffff);
  for (let y = 0; y < PLATE_H; y++)
    for (let x = 0; x < PLATE_W; x++) {
      const i = y * PLATE_W + x;
      const a = m[i];
      if (a <= 0) continue;
      const s = sh[i], o = ((1 + y) * 64 + 1 + x) * 4;
      t.data[o] += (dr * s - t.data[o]) * a;
      t.data[o + 1] += (dg * s - t.data[o + 1]) * a;
      t.data[o + 2] += (db * s - t.data[o + 2]) * a;
    }
}

/** a design's key: plain, or the base colour and layers */
export function shieldKey(base: string | null, layers: readonly BannerLayer[] = []): string {
  if (!base && !layers.length) return 'plain';
  return `${base ?? 'white'}|${layers.slice(0, 16).map((l) => `${l.pattern}:${l.color}`).join(',')}`;
}

/**
 * the whole 64x64 texture of a shield (vanilla BlockEntityWithoutLevelRenderer: the plain one when it has neither a
 * base colour nor patterns; otherwise the base colour, white if it has none, and up to sixteen layers)
 */
export function shieldTexture(base: string | null, layers: readonly BannerLayer[] = []): TexImage {
  if (!base && !layers.length) return plainShieldTexture();
  const t = cloneImg(baseShieldTexture());
  paint(t, 'base', base ?? 'white');
  for (const l of layers.slice(0, 16)) paint(t, l.pattern, l.color);
  return t;
}

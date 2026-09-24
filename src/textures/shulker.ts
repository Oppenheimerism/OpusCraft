// The shulker's shell (vanilla textures/entity/shulker/shulker.png and shulker_<colour>.png, 64x64): the lid and the
// base of a shulker box and of the mob alike, and the mob's little head inside. The box's item and its break
// specks use 16x16 cuts of the same shell in the block atlas (vanilla block/<colour>_shulker_box).
//
// The layout is ShulkerModel's: the lid (texOffs 0,0, 16x12x16), the base (0,28, 16x8x16), the head (0,52, 6x6x6).
// Each box's six faces sit in the vanilla box-UV strip: its top and bottom side by side over its four sides.

import { TexImage, TexDef, img, setPx, getPx, mixC, mulC, Rand } from './tex';
import { rng } from './blocklib/core';

export const SHULKER_TEX_W = 64;
export const SHULKER_TEX_H = 64;

/** the shells' colours: vanilla's own lavender for the undyed one, then each dye's (DyeColor order) */
export const SHULKER_SHELL: Record<string, number> = {
  '': 0x976d97,
  white: 0xdfe3e3,
  orange: 0xe9711a,
  magenta: 0xae3aa6,
  light_blue: 0x32a4d2,
  yellow: 0xf5c42a,
  lime: 0x67ae1f,
  pink: 0xe98aab,
  gray: 0x40474a,
  light_gray: 0x8b8b86,
  cyan: 0x167d89,
  purple: 0x7a2ca6,
  blue: 0x2f3191,
  brown: 0x6d4628,
  green: 0x4f671b,
  red: 0x9d2622,
  black: 0x222227,
};

interface Shades {
  /** dark edge → highlight */
  e0: number;
  e1: number;
  e2: number;
  m: number;
  l1: number;
  l2: number;
  /** the dim inside of the shell */
  in0: number;
  in1: number;
}

function shades(c: number): Shades {
  return {
    e0: mulC(c, 0.5),
    e1: mulC(c, 0.66),
    e2: mulC(c, 0.82),
    m: c,
    l1: mixC(c, 0xffffff, 0.13),
    l2: mixC(c, 0xffffff, 0.26),
    in0: mulC(c, 0.34),
    in1: mulC(c, 0.45),
  };
}

/** a little mottling: now and then a pixel a shade lighter or darker */
function mottle(r: Rand, c: number, s: Shades): number {
  const v = r.next();
  if (v < 0.08) return c === s.m ? s.l1 : mixC(c, s.l1, 0.5);
  if (v < 0.15) return c === s.m ? s.e2 : mixC(c, s.e2, 0.5);
  return c;
}

/** the lid's top: a plate rimmed in light, with rings of paler scales round a plain middle */
function lidTop(t: TexImage, ox: number, oy: number, r: Rand, s: Shades): void {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      const nearLight = x <= y ? x === e : y === e;
      let c: number;
      if (e === 0) c = s.e1;
      else if (e === 1) c = nearLight ? s.l2 : s.l1;
      else if (e === 2) c = s.m;
      else if (e === 3) c = (x + y) % 3 === 0 ? s.l1 : s.m;
      else if (e === 4) c = s.e2;
      else if (e === 5) c = nearLight ? s.l1 : s.m;
      else c = s.m;
      setPx(t, ox + x, oy + y, e >= 2 ? mottle(r, c, s) : c);
    }
}

/**
 * one side of the lid (16 x 12): lit along its top edge, the shell down its face, then the skirt that closes over the
 * base, dark at its lip — the seam a quarter of the way up a closed box
 */
function lidSide(t: TexImage, ox: number, oy: number, r: Rand, s: Shades): void {
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 16; x++) {
      const edge = x === 0 || x === 15;
      let c: number;
      if (y === 0) c = edge ? s.e2 : s.l2;
      else if (y === 1) c = edge ? s.e2 : s.l1;
      else if (y < 8) c = edge ? s.e2 : x % 5 === 2 && y > 2 ? s.l1 : s.m;
      else if (y < 11) c = edge ? s.e1 : s.e2;
      else c = s.e0;
      // (the skirt plain: where it lies over the base's top the two are drawn in the same place, and must agree)
      setPx(t, ox + x, oy + y, y > 1 && y < 8 && !edge ? mottle(r, c, s) : c);
    }
}

/** one side of the base (16 x 8): its top half, hidden under the lid when shut, matches the lid's skirt */
function baseSide(t: TexImage, ox: number, oy: number, r: Rand, s: Shades): void {
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 16; x++) {
      const edge = x === 0 || x === 15;
      let c: number;
      if (y < 3) c = edge ? s.e1 : s.e2;
      else if (y === 3) c = s.e0;
      else if (y === 4) c = edge ? s.e2 : s.l1;
      else if (y < 7) c = edge ? s.e2 : s.m;
      else c = s.e1;
      setPx(t, ox + x, oy + y, y > 4 && y < 7 && !edge ? mottle(r, c, s) : c);
    }
}

/** an inside face (the lid's underside, the base's floor): dim, rimmed by the shell's edge */
function inside(t: TexImage, ox: number, oy: number, r: Rand, s: Shades, rim: number): void {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      const c = e === 0 ? rim : e === 1 ? s.in1 : r.chance(0.12) ? s.in1 : s.in0;
      setPx(t, ox + x, oy + y, c);
    }
}

/** the base's underside: the shell, rimmed darker */
function baseBottom(t: TexImage, ox: number, oy: number, r: Rand, s: Shades): void {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      const c = e === 0 ? s.e1 : e === 1 ? s.e2 : s.m;
      setPx(t, ox + x, oy + y, e >= 1 ? mottle(r, c, s) : c);
    }
}

/** the head's pale yellow flesh, dark → light */
const HEAD = [0x8f8a52, 0xb0aa6c, 0xcbc486, 0xdcd69a, 0xe9e4b2];
const EYE = 0x1c1620;

/** the head (6x6x6 at 0,52): its top and bottom, then its sides, the face (north, toward whoever it looks at) with eyes */
function head(t: TexImage, r: Rand): void {
  const face = (ox: number, oy: number, eyes: boolean, top: boolean) => {
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 6; x++) {
        const e = Math.min(x, y, 5 - x, 5 - y);
        let k = e === 0 ? 2 : 3;
        if (!top && y === 5) k = 1;
        if (!top && y === 0) k = 4;
        if (e > 0 && r.chance(0.15)) k = r.chance(0.5) ? 4 : 2;
        setPx(t, ox + x, oy + y, HEAD[k]);
      }
    if (eyes)
      for (const ex of [1, 4]) {
        setPx(t, ox + ex, oy + 2, EYE);
        setPx(t, ox + ex, oy + 3, EYE);
      }
  };
  face(6, 52, false, true);
  face(12, 52, false, true);
  face(0, 58, false, false);
  face(6, 58, true, false);
  face(12, 58, false, false);
  face(18, 58, false, false);
}

const CACHE = new Map<string, TexImage>();

/** vanilla shulker.png (`color` '' or null) or shulker_<color>.png */
export function shulkerTexture(color: string | null): TexImage {
  const key = color ?? '';
  let t = CACHE.get(key);
  if (t) return t;
  const s = shades(SHULKER_SHELL[key] ?? SHULKER_SHELL['']);
  const r = rng('shulker_' + (key || 'purple'));
  t = img(SHULKER_TEX_W, SHULKER_TEX_H);
  // the lid: top, underside, then its four sides
  lidTop(t, 16, 0, r, s);
  inside(t, 32, 0, r, s, s.e1);
  for (let i = 0; i < 4; i++) lidSide(t, i * 16, 16, r, s);
  // the base: its floor inside, its underside, its four sides
  inside(t, 16, 28, r, s, s.e2);
  baseBottom(t, 32, 28, r, s);
  for (let i = 0; i < 4; i++) baseSide(t, i * 16, 44, r, s);
  head(t, rng('shulker_head'));
  CACHE.set(key, t);
  return t;
}

/** a 16x16 cut of `src` (a face of the shell) */
function cut(src: TexImage, rows: [number, number, number, number][]): TexImage {
  const t = img();
  let y = 0;
  for (const [sx, sy, w, h] of rows) {
    for (let j = 0; j < h; j++, y++) for (let i = 0; i < w; i++) setPx(t, i, y, getPx(src, sx + i, sy + j));
  }
  return t;
}

/**
 * the shut box's faces for the block atlas, `name` its block's: `name` its side (the lid down to its lip over the
 * base's foot), `name_top` and `name_bottom` — the item's model, and the specks it breaks into (vanilla
 * block/<colour>_shulker_box)
 */
export function registerShulkerBoxTextures(T: Record<string, () => TexDef>, names: [string, string | null][]): void {
  for (const [name, color] of names) {
    T[name] = () => cut(shulkerTexture(color), [[16, 16, 16, 12], [16, 48, 16, 4]]);
    T[`${name}_top`] = () => cut(shulkerTexture(color), [[16, 0, 16, 16]]);
    T[`${name}_bottom`] = () => cut(shulkerTexture(color), [[32, 28, 16, 16]]);
  }
}

let SPARK: TexImage | null = null;

/**
 * vanilla textures/entity/shulker/spark.png (64x32), the shulker bullet: three crossed plates (ShulkerBulletModel —
 * 8x8x2 at 0,0, 2x8x8 at 0,10, 8x2x8 at 20,0), each broad face a glow, white at the heart through cream to a pale
 * straw rim; the thin edges cream
 */
export function sparkTexture(): TexImage {
  if (SPARK) return SPARK;
  const t = img(64, 32);
  const RING = [0xe6dca6, 0xf3ecc4, 0xfdf9e4, 0xffffff];
  const broad = (ox: number, oy: number) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) setPx(t, ox + x, oy + y, RING[Math.min(x, y, 7 - x, 7 - y)]);
  };
  const fill = (ox: number, oy: number, w: number, h: number) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPx(t, ox + x, oy + y, RING[1]);
  };
  // the plate across north-south (8x8x2): thin top, bottom and ends, broad faces at 2,2 and 12,2
  fill(2, 0, 16, 2);
  fill(0, 2, 2, 8);
  fill(10, 2, 2, 8);
  broad(2, 2);
  broad(12, 2);
  // the plate across east-west (2x8x8): thin top and bottom, and ends; broad faces at 0,18 and 10,18
  fill(8, 10, 4, 8);
  fill(8, 18, 2, 8);
  fill(18, 18, 2, 8);
  broad(0, 18);
  broad(10, 18);
  // the flat plate (8x2x8): broad top and bottom at 28,0 and 36,0, thin sides below them
  broad(28, 0);
  broad(36, 0);
  fill(20, 8, 32, 2);
  SPARK = t;
  return t;
}

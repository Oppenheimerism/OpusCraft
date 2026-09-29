// Signs' textures, drawn in code: each wood's sign sheet (vanilla entity/signs/<wood>.png, 64×32: the board's six
// faces laid out for a 24×12×2 box at 0,0 and the stick's for a 2×14×2 box at 0,14) and hanging sign sheet (vanilla
// entity/signs/hanging/<wood>.png, 64×32: the bracket's 16×2×4 box at 0,0, the chains at 0,6, 6,6 and 14,6, the board's
// 14×10×2 box at 0,12), the hanging sign editor's picture (vanilla gui/hanging_signs/<wood>.png, 16×16) and the
// hanging sign items. A sign is its planks with the stick of its log; a hanging sign is its stripped log on grey chains.
// Bamboo has no blocks of its own here yet: its planks and stripped block are drawn here too, for its signs' specks.

import { TexImage, img, setPx, getPx, getA, mixC, mulC, type TexDef } from './tex';
import * as WD from './blocklib/wood';
import { NETHER_WOOD } from './blocklib/netherFlora';
import { spr } from './itemlib/common';
import { SIGN_WOODS, type SignWood } from '../world/blocksSigns';

interface SignPalette {
  /** the planks' ramp, dark to light ([0] the gap between boards) */
  planks: number[];
  /** the stripped log's */
  stripped: number[];
  /** the log's bark */
  bark: number[];
}

const BAMBOO: SignPalette = {
  planks: [0x7a6a24, 0xa8933f, 0xb9a34b, 0xc7b256, 0xd4c061, 0xdfcc6e],
  stripped: [0x87782b, 0xb1a044, 0xc0ae51, 0xcdbb5d, 0xd9c869, 0xe4d476],
  bark: [0x4b5713, 0x5e6d19, 0x718421, 0x849a2a, 0x97af33, 0xa8c13e],
};

/** vanilla's stripped crimson and warped stems (textures/blocklib/netherFlora.ts's STRIPPED) */
const NETHER_STRIPPED: Record<'crimson' | 'warped', number[]> = {
  crimson: [0x5c1e3a, 0x7a2b4e, 0x873257, 0x93395f, 0x9f4168, 0xab4a72],
  warped: [0x1f5550, 0x2c7a72, 0x33867e, 0x3a9189, 0x429d94, 0x4ba89f],
};

export function signPalette(w: SignWood): SignPalette {
  if (w === 'bamboo') return BAMBOO;
  if (w === 'crimson' || w === 'warped') return { planks: NETHER_WOOD[w].wood, stripped: NETHER_STRIPPED[w], bark: NETHER_WOOD[w].bark };
  const d = WD.WOOD[w];
  return { planks: d.wood, stripped: d.wood, bark: d.bark };
}

const def = (ramp: number[]): WD.WoodDef => ({ bark: ramp, wood: ramp, ring: [ramp[4], ramp[3], ramp[2]] });

/** a wood's planks, as its block's texture has them (bamboo's drawn here) */
function planksOf(w: SignWood): TexImage {
  return WD.planks(`${w}_planks`, def(signPalette(w).planks));
}

/** a wood's stripped log side (vertical grain) */
function strippedOf(w: SignWood): TexImage {
  return WD.strippedSide(`stripped_${w}_sign`, def(signPalette(w).stripped));
}

/** a wood's bark as a stick's grain (vertical) */
function barkOf(w: SignWood): TexImage {
  return WD.strippedSide(`${w}_sign_stick`, def(signPalette(w).bark));
}

/** copy `src` (wrapped) into the rectangle, turned a quarter if `turn` (grain running along it), darkened by `f` */
function paintRect(t: TexImage, src: TexImage, x0: number, y0: number, w: number, h: number, turn = false, f = 1, ox = 0, oy = 0): void {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = turn ? y + oy : x + ox, sy = turn ? x + ox : y + oy;
      const c = getPx(src, ((sx % src.w) + src.w) % src.w, ((sy % src.h) + src.h) % src.h);
      setPx(t, x0 + x, y0 + y, f === 1 ? c : mulC(c, f));
    }
}

/** darken a rectangle's rim (a board's edge) */
function rim(t: TexImage, x0: number, y0: number, w: number, h: number, f: number): void {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) continue;
      setPx(t, x0 + x, y0 + y, mulC(getPx(t, x0 + x, y0 + y), f));
    }
}

/** vanilla ModelPart.Cube's box UV: the six faces of a w×h×d box at (u, v), each filled by `face(x0, y0, fw, fh, side)` */
function boxFaces(u: number, v: number, w: number, h: number, d: number, face: (x0: number, y0: number, fw: number, fh: number, side: 'top' | 'bottom' | 'west' | 'north' | 'east' | 'south') => void): void {
  if (d > 0) {
    face(u + d, v, w, d, 'top');
    face(u + d + w, v, w, d, 'bottom');
  }
  face(u, v + d, d, h, 'west');
  face(u + d, v + d, w, h, 'north');
  face(u + d + w, v + d, d, h, 'east');
  face(u + d + w + d, v + d, w, h, 'south');
}

/** vanilla entity/signs/<wood>.png: the board of planks, the stick of the log */
export function signTexture(w: SignWood): TexImage {
  const t = img(64, 32);
  const planks = planksOf(w), bark = barkOf(w);
  boxFaces(0, 0, 24, 12, 2, (x0, y0, fw, fh, side) => {
    if (fw <= 0 || fh <= 0) return;
    const ends = side === 'west' || side === 'east';
    paintRect(t, planks, x0, y0, fw, fh, false, side === 'bottom' ? 0.8 : ends ? 0.88 : 1, side === 'south' ? 5 : 0, side === 'top' || side === 'bottom' ? 1 : 0);
    if (side === 'north' || side === 'south') rim(t, x0, y0, fw, fh, 0.9);
  });
  boxFaces(0, 14, 2, 14, 2, (x0, y0, fw, fh, side) => {
    if (fw <= 0 || fh <= 0) return;
    paintRect(t, bark, x0, y0, fw, fh, false, side === 'top' || side === 'bottom' ? 0.8 : 1, x0);
  });
  return t;
}

/** chain links, a column two pixels wide down a face (dark rim, light face), starting at link phase `phase` */
function chainColumn(t: TexImage, x: number, y0: number, h: number, phase: number): void {
  const dark = 0x2c2f37, mid = 0x4d525d, light = 0x7c8290;
  for (let y = 0; y < h; y++) {
    const k = (y + phase) % 4;
    // (a link seen edge on, then face on: 2 rows each)
    if (k < 2) {
      setPx(t, x, y0 + y, k === 0 ? mid : dark);
      setPx(t, x + 1, y0 + y, k === 0 ? light : mid);
    } else setPx(t, x + (k === 2 ? 0 : 1), y0 + y, k === 2 ? light : mid);
  }
}

/** vanilla entity/signs/hanging/<wood>.png */
export function hangingSignTexture(w: SignWood): TexImage {
  const t = img(64, 32);
  const stripped = strippedOf(w);
  const p = signPalette(w);
  // the bracket: the stripped log turned along it, its ends the log's rings
  boxFaces(0, 0, 16, 2, 4, (x0, y0, fw, fh, side) => {
    if (fw <= 0 || fh <= 0) return;
    if (side === 'west' || side === 'east') {
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) setPx(t, x0 + x, y0 + y, (x + y) % 3 === 0 ? p.stripped[2] : p.stripped[3]);
      return;
    }
    paintRect(t, stripped, x0, y0, fw, fh, true, side === 'bottom' ? 0.78 : 1, x0);
    rim(t, x0, y0, fw, fh, 0.85);
  });
  // the straight chains, each a pair of crossed planes (chainL1 and chainL2 at 0,6 and 6,6: three wide, six tall)
  for (const u of [0, 3, 6, 9]) chainColumn(t, u + 1, 6, 6, u % 2);
  // the vee of chains (vChains at 14,6: twelve wide, six tall, both faces): from the middle of the top out to the ends
  for (const u of [14, 26]) {
    for (let y = 0; y < 6; y++) {
      const off = Math.round((y / 5) * 4.5);
      const dark = y % 2 === 0 ? 0x4d525d : 0x7c8290;
      setPx(t, u + 5 - off, 6 + y, dark);
      setPx(t, u + 6 + off, 6 + y, dark);
      if (y % 2 === 1) {
        setPx(t, u + 4 - off, 6 + y, 0x2c2f37);
        setPx(t, u + 7 + off, 6 + y, 0x2c2f37);
      }
    }
  }
  // the board: stripped log, a darker frame round each face
  boxFaces(0, 12, 14, 10, 2, (x0, y0, fw, fh, side) => {
    if (fw <= 0 || fh <= 0) return;
    const face = side === 'north' || side === 'south';
    paintRect(t, stripped, x0, y0, fw, fh, !face, side === 'bottom' ? 0.8 : side === 'west' || side === 'east' ? 0.88 : 1, side === 'south' ? 7 : x0, 2);
    if (face) {
      rim(t, x0, y0, fw, fh, 0.72);
    }
  });
  return t;
}

/** vanilla gui/hanging_signs/<wood>.png: the hanging sign seen from the front, for its editor */
export function hangingSignGuiTexture(w: SignWood): TexImage {
  const t = img(16, 16);
  const stripped = strippedOf(w);
  chainColumn(t, 3, 0, 6, 0);
  chainColumn(t, 11, 0, 6, 0);
  paintRect(t, stripped, 1, 6, 14, 10, false, 1, 3, 2);
  rim(t, 1, 6, 14, 10, 0.72);
  return t;
}

// prettier-ignore
const HANGING_SIGN_ITEM = [
  '................',
  '...##......##...',
  '...cd......cd...',
  '...dc......dc...',
  '...cd......cd...',
  '..##############',
  '..#555555555554#',
  '..#433333333332#',
  '..#444444444443#',
  '..#433333333332#',
  '..#333333333332#',
  '..#433333333332#',
  '..#322222222221#',
  '..##############',
  '................',
  '................',
];

/** the hanging sign items (vanilla item/<wood>_hanging_sign.png): a board of the stripped log on two chains */
export const SIGN_ITEMS: Record<string, () => TexImage> = {};
for (const w of SIGN_WOODS) {
  SIGN_ITEMS[`${w}_hanging_sign`] = () => {
    const s = signPalette(w).stripped;
    const t = spr(HANGING_SIGN_ITEM, { '#': mixC(s[0], 0x000000, 0.45), 1: s[1], 2: s[2], 3: s[3], 4: s[4], 5: s[5], c: 0x7c8290, d: 0x3c404a }, `${w}_hanging_sign`);
    // (shifted a pixel left, to sit in the middle)
    const out = img(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 1; x < 16; x++) if (getA(t, x, y)) setPx(out, x - 1, y, getPx(t, x, y));
    return out;
  };
}

/** the block textures bamboo's signs need for their specks (only if nothing else has drawn them) */
export function registerSignTextures(T: Record<string, () => TexDef>): void {
  T['bamboo_planks'] ??= () => planksOf('bamboo');
  T['stripped_bamboo_block'] ??= () => WD.strippedSide('stripped_bamboo_block', def(BAMBOO.stripped));
}

// The ender chest's look (vanilla textures/entity/chest/ender.png, 64x64; our own drawing): obsidian through and
// through, each face framed in the deep green of an ender pearl, a dark seam where the lid meets the body, the inside
// darker still, and for a latch a small green gem.
//
// The sheet's layout is vanilla ChestModel's (the single chest: the lid 14x5x14 at 0,0, the body 14x10x14 at 0,19,
// the lock 2x4x1 at 0,0) with vanilla's box UV. The chest is drawn upright without the flip other models get
// (vanilla ChestRenderer), so each side face lies upside down and back to front in the sheet, and a top with its front
// edge uppermost. The item's model uses 16x16 faces cut to the block model's boxes (block atlas: ender_chest_*).

import { type TexImage, type TexDef, img, setPx, getPx, mixC } from './tex';
import { obsidian } from './blocklib/terrain';

export const ENDER_CHEST_TEX_W = 64;
export const ENDER_CHEST_TEX_H = 64;

/** the pearl-green frame, dark → light */
const RIM = [0x0b2621, 0x123b31, 0x1b5443, 0x277058, 0x3a9274];
/** the latch's gem: frame, then the stone dark → bright */
const GEM = [0x061612, 0x1d7a55, 0x2fa574, 0x5fd8a2, 0xb6f5d6];

/** a colour at column `c` (0 at the viewer's left) and row `r` (0 at the top) of a face seen from outside */
type Painter = (c: number, r: number) => number;

/** a stretch of obsidian `w` x `h`, from a tile seeded `seed` (dimmed by `dim` for the inside) */
function stone(seed: string, dim = 0): Painter {
  const t = obsidian(`ender_chest_${seed}`);
  return (c, r) => {
    const v = getPx(t, c & 15, r & 15);
    return dim ? mixC(v, 0x000000, dim) : v;
  };
}

/** a side of the lid (14 x 5): lit along its top edge, framed at its ends, the seam dark along its foot */
function lidSide(seed: string): Painter {
  const s = stone(seed);
  return (c, r) => {
    if (r === 4) return RIM[0];
    if (r === 0) return c === 0 || c === 13 ? RIM[2] : RIM[4];
    if (c === 0 || c === 13) return RIM[1];
    if (r === 1) return mixC(s(c, r), RIM[3], 0.35);
    return s(c, r);
  };
}

/** a side of the body (14 x 10): the seam dark along its top (under the lid's, drawn in the same place), framed round */
function bodySide(seed: string): Painter {
  const s = stone(seed);
  return (c, r) => {
    if (r === 0) return RIM[0];
    if (r === 9) return RIM[1];
    if (c === 0 || c === 13) return RIM[1];
    if (r === 1) return mixC(s(c, r), RIM[0], 0.5);
    if (c === 1 || c === 12 || r === 8) return mixC(s(c, r), RIM[2], 0.25);
    return s(c, r);
  };
}

/** the lid's top (14 x 14): a bevelled frame, lighter toward the top left, round the obsidian */
function lidTop(seed: string): Painter {
  const s = stone(seed);
  return (c, r) => {
    const e = Math.min(c, r, 13 - c, 13 - r);
    if (e === 0) return RIM[1];
    if (e === 1) return c <= r && c < 13 - r ? RIM[3] : r < c && r < 13 - c ? RIM[4] : RIM[2];
    if (e === 2) return mixC(s(c, r), RIM[1], 0.4);
    return s(c, r);
  };
}

/** an underside or an inside face (14 x 14): dim obsidian in a dark frame */
function inside(seed: string, dim: number): Painter {
  const s = stone(seed, dim);
  return (c, r) => {
    const e = Math.min(c, r, 13 - c, 13 - r);
    return e === 0 ? RIM[0] : e === 1 ? mixC(s(c, r), RIM[0], 0.5) : s(c, r);
  };
}

/** the latch's face (2 x 4): a green gem in a dark setting */
const latchFront: Painter = (c, r) => (r === 0 || r === 3 ? GEM[0] : r === 1 ? (c === 0 ? GEM[4] : GEM[3]) : c === 0 ? GEM[2] : GEM[1]);
/** the latch's edges (its top, bottom, sides) */
const latchEdge: Painter = (_c, r) => (r === 0 ? GEM[1] : GEM[0]);

/** a side face in the sheet: turned half round (vanilla ChestRenderer draws the chest without flipping it) */
function sideRegion(t: TexImage, u: number, v: number, w: number, h: number, p: Painter): void {
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) setPx(t, u + (w - 1 - c), v + (h - 1 - r), p(c, r));
}

/** a top or bottom face in the sheet: seen from above with the front toward the viewer, the front row uppermost */
function flatRegion(t: TexImage, u: number, v: number, w: number, d: number, p: Painter): void {
  for (let r = 0; r < d; r++) for (let c = 0; c < w; c++) setPx(t, u + c, v + (d - 1 - r), p(c, r));
}

let SHEET: TexImage | null = null;

/** vanilla textures/entity/chest/ender.png */
export function enderChestTexture(): TexImage {
  if (SHEET) return SHEET;
  const t = img(ENDER_CHEST_TEX_W, ENDER_CHEST_TEX_H);
  // the lid (texOffs 0,0; 14 x 5 x 14): its underside (the inside, seen when it's up) and top, then its four sides
  flatRegion(t, 14, 0, 14, 14, inside('lid_under', 0.45));
  flatRegion(t, 28, 0, 14, 14, lidTop('lid_top'));
  for (let i = 0; i < 4; i++) sideRegion(t, i * 14, 14, 14, 5, lidSide(`lid_${i}`));
  // the body (texOffs 0,19; 14 x 10 x 14): its underside and its floor inside, then its four sides
  flatRegion(t, 14, 19, 14, 14, inside('under', 0.2));
  flatRegion(t, 28, 19, 14, 14, inside('floor', 0.55));
  for (let i = 0; i < 4; i++) sideRegion(t, i * 14, 33, 14, 10, bodySide(`side_${i}`));
  // the lock (texOffs 0,0; 2 x 4 x 1), in the lid's unused corner: its bottom, top, sides, back and the gem in front
  flatRegion(t, 1, 0, 2, 1, latchEdge);
  flatRegion(t, 3, 0, 2, 1, latchEdge);
  sideRegion(t, 0, 1, 1, 4, latchEdge);
  sideRegion(t, 1, 1, 2, 4, latchEdge);
  sideRegion(t, 3, 1, 1, 4, latchEdge);
  sideRegion(t, 4, 1, 2, 4, latchFront);
  SHEET = t;
  return t;
}

/** a 16x16 block-atlas face with `p` (w x h) drawn upright at (x0, y0) */
function atlasFace(x0: number, y0: number, w: number, h: number, p: Painter, extra?: (t: TexImage) => void): TexImage {
  const t = img();
  // (what the model doesn't show: obsidian, for mipmaps' sake)
  const back = stone('atlas_back');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(t, x, y, back(x, y));
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) setPx(t, x0 + c, y0 + r, p(c, r));
  extra?.(t);
  return t;
}

/**
 * the shut chest's faces for the block atlas, cut to the item model's boxes (world/blocksEnderChest.ts: the body 1..15
 * wide and 0..10 high, the lid 10..14, the latch 7..9 by 7..11): its top and bottom, the body's sides and front, the
 * lid's sides and front, and the latch
 */
export function registerEnderChestTextures(T: Record<string, () => TexDef>): void {
  T['ender_chest_top'] = () => atlasFace(1, 1, 14, 14, lidTop('lid_top'));
  T['ender_chest_bottom'] = () => atlasFace(1, 1, 14, 14, inside('under', 0.2));
  // (the item's lid is 4 high, the body 10: the body's seam row is the lid's foot)
  T['ender_chest_side'] = () => atlasFace(1, 6, 14, 10, bodySide('side_1'));
  T['ender_chest_front'] = () => atlasFace(1, 6, 14, 10, bodySide('side_3'));
  T['ender_chest_lid_side'] = () => atlasFace(1, 2, 14, 4, lidSide('lid_1'));
  T['ender_chest_lid_front'] = () => atlasFace(1, 2, 14, 4, lidSide('lid_3'));
  T['ender_chest_latch'] = () => {
    const t = img();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(t, x, y, GEM[0]);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) setPx(t, 7 + c, 5 + r, latchFront(c, r));
    return t;
  };
}

// The silverfish (vanilla textures/entity/silverfish.png, 64x32, on SilverfishModel's layout): seven grey body
// segments, paler along the back and darker underneath, ringed with dark seams, the head end darkest with a pair of
// feelers; and over the middle three, the bristle layers: tufts of pale grey hair, thick along the top, thinning
// out toward the ground (the cutout lets the body show through between them). Where a layer's face lies in the same
// plane as the segment inside it, the layer is left clear. Original pixel art in the style of vanilla 1.21.

import { TexImage, img, mulC, mixC, Rand } from './tex';
import { MOB_TEXTURES, boxFaces, noiseBox, noiseFace, paintFace, pick, SIDES, type Box, type Pal } from './mobs';

const BODY: Pal = [0x555555, 0x616161, 0x6c6c6c, 0x787878, 0x848484];
const BODY_W: Pal = [1, 3, 5, 3, 1];
const BACK: Pal = [0x7a7a7a, 0x858585, 0x919191, 0x9c9c9c];
const BACK_W: Pal = [2, 4, 3, 1];
const BELLY: Pal = [0x474747, 0x4f4f4f, 0x585858];
const SEAM = 0x3b3b3b;
const HAIR: Pal = [0x7d7d7d, 0x8b8b8b, 0x989898, 0xa6a6a6, 0xb3b3b3];
const HAIR_W: Pal = [2, 4, 4, 2, 1];

/** vanilla SilverfishModel.BODY_SIZES and BODY_TEXS */
const SIZES: [number, number, number][] = [[3, 2, 2], [4, 3, 2], [6, 4, 3], [3, 3, 3], [2, 2, 3], [2, 1, 2], [1, 1, 2]];
const TEXS: [number, number][] = [[0, 0], [0, 4], [0, 9], [0, 16], [0, 22], [11, 0], [13, 4]];

function segment(t: TexImage, r: Rand, i: number): void {
  const [w, h, d] = SIZES[i], [u, v] = TEXS[i];
  const b = boxFaces(u, v, w, h, d);
  noiseBox(t, b, r, BODY, { w: BODY_W, cell: 1 }, SIDES);
  noiseFace(t, b.top, r, BACK, { w: BACK_W, cell: 1 });
  noiseFace(t, b.bottom, r, BELLY, { cell: 1 });
  // the upper row of the sides catches the light like the back; the lowest row is in shadow
  for (const k of SIDES) {
    paintFace(t, b[k], (_x, y, c, _w, hh) => (hh > 1 && y === 0 ? pick(r, BACK, BACK_W) : hh > 1 && y === hh - 1 ? mulC(c, 0.82) : undefined));
  }
  // a dark seam round the rear edge of the segment (the column of each side next to its back face)
  paintFace(t, b.right, (x, _y, c) => (x === 0 ? mixSeam(c) : undefined));
  paintFace(t, b.left, (x, _y, c, fw) => (x === fw - 1 ? mixSeam(c) : undefined));
  paintFace(t, b.top, (_x, y, c) => (y === 0 ? mixSeam(c) : undefined));
}

/** halfway from the pixel to the seam's dark grey */
function mixSeam(c: number): number {
  return mixC(c, SEAM, 0.6);
}

/**
 * a bristle layer: hair everywhere on top, thinning from the top of each side toward its lower edge; `clear` marks
 * the pixels of each face to leave empty (in the plane of the segment inside); the underside is bare
 */
function bristles(t: TexImage, r: Rand, b: Box, clear: Partial<Record<keyof Box, (x: number, y: number) => boolean>>): void {
  noiseFace(t, b.top, r, HAIR, { w: HAIR_W, cell: 1, mask: () => r.chance(0.9) });
  for (const k of SIDES) {
    const [, , , fh] = b[k];
    const cl = clear[k];
    noiseFace(t, b[k], r, HAIR, { w: HAIR_W, cell: 1, mask: (x, y) => !(cl && cl(x, y)) && r.chance(0.92 - 0.62 * (y / Math.max(1, fh - 1))) });
  }
}

function silverfish(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x51f1);
  for (let i = 0; i < 7; i++) segment(t, r, i);
  // the head end: a darker face with the roots of two feelers
  const head = boxFaces(0, 0, 3, 2, 2);
  paintFace(t, head.front, (x, y, c) => (y === 0 && (x === 0 || x === 2) ? 0x2e2e2e : mulC(c, 0.78)));
  // the tail tip, pale
  const tip = boxFaces(13, 4, 1, 1, 2);
  paintFace(t, tip.back, () => 0x8e8e8e);
  // layer 0 (10x8x3, over segment 2: 6x4 across its lower half), layer 1 (6x4x3 over segment 4: 2x2),
  // layer 2 (6x5x2 over segment 1, a little ahead of it: no shared planes but the floor)
  const l0 = boxFaces(20, 0, 10, 8, 3), l1 = boxFaces(20, 11, 6, 4, 3), l2 = boxFaces(20, 18, 6, 5, 2);
  const mid0 = (x: number, y: number) => x >= 2 && x <= 7 && y >= 4;
  bristles(t, r, l0, { front: mid0, back: mid0 });
  const mid1 = (x: number, y: number) => x >= 2 && x <= 3 && y >= 2;
  bristles(t, r, l1, { front: mid1, back: mid1 });
  bristles(t, r, l2, {});
  return t;
}

MOB_TEXTURES.silverfish = silverfish;

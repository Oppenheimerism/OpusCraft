// (trial chambers) The bogged's skins (1.21; vanilla textures/entity/skeleton/bogged.png and bogged_overlay.png): its
// bones on the skeleton's 64x32 layout, damp and grey-green, stained darker in the joints and the ribs, with the
// sprites of its mushrooms beside the arm (a red one, its white-flecked cap on a pale stem, and two brown ones, each
// drawn twice, the second a mirror of the first so it looks the same from either side of its flat card); and over them
// its moss, on the humanoid layout: a cap of it on the skull and strands hanging off the brow, a mantle over the
// shoulders, and clumps on the arms and the shins. Original pixel art in the style of vanilla 1.21.

import { TexImage, img, mulC, mixC, getPx, getA, plot, Rand } from './tex';
import { MOB_TEXTURES, boxFaces, noiseBox, noiseFace, paintFace, drawFace, fleck, pick, SIDES, type FaceName, type Pal } from './mobs';

const BONE: Pal = [0x6e7862, 0x7b866e, 0x89947b, 0x96a187, 0xa2ac92, 0xafb89d];
const BONE_W: Pal = [1, 2, 4, 8, 5, 2];
const STAIN: Pal = [0x55603f, 0x5f6b46, 0x4b5638];
const MOSS: Pal = [0x263d17, 0x2f4a1c, 0x3a5a22, 0x46692a, 0x527833, 0x5f873b];
const MOSS_W: Pal = [1, 3, 5, 5, 3, 1];

/** copy a w x h sprite at (u, v) mirrored left to right to (u + w, v): the back of a flat card */
function mirrorSprite(t: TexImage, u: number, v: number, w: number, h: number): void {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = getA(t, u + x, v + y);
      if (a > 0) plot(t, u + 2 * w - 1 - x, v + y, getPx(t, u + x, v + y), a);
    }
}

function bogged(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0xb066ed);
  const head = boxFaces(0, 0, 8, 8, 8);
  const body = boxFaces(16, 16, 8, 12, 4);
  const arm = boxFaces(40, 16, 2, 12, 2);
  const leg = boxFaces(0, 16, 2, 12, 2);
  // the skull: damp bone, stained along its seams, a hollow stare and a crooked row of teeth
  noiseBox(t, head, r, BONE, { w: BONE_W });
  for (const k of ['top', 'right', 'left', 'back'] as FaceName[]) fleck(t, head[k], r, 0.08, STAIN);
  paintFace(t, head.back, (_x, y, c) => (y >= 6 ? mulC(c, 0.86) : undefined));
  drawFace(t, head.front, [
    '........',
    '..s.....',
    '........',
    '.KK..KK.',
    '.kK..Kk.',
    '...nn...',
    '.DtDtDD.',
    '..s.....',
  ], { K: 0x0a0f08, k: 0x18231a, n: 0x2c3a26, D: 0x1b2616, t: 0x8a957c, s: STAIN }, r);
  // the ribcage and spine: bone ribs over the dark, as the skeleton's
  noiseBox(t, body, r, BONE, { w: BONE_W });
  const RIB = [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1];
  for (const k of SIDES) {
    const spine = k === 'front' || k === 'back';
    paintFace(t, body[k], (x, y, c) => (!RIB[y] && !(spine && (x === 3 || x === 4)) ? null : r.chance(0.07) ? pick(r, STAIN) : undefined));
  }
  // the long bones, darker at the elbows and knees and green at the ends
  for (const b of [arm, leg]) {
    noiseBox(t, b, r, BONE, { w: BONE_W });
    for (const k of SIDES) paintFace(t, b[k], (_x, y, c) => (y === 5 || y === 6 ? mulC(c, 0.84) : y >= 10 && r.chance(0.3) ? pick(r, STAIN) : undefined));
  }
  // the mushrooms (BoggedModel's cards: red at 50,16, brown at 50,22 and at 50,28, each 6x4 with its back beside it)
  const RED: Pal = [0xa3201c, 0xb72a22, 0xc8352a];
  const brown: Pal = [0x7a5638, 0x8a6443, 0x97714d];
  const stem = [0xc9bfa6, 0xb8ad93];
  drawFace(t, [50, 16, 6, 4], [
    '.RRWR.',
    'RWRRRW',
    'd.ss.d',
    '..ss..',
  ], { R: RED, W: 0xe8e2d6, d: 0x6f1612, s: stem }, r);
  drawFace(t, [50, 22, 6, 4], [
    '.BBBB.',
    'BBbBBB',
    'd.ss.d',
    '..ss..',
  ], { B: brown, b: 0xa98260, d: 0x5a3f28, s: stem }, r);
  drawFace(t, [50, 28, 6, 4], [
    '..BB..',
    '.BBbB.',
    '..ss..',
    '..ss..',
  ], { B: brown, b: 0xa98260, s: stem }, r);
  for (const v of [16, 22, 28]) mirrorSprite(t, 50, v, 6, 4);
  return t;
}

/** the bogged's moss, on the humanoid layout (vanilla SkeletonClothingLayer, its limbs 4 wide) */
function boggedOverlay(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0xb066ed0);
  const head = boxFaces(0, 0, 8, 8, 8);
  const hat = boxFaces(32, 0, 8, 8, 8);
  const body = boxFaces(16, 16, 8, 12, 4);
  const arm = boxFaces(40, 16, 4, 12, 4);
  const leg = boxFaces(0, 16, 4, 12, 4);
  const moss = (f: [number, number, number, number], mask: (x: number, y: number, w: number, h: number) => boolean) =>
    noiseFace(t, f, r, MOSS, { w: MOSS_W, cell: 1, mask });
  // a cap of moss over the skull, ragged where it runs down the back and sides; open over the face
  moss(head.top, () => true);
  for (const k of SIDES) {
    const rows = k === 'front' ? 1 : k === 'back' ? 4 : 3;
    moss(head[k], (x, y, w) => (k === 'front' ? y < rows || (y === 1 && (x === 0 || x === w - 1)) : y < rows || (y === rows && r.chance(0.55))));
  }
  // strands hanging off the brow and round the ears (the hat layer), long and thin
  for (const k of SIDES) {
    const cols = new Set<number>();
    for (let i = 0; i < (k === 'front' ? 2 : 3); i++) cols.add(k === 'front' ? (r.chance(0.5) ? r.nextInt(2) : 6 + r.nextInt(2)) : r.nextInt(8));
    const len = [...cols].map(() => 3 + r.nextInt(4));
    const cl = [...cols];
    paintFace(t, hat[k], (x, y) => {
      const i = cl.indexOf(x);
      return i >= 0 && y < len[i] ? pick(r, MOSS, MOSS_W) : undefined;
    });
  }
  // a mantle over the shoulders and down the spine, in clumps on the ribs
  moss(body.top, () => true);
  for (const k of SIDES) {
    const spine = k === 'back';
    moss(body[k], (x, y) => y < 2 || (y === 2 && r.chance(0.6)) || (spine && (x === 3 || x === 4) && y < 7) || (y >= 5 && y <= 8 && r.chance(0.12)));
  }
  // the arms: moss on the shoulders and in a clump round the forearm
  moss(arm.top, () => true);
  for (const k of SIDES) moss(arm[k], (_x, y) => y < 3 || (y === 3 && r.chance(0.5)) || ((y === 8 || y === 9) && r.chance(0.45)));
  // the legs: moss up from the feet over the shins
  moss(leg.bottom, () => true);
  for (const k of SIDES) moss(leg[k], (_x, y) => y >= 8 || (y === 7 && r.chance(0.5)) || (y === 2 && r.chance(0.2)));
  // (damp: the moss darker where it's thick, a few lighter tips)
  for (const f of [head.top, body.top, arm.top]) paintFace(t, f, (_x, _y, c) => (r.chance(0.1) ? mixC(c, 0x7c9a4a, 0.4) : undefined));
  return t;
}

MOB_TEXTURES.bogged = bogged;
MOB_TEXTURES.bogged_overlay = boggedOverlay;

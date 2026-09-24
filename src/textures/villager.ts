// Villager skins (vanilla textures/entity/villager): the base villager, an outfit for each biome type, one for each
// profession and the level badges, all on VillagerModel's 64x64 layout. Vanilla draws them as layers over the one
// model; here they are painted into one texture per look, which draws the same (the layers are cut out, never
// blended). A profession's hat hides the type's head layer the way vanilla's hat metadata does. Original pixel art
// in the style of vanilla 1.21.

import { TexImage, img, cloneImg, plot, clear, mixC, mulC, Rand } from './tex';
import { boxFaces, noiseBox, noiseFace, paintFace, drawFace, fleck, pick, SIDES, type Box, type Face, type FaceName, type Pal } from './mobs';
import type { VillagerType, Profession } from '../entity/villager';

// ---------------------------------------------------------------------------
// the layout (vanilla VillagerModel.createBodyModel)

const HEAD = boxFaces(0, 0, 8, 10, 8);
const HAT = boxFaces(32, 0, 8, 10, 8);
const RIM = boxFaces(30, 47, 16, 16, 1);
const NOSE = boxFaces(24, 0, 2, 4, 2);
const BODY = boxFaces(16, 20, 8, 12, 6);
const JACKET = boxFaces(0, 38, 8, 20, 6);
const ARM = boxFaces(44, 22, 4, 8, 4);
const FOREARMS = boxFaces(40, 38, 8, 4, 4);
const LEG = boxFaces(0, 22, 4, 12, 4);

/** the head, its hat and nose, and the brim: what a hidden head layer leaves out */
const HEAD_REGIONS: Face[] = [[0, 0, 64, 18], [30, 47, 34, 17]];

/** vanilla VillagerMetaDataSection.Hat of each outfit */
type Hat = 'none' | 'partial' | 'full';

const faceRows = (f: Face, from: number, to: number): Face => [f[0], f[1] + from, f[2], Math.min(f[3], to) - from];

/** paint a box's side faces' rows [from, to) with palette noise */
function band(t: TexImage, b: Box, r: Rand, pal: Pal, from: number, to: number, w?: Pal, faces: FaceName[] = SIDES): void {
  for (const k of faces) noiseFace(t, faceRows(b[k], from, to), r, pal, { w, cell: 1, white: 0.6 });
}

/** a solid row of one colour around a box's sides (a belt, a hem) */
function ring(t: TexImage, b: Box, row: number, c: number | (() => number), faces: FaceName[] = SIDES): void {
  for (const k of faces) {
    const [x0, y0, w] = b[k];
    for (let x = 0; x < w; x++) plot(t, x0 + x, y0 + row, typeof c === 'number' ? c : c());
  }
}

/** shade the bottom rows of a box's sides (folds towards the hem) */
function shadeBottom(t: TexImage, b: Box, rows: number, f: number): void {
  for (const k of SIDES) paintFace(t, b[k], (x, y, c, w, h) => (y >= h - rows && (getA(t, b[k][0] + x, b[k][1] + y) > 0) ? mulC(c, f) : undefined));
}

function getA(t: TexImage, x: number, y: number): number {
  return t.data[(y * t.w + x) * 4 + 3];
}

/** a round brim (the hat_rim part): a disc of radius `rad` on its upper and under sides and the edges around */
function brim(t: TexImage, r: Rand, pal: Pal, rad: number, band?: number, under = 0.8): void {
  for (const [k, f] of [['front', 1], ['back', under]] as [FaceName, number][]) {
    const [x0, y0] = RIM[k];
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d > rad) continue;
        let c = pick(r, pal);
        if (band !== undefined && d < 5.2 && d > 4.1) c = band;
        plot(t, x0 + x, y0 + y, mulC(c, f));
      }
  }
  // (the brim's edges: a pixel thick)
  for (const k of ['top', 'bottom', 'right', 'left'] as FaceName[]) {
    const [x0, y0, w, h] = RIM[k];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // (where the disc reaches the plate's edge)
      const i = w > 1 ? x : y;
      if (Math.hypot(i - 7.5, 7.5) <= rad) plot(t, x0 + x, y0 + y, mulC(pick(r, pal), 0.85));
    }
  }
}

// ---------------------------------------------------------------------------
// the base villager (vanilla villager.png): bald, a long nose, a monobrow over green eyes, a brown robe and the
// arms folded into its sleeves

export const SKIN: Pal = [0x946650, 0xa1705a, 0xad7b63, 0xb8866d, 0xc39175];
export const SKIN_W: Pal = [1, 2, 5, 5, 2];
export const BROW = 0x3b261a;
const ROBE: Pal = [0x3c2820, 0x463028, 0x51382f, 0x5c4136, 0x674a3e];
const ROBE_W: Pal = [1, 3, 6, 3, 1];
export const SHOE: Pal = [0x2a1d17, 0x33241c, 0x3d2b22];

let BASE: TexImage | null = null;

function base(): TexImage {
  if (BASE) return BASE;
  const t = img(64, 64);
  const r = new Rand(0x5111a6e);
  // head and nose
  noiseBox(t, HEAD, r, SKIN, { w: SKIN_W, cell: 2, white: 0.35 });
  paintFace(t, HEAD.top, (x, y, c) => mulC(c, 1.02));
  paintFace(t, HEAD.bottom, (x, y, c) => mulC(c, 0.82));
  paintFace(t, HEAD.back, (x, y, c, w, h) => mulC(c, y > h - 3 ? 0.9 : 0.97));
  // (the brow and eyes sit just under where a hat's brim crosses the face, a row above the nose)
  drawFace(t, HEAD.front, [
    '........',
    '........',
    '........',
    '........',
    '.bBBBBb.',
    '.WG..GW.',
    '.s....s.',
    '........',
    '..m..m..',
    '.c....c.',
  ], {
    b: mixC(BROW, SKIN[1], 0.35), B: BROW, W: 0xeaeaea, G: 0x3d7e36, s: mulC(SKIN[3], 0.9), m: mulC(SKIN[2], 0.82), c: mulC(SKIN[3], 0.92),
  }, r);
  // (the cheeks a little flushed beside the nose)
  plot(t, HEAD.front[0] + 2, HEAD.front[1] + 7, mixC(SKIN[3], 0xc86a5a, 0.18));
  plot(t, HEAD.front[0] + 5, HEAD.front[1] + 7, mixC(SKIN[3], 0xc86a5a, 0.18));
  for (const k of ['right', 'left'] as FaceName[]) drawFace(t, HEAD[k], ['........', '........', '........', '........', '........', '....ee..', '....e...'], { e: mulC(SKIN[2], 0.86) }, r);
  noiseBox(t, NOSE, r, SKIN, { w: [1, 2, 4, 6, 3], cell: 1 });
  paintFace(t, NOSE.front, (x, y, c) => (y === 0 ? mulC(c, 1.04) : y === 3 ? mixC(c, 0xb0604f, 0.25) : undefined));
  paintFace(t, NOSE.bottom, (x, y, c) => mixC(mulC(c, 0.8), 0x7a3c30, 0.2));
  for (const k of ['right', 'left', 'back'] as FaceName[]) paintFace(t, NOSE[k], (x, y, c) => mulC(c, 0.9));

  // the robe: body, the long jacket over it, sleeves; a neck showing at the collar
  noiseBox(t, BODY, r, ROBE, { w: ROBE_W, cell: 1 });
  paintFace(t, BODY.front, (x, y, c) => (y < 2 && x >= 2 && x <= 5 ? pick(r, SKIN, SKIN_W) : undefined));
  noiseBox(t, JACKET, r, ROBE, { w: ROBE_W, cell: 1, white: 0.55 });
  collar(t, JACKET.front);
  for (const k of ['front', 'back'] as FaceName[]) paintFace(t, JACKET[k], (x, y, c) => (x === 0 || x === 7 ? mulC(c, 0.9) : undefined));
  shadeBottom(t, JACKET, 2, 0.88);
  paintFace(t, JACKET.bottom, (x, y, c) => mulC(c, 0.7));
  noiseBox(t, ARM, r, ROBE, { w: ROBE_W, cell: 1 });
  noiseBox(t, FOREARMS, r, ROBE, { w: ROBE_W, cell: 1 });
  paintFace(t, ARM.bottom, (x, y, c) => mulC(c, 0.62));
  paintFace(t, FOREARMS.top, (x, y, c) => mulC(c, 0.92));
  // (the folded sleeves' creases)
  paintFace(t, FOREARMS.front, (x, y, c) => (x === 3 || x === 4 ? mulC(c, 0.86) : undefined));
  // legs: the robe's skirt hides them but for the shoes
  noiseBox(t, LEG, r, ROBE, { w: ROBE_W, cell: 1 });
  for (const k of SIDES) noiseFace(t, faceRows(LEG[k], 8, 12), r, SHOE);
  noiseFace(t, LEG.bottom, r, SHOE);
  return (BASE = t);
}

/** a V of skin at the top middle of the jacket's front: nothing is painted there */
function collar(t: TexImage, f: Face): void {
  for (const [x, y] of [[3, 0], [4, 0], [3, 1], [4, 1]]) clear(t, f[0] + x, f[1] + y);
}

/** leave the collar's V open (an outfit's jacket front) */
function keepCollar(t: TexImage): void {
  collar(t, JACKET.front);
}

// ---------------------------------------------------------------------------
// the biome types (vanilla textures/entity/villager/type)

interface Outfit {
  hat: Hat;
  paint(t: TexImage, r: Rand): void;
}

/** a full robe: jacket, body and sleeves in one cloth, cuffs a shade darker */
function robe(t: TexImage, r: Rand, pal: Pal, w?: Pal): void {
  noiseBox(t, JACKET, r, pal, { w, cell: 1, white: 0.6 });
  noiseBox(t, BODY, r, pal, { w, cell: 1 });
  noiseBox(t, ARM, r, pal, { w, cell: 1 });
  noiseBox(t, FOREARMS, r, pal, { w, cell: 1 });
  paintFace(t, ARM.bottom, (x, y, c) => mulC(c, 0.62));
  paintFace(t, FOREARMS.front, (x, y, c) => (x === 3 || x === 4 ? mulC(c, 0.86) : undefined));
  paintFace(t, JACKET.bottom, (x, y, c) => mulC(c, 0.7));
  for (const k of ['front', 'back'] as FaceName[]) paintFace(t, JACKET[k], (x, y, c) => (x === 0 || x === 7 ? mulC(c, 0.9) : undefined));
  shadeBottom(t, JACKET, 2, 0.88);
  keepCollar(t);
}

/** a front strip down the middle of the jacket (the robe's opening, trimmed) */
function frontStrip(t: TexImage, r: Rand, pal: Pal, from = 2, to = 20, cols = [3, 4]): void {
  const [x0, y0] = JACKET.front;
  for (let y = from; y < to; y++) for (const x of cols) plot(t, x0 + x, y0 + y, pick(r, pal));
}

/** sleeve cuffs: the last rows of the arms, and the forearms' ends */
function cuffs(t: TexImage, r: Rand, pal: Pal): void {
  for (const k of SIDES) noiseFace(t, faceRows(ARM[k], 6, 8), r, pal, { cell: 1 });
  noiseFace(t, FOREARMS.right, r, pal, { cell: 1 });
  noiseFace(t, FOREARMS.left, r, pal, { cell: 1 });
}

/** a cap: the hat's top and its sides' upper rows (`rows` deep, a ragged last row when `ragged`) */
function cap(t: TexImage, r: Rand, pal: Pal, rows: number, ragged = false, w?: Pal): void {
  noiseFace(t, HAT.top, r, pal, { w, cell: 1 });
  for (const k of SIDES) noiseFace(t, HAT[k], r, pal, { w, cell: 1, mask: (x, y) => y < rows || (ragged && y === rows && r.chance(0.5)) });
}

const TYPES: Record<VillagerType, Outfit> = {
  plains: {
    hat: 'none',
    paint(t, r) {
      robe(t, r, [0x4d3325, 0x573a2a, 0x62422f, 0x6c4a35, 0x77533b], [1, 3, 5, 3, 1]);
      // a light shawl over the shoulders, a dark belt
      const SHAWL: Pal = [0x8f6c4a, 0x9c7852, 0xa8835b];
      band(t, JACKET, r, SHAWL, 0, 3);
      noiseFace(t, JACKET.top, r, SHAWL, { cell: 1 });
      for (const k of SIDES) noiseFace(t, faceRows(ARM[k], 0, 2), r, SHAWL, { cell: 1 });
      noiseFace(t, ARM.top, r, SHAWL, { cell: 1 });
      ring(t, JACKET, 10, 0x2e1f16);
      keepCollar(t);
    },
  },
  desert: {
    hat: 'partial',
    paint(t, r) {
      const SAND: Pal = [0xa77f4b, 0xb68d55, 0xc49b60, 0xd0a86b, 0xdab476];
      robe(t, r, SAND, [1, 2, 5, 3, 1]);
      const RED: Pal = [0x9e3a24, 0xb3452b, 0xc55232];
      frontStrip(t, r, RED, 2, 20);
      ring(t, JACKET, 9, () => pick(r, [0xc9a03a, 0xd8b046]));
      ring(t, JACKET, 18, () => pick(r, RED));
      cuffs(t, r, RED);
      // a pale head wrap, knotted at the back
      const WRAP: Pal = [0xcdb994, 0xd9c7a2, 0xe4d4b1, 0xeee1c2];
      cap(t, r, WRAP, 3, true);
      drawFace(t, HAT.back, ['........', '........', '........', '...kk...', '...k.k..', '....k...'], { k: 0xc8b28b }, r);
      keepCollar(t);
    },
  },
  jungle: {
    hat: 'partial',
    paint(t, r) {
      robe(t, r, [0x46511f, 0x515e25, 0x5c6b2b, 0x677732, 0x728239], [1, 3, 5, 3, 1]);
      const LEAF: Pal = [0x2f6b1c, 0x3a8024, 0x46942c];
      band(t, JACKET, r, LEAF, 0, 2);
      ring(t, JACKET, 10, () => pick(r, [0x6a4a26, 0x7a5530]));
      fleck(t, faceRows(JACKET.front, 11, 19), r, 0.18, LEAF);
      // a crown of leaves with a flower
      noiseFace(t, HAT.top, r, LEAF, { cell: 1, mask: () => r.chance(0.75) });
      for (const k of SIDES) noiseFace(t, HAT[k], r, LEAF, { cell: 1, mask: (x, y) => y === 0 || (y === 1 && r.chance(0.55)) });
      drawFace(t, HAT.front, ['.......', '.....ry.', '......r.'], { r: 0xd23b3b, y: 0xf2d24a }, r);
      keepCollar(t);
    },
  },
  savanna: {
    hat: 'partial',
    paint(t, r) {
      robe(t, r, [0x8e3620, 0x9d3e25, 0xac472a, 0xba5130, 0xc75b36], [1, 3, 5, 3, 1]);
      const GOLD: Pal = [0xc9932e, 0xd9a53a, 0xe6b548];
      ring(t, JACKET, 1, () => pick(r, GOLD));
      ring(t, JACKET, 10, () => pick(r, GOLD));
      ring(t, JACKET, 18, () => pick(r, GOLD));
      cuffs(t, r, GOLD);
      // a striped head band
      for (const k of SIDES) {
        const [x0, y0, w] = HAT[k];
        for (let x = 0; x < w; x++) {
          plot(t, x0 + x, y0 + 1, (x & 1) === 0 ? 0xc03a2a : 0xe0b440);
          plot(t, x0 + x, y0 + 2, mulC((x & 1) === 0 ? 0xe0b440 : 0xc03a2a, 0.9));
        }
      }
      keepCollar(t);
    },
  },
  snow: {
    hat: 'full',
    paint(t, r) {
      const FUR: Pal = [0xbfc8ce, 0xcdd5da, 0xd9e0e4, 0xe4e9ec, 0xeef2f4];
      robe(t, r, FUR, [1, 2, 4, 4, 2]);
      const BLUE: Pal = [0x2f4d86, 0x365794, 0x3e62a2];
      frontStrip(t, r, BLUE, 2, 20);
      ring(t, JACKET, 10, () => pick(r, BLUE));
      ring(t, JACKET, 19, () => pick(r, [0x9aa6ad, 0xa7b2b8]));
      cuffs(t, r, [0xa9b5bc, 0xb6c1c7]);
      // a fur hat with a blue band
      cap(t, r, FUR, 4, true);
      ring(t, HAT, 3, () => pick(r, BLUE));
      keepCollar(t);
    },
  },
  swamp: {
    hat: 'full',
    paint(t, r) {
      const MOSS: Pal = [0x2a3520, 0x323f25, 0x3b4a2b, 0x445531, 0x4d5f37];
      robe(t, r, MOSS, [1, 3, 5, 3, 1]);
      const PURPLE: Pal = [0x4e2f5d, 0x5a3669, 0x663e76];
      frontStrip(t, r, PURPLE, 2, 20);
      ring(t, JACKET, 10, () => pick(r, [0x2a1d14, 0x33241a]));
      // a wide dark hat hung with vines
      cap(t, r, MOSS, 3);
      brim(t, r, MOSS, 7.2, undefined, 0.75);
      const VINE: Pal = [0x2f6b1c, 0x3a8024];
      for (const k of SIDES) {
        const [x0, y0, w] = HAT[k];
        for (let x = 0; x < w; x++) if (r.chance(0.35)) for (let y = 3; y < 3 + 1 + r.nextInt(4); y++) plot(t, x0 + x, y0 + y, pick(r, VINE));
      }
      keepCollar(t);
    },
  },
  taiga: {
    hat: 'partial',
    paint(t, r) {
      robe(t, r, [0x523826, 0x5d402c, 0x684832, 0x735138, 0x7e5a3f], [1, 3, 5, 3, 1]);
      const TRIM: Pal = [0xbfae90, 0xcdbd9f, 0xd9caae];
      band(t, JACKET, r, TRIM, 0, 2);
      noiseFace(t, JACKET.top, r, TRIM, { cell: 1 });
      ring(t, JACKET, 18, () => pick(r, TRIM));
      ring(t, JACKET, 19, () => pick(r, TRIM));
      cuffs(t, r, TRIM);
      // a fur cap
      cap(t, r, [0x5a3f2b, 0x664832, 0x72523a], 3, true);
      ring(t, HAT, 3, () => pick(r, TRIM));
      keepCollar(t);
    },
  },
};

// ---------------------------------------------------------------------------
// the professions (vanilla textures/entity/villager/profession)

/** an apron down the jacket's front (rows [from, to)), with ties at the sides at `tie` */
function apron(t: TexImage, r: Rand, pal: Pal, from = 2, to = 19, tie?: number, w?: Pal): void {
  const [x0, y0] = JACKET.front;
  noiseFace(t, [x0 + 1, y0 + from, 6, to - from], r, pal, { w, cell: 1, white: 0.5 });
  // (the bib's straps up to the collar)
  for (let y = 0; y < from; y++) {
    plot(t, x0 + 1, y0 + y, pick(r, pal));
    plot(t, x0 + 6, y0 + y, pick(r, pal));
  }
  if (tie !== undefined) {
    const c = mulC(pal[0], 0.85);
    for (const k of ['right', 'left', 'back'] as FaceName[]) {
      const [fx, fy, fw] = JACKET[k];
      for (let x = 0; x < fw; x++) plot(t, fx + x, fy + tie, c);
    }
  }
}

function eyepatch(t: TexImage): void {
  const [x0, y0] = HAT.front;
  for (const [x, y] of [[1, 5], [2, 5], [1, 6], [2, 6]]) plot(t, x0 + x, y0 + y, 0x151515);
  // (the strap round the head)
  for (let x = 3; x < 8; x++) plot(t, x0 + x, y0 + 4, 0x1e1e1e);
  plot(t, x0, y0 + 4, 0x1e1e1e);
  for (const k of ['right', 'left', 'back'] as FaceName[]) {
    const [fx, fy, fw] = HAT[k];
    for (let x = 0; x < fw; x++) plot(t, fx + x, fy + 4, 0x1e1e1e);
  }
}

const PROFESSIONS: Record<Exclude<Profession, 'none'>, Outfit> = {
  armorer: {
    hat: 'full',
    paint(t, r) {
      const IRON: Pal = [0x34373b, 0x3d4045, 0x464a4f, 0x505459];
      // a welding mask with a dark visor
      noiseBox(t, HAT, r, IRON, { cell: 1 }, ['top', 'right', 'front', 'left']);
      drawFace(t, HAT.front, ['........', '........', '........', '........', '.vvvvvv.', '.vgvvgv.', '.vvvvvv.', '........', '........', '........'], { v: 0x121417, g: 0x3c4a55, r: 0x2a2d31 }, r);
      noiseFace(t, HAT.back, r, IRON, { cell: 1, mask: (x, y) => y < 3 });
      apron(t, r, [0x2d2f33, 0x35383c, 0x3e4145], 2, 19, 9);
    },
  },
  butcher: {
    hat: 'partial',
    paint(t, r) {
      apron(t, r, [0xcfd0cc, 0xdcddd9, 0xe8e8e4, 0xf1f1ee], 2, 19, 9, [1, 2, 4, 2]);
      fleck(t, faceRows(JACKET.front, 4, 18), r, 0.1, [0x8c1f1f, 0xa12828]);
      ring(t, HAT, 2, () => pick(r, [0xa02b2b, 0xb13333]));
      ring(t, HAT, 3, () => pick(r, [0x8d2424, 0xa02b2b]));
    },
  },
  cartographer: {
    hat: 'none',
    paint(t, r) {
      const TEAL: Pal = [0x28413d, 0x2f4b46, 0x36554f];
      band(t, JACKET, r, TEAL, 1, 11, undefined, ['front', 'right', 'left']);
      frontStrip(t, r, [0x1e302d], 1, 11, [3]);
      for (const y of [3, 5, 7, 9]) plot(t, JACKET.front[0] + 4, JACKET.front[1] + y, 0xd8b54a);
      ring(t, JACKET, 11, 0x2b1d14);
      // a monocle on its chain
      drawFace(t, HAT.front, ['........', '........', '........', '........', '....ggg.', '....g.g.', '....ggg.', '......c.', '......c.'], { g: 0xd8b54a, c: 0xb8953a }, r);
    },
  },
  cleric: {
    hat: 'none',
    paint(t, r) {
      robe(t, r, [0x4f2462, 0x5a2b6e, 0x66327a, 0x713a86, 0x7c4292], [1, 3, 5, 3, 1]);
      const GOLD: Pal = [0xc59a2e, 0xd4aa3a, 0xe2ba48];
      frontStrip(t, r, GOLD, 2, 20, [3]);
      ring(t, JACKET, 19, () => pick(r, GOLD));
      cuffs(t, r, GOLD);
      band(t, JACKET, r, [0x3c1a4b, 0x44205a], 0, 1);
    },
  },
  farmer: {
    hat: 'full',
    paint(t, r) {
      const STRAW: Pal = [0xa9873a, 0xb99742, 0xc8a64c, 0xd5b457, 0xe0c263];
      cap(t, r, STRAW, 4);
      ring(t, HAT, 3, () => pick(r, [0x7e5e28, 0x8a6a2e]));
      brim(t, r, STRAW, 7.6, 0x8a6a2e);
      apron(t, r, [0x7a5a36, 0x86643c, 0x926e43], 3, 19, 9);
    },
  },
  fisherman: {
    hat: 'full',
    paint(t, r) {
      const STRAW: Pal = [0xb29448, 0xc2a353, 0xd1b25e];
      cap(t, r, STRAW, 3);
      brim(t, r, STRAW, 6.4, 0x8f7338);
      // a striped jumper under a brown vest
      for (const k of [...SIDES, 'top'] as FaceName[]) {
        paintFace(t, ARM[k], (x, y) => (y % 2 === 0 ? 0x2f5f8f : 0xd9d9d0));
      }
      paintFace(t, FOREARMS.front, (x, y) => (y % 2 === 0 ? 0x2f5f8f : 0xd9d9d0));
      band(t, JACKET, r, [0x6a4a2e, 0x755236, 0x80593c], 1, 12, undefined, ['front', 'right', 'left', 'back']);
      frontStrip(t, r, [0x2f5f8f, 0xd9d9d0], 1, 12, [3, 4]);
      keepCollar(t);
    },
  },
  fletcher: {
    hat: 'partial',
    paint(t, r) {
      const GREEN: Pal = [0x34502a, 0x3d5d30, 0x466a37];
      cap(t, r, GREEN, 2);
      // a red feather standing off the side
      drawFace(t, HAT.right, ['.f......', 'ff......', '.f......'], { f: 0xc83434 }, r);
      band(t, JACKET, r, [0x5a4a2e, 0x655435, 0x715e3c], 1, 11, undefined, ['front', 'right', 'left']);
      // the quiver's strap across the chest
      for (let i = 0; i < 8; i++) plot(t, JACKET.front[0] + i, JACKET.front[1] + 1 + i, 0x3d2a1a);
      keepCollar(t);
    },
  },
  leatherworker: {
    hat: 'none',
    paint(t, r) {
      apron(t, r, [0x5c3a1f, 0x6a4424, 0x784e2a, 0x855831], 2, 19, 9);
      // pockets, stitched
      drawFace(t, JACKET.front, ['........', '........', '........', '........', '........', '........', '........', '........', '........', '........', '........', '.ssss...', '.p..s...', '.ssss...'], { s: 0xa3794a, p: 0x4a2e18 }, r);
    },
  },
  librarian: {
    hat: 'full',
    paint(t, r) {
      // a tall red cap with a black band, a white collar, a red vest with gold buttons
      cap(t, r, [0x8e1f1f, 0x9e2626, 0xad2d2d], 3);
      noiseFace(t, HAT.top, r, [0x8e1f1f, 0x9e2626]);
      ring(t, HAT, 3, 0x1c1c1c);
      band(t, JACKET, r, [0xd8d6d0, 0xe4e2dc], 0, 2, undefined, ['front', 'right', 'left', 'back']);
      band(t, JACKET, r, [0x8a1e1e, 0x9a2525, 0xa82c2c], 2, 11, undefined, ['front', 'right', 'left']);
      for (const y of [3, 5, 7, 9]) plot(t, JACKET.front[0] + 3, JACKET.front[1] + y, 0xe0b848);
      keepCollar(t);
    },
  },
  mason: {
    hat: 'none',
    paint(t, r) {
      apron(t, r, [0x5e5e5e, 0x6b6b6b, 0x787878, 0x858585], 2, 19, 9);
      fleck(t, faceRows(JACKET.front, 3, 18), r, 0.08, [0x9a9a9a, 0x4d4d4d]);
    },
  },
  nitwit: {
    hat: 'none',
    paint(t, r) {
      robe(t, r, [0x37602a, 0x406d30, 0x4a7a37, 0x54873e, 0x5e9446], [1, 3, 5, 3, 1]);
      ring(t, JACKET, 10, () => pick(r, [0x2c4a22, 0x335427]));
    },
  },
  shepherd: {
    hat: 'partial',
    paint(t, r) {
      const WOOL: Pal = [0xd8d4ca, 0xe3dfd6, 0xedeae2];
      band(t, JACKET, r, WOOL, 0, 3);
      noiseFace(t, JACKET.top, r, WOOL);
      for (const k of SIDES) noiseFace(t, faceRows(ARM[k], 0, 2), r, WOOL);
      noiseFace(t, ARM.top, r, WOOL);
      cap(t, r, [0x5e4631, 0x6a4f37, 0x76583e], 3, true);
      keepCollar(t);
    },
  },
  toolsmith: {
    hat: 'none',
    paint(t, r) {
      apron(t, r, [0x1f1f21, 0x28282b, 0x313135], 2, 19, 9);
      ring(t, JACKET, 10, () => pick(r, [0x6b6b6b, 0x7a7a7a]));
    },
  },
  weaponsmith: {
    hat: 'partial',
    paint(t, r) {
      eyepatch(t);
      apron(t, r, [0x26211d, 0x2f2924, 0x39312b], 2, 19, 9);
      ring(t, JACKET, 9, () => pick(r, [0x5a4030, 0x654836]));
    },
  },
};

// ---------------------------------------------------------------------------
// the level badges (vanilla textures/entity/villager/profession_level): a gem on the belt

const BADGES: [number, number, number][] = [
  [0x5c5c5c, 0x7c7c7c, 0xa2a2a2], // stone
  [0x9a9a9a, 0xd4d4d4, 0xffffff], // iron
  [0x9c7612, 0xdcb12a, 0xfff08a], // gold
  [0x0b6b30, 0x19a14c, 0x7dfab0], // emerald
  [0x1a7f7b, 0x33c7c0, 0xb5fffb], // diamond
];

function badge(t: TexImage, level: number): void {
  const [dark, mid, light] = BADGES[Math.max(1, Math.min(5, level)) - 1];
  const [x0, y0] = JACKET.front;
  drawFace(t, [x0 + 2, y0 + 9, 4, 3], ['.dd.', 'dLmd', '.dd.'], { d: dark, m: mid, L: light }, new Rand(level));
}

// ---------------------------------------------------------------------------

const layers = new Map<string, TexImage>();

function layer(key: string, paint: (t: TexImage, r: Rand) => void): TexImage {
  let t = layers.get(key);
  if (!t) {
    t = img(64, 64);
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
    paint(t, new Rand(h >>> 0));
    layers.set(key, t);
  }
  return t;
}

/** draw `src` over `dst` where it has pixels (cutout), leaving out the regions given */
function over(dst: TexImage, src: TexImage, skip: Face[] = []): void {
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      if (skip.some(([sx, sy, w, h]) => x >= sx && x < sx + w && y >= sy && y < sy + h)) continue;
      const i = (y * 64 + x) * 4;
      if (src.data[i + 3] < 26) continue;
      dst.data[i] = src.data[i];
      dst.data[i + 1] = src.data[i + 1];
      dst.data[i + 2] = src.data[i + 2];
      dst.data[i + 3] = 255;
    }
}

/**
 * vanilla VillagerProfessionLayer: over the skin, the type's outfit (without its head when the profession's hat
 * covers it), then, for a grown one with a profession, that outfit and (but for the nitwit) the badge of its level;
 * `skip`: regions of the outfits the model uses otherwise
 */
function dress(t: TexImage, type: VillagerType, prof: Profession, level: number, baby: boolean, skip: Face[] = []): TexImage {
  const profHat: Hat = baby || prof === 'none' ? 'none' : PROFESSIONS[prof].hat;
  const typeHat = TYPES[type].hat;
  const showTypeHead = profHat === 'none' || (profHat === 'partial' && typeHat !== 'full');
  over(t, layer('type/' + type, (l, r) => TYPES[type].paint(l, r)), showTypeHead ? skip : [...HEAD_REGIONS, ...skip]);
  if (!baby && prof !== 'none') {
    over(t, layer('profession/' + prof, (l, r) => PROFESSIONS[prof].paint(l, r)), skip);
    if (prof !== 'nitwit') badge(t, level);
  }
  return t;
}

/** the villager's skin (vanilla VillagerRenderer): the base villager, dressed */
export function villagerTexture(type: VillagerType, prof: Profession, level: number, baby: boolean): TexImage {
  return dress(cloneImg(base()), type, prof, level, baby);
}

// ---------------------------------------------------------------------------
// the zombie villager (vanilla zombie_villager/zombie_villager.png and its layers): the villager gone green and
// rotten, hollow dark eyes under the brow, the robe torn at the hem, and ZombieVillagerModel's arms (the sleeve over
// the upper two thirds, the hand below) in place of the folded ones

const ZSKIN: Pal = [0x3d6e30, 0x467b37, 0x4f873e, 0x589146, 0x629b4f];
const ZSKIN_W: Pal = [1, 3, 6, 4, 1];
const ZBROW = 0x1f3a16;
const ZROBE: Pal = [0x33231c, 0x3c2a21, 0x463128, 0x4f382e, 0x583f34];
/** ZombieVillagerModel's arms: 4x12x4 at the villager's folded arms' place */
const ZARM = boxFaces(44, 22, 4, 12, 4);

let ZBASE: TexImage | null = null;

function zombieBase(): TexImage {
  if (ZBASE) return ZBASE;
  const t = img(64, 64);
  const r = new Rand(0x2b1e7a6);
  noiseBox(t, HEAD, r, ZSKIN, { w: ZSKIN_W, cell: 2, white: 0.4 });
  paintFace(t, HEAD.top, (x, y, c) => mulC(c, 0.9));
  paintFace(t, HEAD.bottom, (x, y, c) => mulC(c, 0.8));
  paintFace(t, HEAD.back, (x, y, c, w, h) => mulC(c, y > h - 3 ? 0.88 : 0.96));
  drawFace(t, HEAD.front, [
    '........',
    '........',
    '........',
    '........',
    '.bBBBBb.',
    '.KE..EK.',
    '.s....s.',
    '........',
    '..mMMm..',
    '.c....c.',
  ], {
    b: mixC(ZBROW, ZSKIN[1], 0.4), B: ZBROW, K: 0x000000, E: 0x141a10, s: mulC(ZSKIN[2], 0.82), m: mulC(ZSKIN[1], 0.8), M: 0x1b2e14, c: mulC(ZSKIN[3], 0.9),
  }, r);
  for (const k of ['right', 'left'] as FaceName[]) drawFace(t, HEAD[k], ['........', '........', '........', '........', '........', '....ee..', '....e...'], { e: mulC(ZSKIN[1], 0.85) }, r);
  noiseBox(t, NOSE, r, ZSKIN, { w: [1, 2, 4, 6, 3], cell: 1 });
  paintFace(t, NOSE.front, (x, y, c) => (y === 0 ? mulC(c, 1.05) : y === 3 ? mixC(c, 0x2f4a24, 0.35) : undefined));
  paintFace(t, NOSE.bottom, (x, y, c) => mulC(c, 0.75));
  for (const k of ['right', 'left', 'back'] as FaceName[]) paintFace(t, NOSE[k], (x, y, c) => mulC(c, 0.9));

  // the robe, stained and ragged, a green neck at the collar
  noiseBox(t, BODY, r, ZROBE, { w: ROBE_W, cell: 1 });
  paintFace(t, BODY.front, (x, y, c) => (y < 2 && x >= 2 && x <= 5 ? pick(r, ZSKIN, ZSKIN_W) : undefined));
  noiseBox(t, JACKET, r, ZROBE, { w: ROBE_W, cell: 1, white: 0.6 });
  collar(t, JACKET.front);
  for (const k of ['front', 'back'] as FaceName[]) paintFace(t, JACKET[k], (x, y, c) => (x === 0 || x === 7 ? mulC(c, 0.9) : undefined));
  shadeBottom(t, JACKET, 3, 0.85);
  // (dark stains, and the hem torn into tatters)
  for (const k of SIDES) paintFace(t, JACKET[k], (x, y, c) => (r.chance(0.06) ? mulC(c, 0.72) : undefined));
  for (const k of SIDES) {
    const [x0, y0, w, h] = JACKET[k];
    for (let x = 0; x < w; x++) {
      const cut = r.chance(0.45) ? 1 + (r.chance(0.35) ? 1 : 0) : 0;
      for (let y = h - cut; y < h; y++) clear(t, x0 + x, y0 + y);
    }
  }
  paintFace(t, JACKET.bottom, (x, y, c) => mulC(c, 0.7));
  // the arms: sleeves, then the hands
  noiseBox(t, ZARM, r, ZROBE, { w: ROBE_W, cell: 1 });
  for (const k of SIDES) noiseFace(t, faceRows(ZARM[k], 8, 12), r, ZSKIN, { w: ZSKIN_W, cell: 1 });
  for (const k of SIDES) paintFace(t, faceRows(ZARM[k], 7, 8), (x, y, c) => mulC(c, 0.8));
  noiseFace(t, ZARM.bottom, r, ZSKIN, { w: ZSKIN_W, cell: 1 });
  paintFace(t, ZARM.bottom, (x, y, c) => mulC(c, 0.85));
  // legs: the robe's skirt over them, worn shoes
  noiseBox(t, LEG, r, ZROBE, { w: ROBE_W, cell: 1 });
  for (const k of SIDES) noiseFace(t, faceRows(LEG[k], 8, 12), r, SHOE);
  noiseFace(t, LEG.bottom, r, SHOE);
  return (ZBASE = t);
}

/**
 * the zombie villager's skin (vanilla ZombieVillagerRenderer): the zombie villager, dressed as the villager it was
 * (the outfits' cuffs, under the folded arms, are its hands' undersides here)
 */
export function zombieVillagerTexture(type: VillagerType, prof: Profession, level: number, baby: boolean): TexImage {
  return dress(cloneImg(zombieBase()), type, prof, level, baby, [ARM.bottom]);
}

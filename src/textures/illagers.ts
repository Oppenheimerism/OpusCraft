// The raiders' skins (vanilla textures/entity/illager/*, vex, ravager, evoker_fangs), and the totem's glitter
// particles. The illagers share IllagerModel's 64x64 layout: the villager's tall head and long nose in a cold grey,
// a heavy black unibrow; the pillager in a dark maroon shirt under a short leather vest, the vindicator in a long
// teal-black coat, the evoker in a black robe to the ground with gold trim. The vex (32x32) is a small pale-blue spirit
// with dark eye sockets and ribbed wings; charging, its eyes burn red and its mouth gapes. The ravager (128x128): a
// hulking grey-brown beast with a pale horned head, a dark muzzle and a saddle strap over its back. The fangs (64x32):
// bone-white jaws with a row of teeth on a dark stony base. Original pixel art in the style of vanilla 1.21.

import { TexImage, img, plot, mixC, mulC, clear } from './tex';
import { Rand } from '../core/rng';
import { MOB_TEXTURES, MOB_PARTICLE_TEXTURES, boxFaces, noiseBox, noiseFace, paintFace, drawFace, pick, SIDES, type Box, type FaceName, type Pal } from './mobs';

// ---------------------------------------------------------------------------
// illagers (vanilla IllagerModel, 64x64)

const HEAD = boxFaces(0, 0, 8, 10, 8);
const NOSE = boxFaces(24, 0, 2, 4, 2);
const BODY = boxFaces(16, 20, 8, 12, 6);
const JACKET = boxFaces(0, 38, 8, 20, 6);
const ARM = boxFaces(44, 22, 4, 8, 4);
const FOREARMS = boxFaces(40, 38, 8, 4, 4);
const LEG = boxFaces(0, 22, 4, 12, 4);
const RAISED_ARM = boxFaces(40, 46, 4, 12, 4);

/** the illagers' grey skin */
const SKIN: Pal = [0x6b7070, 0x767c7c, 0x818787, 0x8b9292, 0x969c9c];
const SKIN_W: Pal = [1, 3, 6, 4, 1];
const BROW = 0x151515;

interface IllagerLook {
  seed: number;
  /** the brow and eyes over the nose (the head's front, 8x10) */
  face: string[];
  eye: number;
  shirt: Pal;
  /** the jacket layer's colours, and how many of its 20 rows it covers (the rest bare, the legs showing) */
  coat: Pal;
  coatRows: number;
  trousers: Pal;
  boots: Pal;
  /** trim along the coat's hem and front */
  trim?: number;
  /** anything more */
  extra?: (t: TexImage, r: Rand) => void;
}

const W: Pal = [1, 3, 6, 3, 1];

function shade(t: TexImage, b: Box): void {
  paintFace(t, b.top, (_x, _y, c) => mulC(c, 1.04));
  paintFace(t, b.bottom, (_x, _y, c) => mulC(c, 0.7));
}

function illager(look: IllagerLook): TexImage {
  const t = img(64, 64);
  const r = new Rand(look.seed);
  // the head: grey, lined, the heavy brow
  noiseBox(t, HEAD, r, SKIN, { w: SKIN_W, cell: 2, white: 0.35 });
  paintFace(t, HEAD.top, (_x, _y, c) => mulC(c, 1.02));
  paintFace(t, HEAD.bottom, (_x, _y, c) => mulC(c, 0.8));
  paintFace(t, HEAD.back, (_x, y, c, _w, h) => mulC(c, y > h - 3 ? 0.9 : 0.96));
  drawFace(t, HEAD.front, look.face, {
    B: BROW, b: mixC(BROW, SKIN[1], 0.4), W: 0xdfe2de, E: look.eye, s: mulC(SKIN[2], 0.8), m: mulC(SKIN[1], 0.7), l: mulC(SKIN[3], 0.88),
  }, r);
  for (const k of ['right', 'left'] as FaceName[]) drawFace(t, HEAD[k], ['........', '........', '........', '........', 'BB......', '........', '.....s..', '....s...'], { B: BROW, s: mulC(SKIN[2], 0.84) }, r);
  noiseBox(t, NOSE, r, SKIN, { w: [1, 2, 4, 6, 3], cell: 1 });
  paintFace(t, NOSE.front, (_x, y, c) => (y === 0 ? mulC(c, 1.05) : y === 3 ? mulC(c, 0.86) : undefined));
  paintFace(t, NOSE.bottom, (_x, _y, c) => mulC(c, 0.74));
  for (const k of ['right', 'left', 'back'] as FaceName[]) paintFace(t, NOSE[k], (_x, _y, c) => mulC(c, 0.9));

  // the shirt: body and sleeves (crossed and raised), hands at the sleeves' ends
  noiseBox(t, BODY, r, look.shirt, { w: W, cell: 1 });
  paintFace(t, BODY.front, (x, y) => (y < 2 && x >= 2 && x <= 5 ? pick(r, SKIN, SKIN_W) : undefined));
  shade(t, BODY);
  noiseBox(t, ARM, r, look.shirt, { w: W, cell: 1 });
  noiseBox(t, FOREARMS, r, look.shirt, { w: W, cell: 1 });
  paintFace(t, ARM.bottom, (_x, _y, c) => mulC(c, 0.6));
  paintFace(t, FOREARMS.front, (x, _y, c) => (x === 3 || x === 4 ? mulC(c, 0.84) : undefined));
  for (const k of ['right', 'left'] as FaceName[]) noiseFace(t, FOREARMS[k], r, SKIN, { w: SKIN_W, cell: 1 });
  noiseBox(t, RAISED_ARM, r, look.shirt, { w: W, cell: 1 });
  for (const k of SIDES) paintFace(t, RAISED_ARM[k], (_x, y, c, _w, h) => (y >= h - 4 ? pick(r, SKIN, SKIN_W) : y === h - 5 ? mulC(c, 0.8) : undefined));
  noiseFace(t, RAISED_ARM.bottom, r, SKIN, { w: SKIN_W, cell: 1 });
  paintFace(t, RAISED_ARM.top, (_x, _y, c) => mulC(c, 1.04));

  // the legs: trousers, boots
  noiseBox(t, LEG, r, look.trousers, { w: W, cell: 1 });
  for (const k of SIDES) paintFace(t, LEG[k], (_x, y, _c, _w, h) => (y >= h - 3 ? pick(r, look.boots) : undefined));
  noiseFace(t, LEG.bottom, r, look.boots);

  // the coat (the jacket layer, a half pixel out): as long as it goes, bare below
  noiseBox(t, JACKET, r, look.coat, { w: W, cell: 1, white: 0.55 });
  for (const k of SIDES) {
    paintFace(t, JACKET[k], (x, y, c, w) => {
      if (y >= look.coatRows) return null;
      if (y === look.coatRows - 1) return look.trim ?? mulC(c, 0.8);
      if (look.trim !== undefined && k === 'front' && (x === 3 || x === 4) && y > 1) return look.trim;
      if (x === 0 || x === w - 1) return mulC(c, 0.88);
      return undefined;
    });
  }
  // (the collar open at the neck)
  for (const [x, y] of [[3, 0], [4, 0], [3, 1], [4, 1]]) clear(t, JACKET.front[0] + x, JACKET.front[1] + y);
  paintFace(t, JACKET.bottom, () => null);
  paintFace(t, JACKET.top, (x, y, c, w, h) => (x > 0 && x < w - 1 && y > 0 && y < h - 1 ? null : c));
  look.extra?.(t, r);
  return t;
}

// the brow: `B` black, `b` its softer end; eyes `W` white and `E` iris; `s` lines, `m` mouth, `l` cheek
// prettier-ignore
const PILLAGER_FACE = [
  '........',
  '........',
  '........',
  '.s....s.',
  'BBBBBBBB',
  '.WE..EW.',
  '.l....l.',
  '........',
  '.m....m.',
  '..mmmm..',
];
// prettier-ignore
const VINDICATOR_FACE = [
  '........',
  '........',
  '........',
  'b......b',
  '.BBBBBB.',
  'bEW..WEb',
  '.s....s.',
  '........',
  '..m..m..',
  '.mmmmmm.',
];
// prettier-ignore
const EVOKER_FACE = [
  '........',
  '..s..s..',
  '........',
  '.BBBBBB.',
  'BbWEEWbB',
  '.s.EE.s.',
  '.l....l.',
  '.s....s.',
  '.m....m.',
  '..mmmm..',
];

const LOOKS: Record<string, IllagerLook> = {
  pillager: {
    seed: 0x9111a6e,
    face: PILLAGER_FACE,
    eye: 0x2c5a3a,
    shirt: [0x3e1f1c, 0x4a2622, 0x552d28, 0x61342e, 0x6c3b34],
    coat: [0x3d3027, 0x47382e, 0x514135, 0x5b4a3c, 0x655343],
    coatRows: 11,
    trousers: [0x252a33, 0x2c323c, 0x333a45, 0x3b424e, 0x434a57],
    boots: [0x1e1714, 0x271e19, 0x30251f],
    extra: (t) => {
      // (a strap across the vest, a buckle at its middle)
      const [fx, fy] = JACKET.front;
      for (let i = 0; i < 8; i++) plot(t, fx + i, fy + 2 + Math.floor(i * 0.9), 0x1d1512);
      plot(t, fx + 4, fy + 5, 0xa08a5a);
    },
  },
  vindicator: {
    seed: 0x71dca7,
    face: VINDICATOR_FACE,
    eye: 0x3c6a3f,
    shirt: [0x1d2a2c, 0x233235, 0x2a3b3e, 0x314447, 0x384d50],
    coat: [0x1b2627, 0x212e30, 0x273639, 0x2e3f42, 0x35474b],
    coatRows: 17,
    trousers: [0x141516, 0x191b1c, 0x1f2123, 0x25282a, 0x2b2e31],
    boots: [0x0f0d0c, 0x161311, 0x1d1916],
    trim: 0x4a3a2c,
  },
  evoker: {
    seed: 0xe70ce2,
    face: EVOKER_FACE,
    eye: 0x3a5a2c,
    shirt: [0x141313, 0x191717, 0x1e1c1c, 0x242121, 0x292626],
    coat: [0x121111, 0x171515, 0x1c1a19, 0x211f1e, 0x272423],
    coatRows: 20,
    trousers: [0x121111, 0x171515, 0x1c1a19, 0x211f1e, 0x272423],
    boots: [0x0c0b0b, 0x121010, 0x181515],
    trim: 0xc99a35,
    extra: (t) => {
      // (gold trim round the sleeves' cuffs and a gold clasp at the collar)
      for (const k of SIDES) paintFace(t, RAISED_ARM[k], (_x, y, c, _w, h) => (y === h - 5 ? 0xb88a2c : c));
      for (const k of SIDES) paintFace(t, ARM[k], (_x, y, c, _w, h) => (y === h - 1 ? 0xb88a2c : c));
      const [fx, fy] = JACKET.front;
      plot(t, fx + 3, fy + 2, 0xe8c050);
      plot(t, fx + 4, fy + 2, 0xe8c050);
      // (the robe's hem and sides, a band of gold)
      for (const k of SIDES) paintFace(t, JACKET[k], (_x, y, c) => (y === 17 ? 0xb88a2c : c));
    },
  },
};

// ---------------------------------------------------------------------------
// the vex (vanilla VexModel, 32x32)

const VEX_HEAD = boxFaces(0, 0, 5, 5, 5);
const VEX_BODY = boxFaces(0, 10, 3, 4, 2);
const VEX_TAIL = boxFaces(0, 16, 3, 5, 2);
const VEX_RARM = boxFaces(23, 0, 2, 4, 2);
const VEX_LARM = boxFaces(23, 6, 2, 4, 2);
const VEX_PAL: Pal = [0x7f96ad, 0x8ea5bb, 0x9eb4c8, 0xafc3d5, 0xc0d2e1];
const VEX_FACE_PAL: Pal = [0xb8c6d2, 0xc7d4de, 0xd6e1ea, 0xe3ebf1];

function vex(charging: boolean): TexImage {
  const t = img(32, 32);
  const r = new Rand(0x7e7);
  noiseBox(t, VEX_HEAD, r, VEX_FACE_PAL, { cell: 1, white: 0.4 });
  paintFace(t, VEX_HEAD.top, (_x, _y, c) => mulC(c, 1.04));
  paintFace(t, VEX_HEAD.bottom, (_x, _y, c) => mulC(c, 0.8));
  // (the face: dark sockets with a spark in each, a small mouth; charging, burning red and gaping)
  drawFace(t, VEX_HEAD.front, charging
    ? ['.....', 'KR.RK', '.....', '.kMk.', '..k..']
    : ['.....', 'KE.EK', '.....', '..m..', '.....'],
  { K: 0x2a3440, E: 0x9fe0ff, R: 0xff3b2a, m: 0x4d5a68, M: 0x5a0d0d, k: 0x24161a }, r);
  if (charging) paintFace(t, VEX_HEAD.front, (x, y, c) => (y === 2 && (x === 0 || x === 4) ? mixC(c, 0xd86060, 0.5) : undefined));
  // (a pale tuft of hair on top)
  paintFace(t, VEX_HEAD.top, (x, y, c) => ((x + y) % 3 === 0 ? mixC(c, 0xffffff, 0.3) : undefined));
  noiseBox(t, VEX_BODY, r, VEX_PAL, { cell: 1 });
  noiseBox(t, VEX_TAIL, r, VEX_PAL, { cell: 1 });
  // (the tail wisps away at its end)
  for (const k of SIDES) paintFace(t, VEX_TAIL[k], (x, y, c, w, h) => (y === h - 1 && x % 2 === 1 ? null : y >= h - 2 ? mixC(c, 0xffffff, 0.2) : undefined));
  noiseBox(t, VEX_RARM, r, VEX_PAL, { cell: 1 });
  noiseBox(t, VEX_LARM, r, VEX_PAL, { cell: 1 });
  for (const b of [VEX_RARM, VEX_LARM]) noiseFace(t, b.bottom, r, VEX_FACE_PAL);
  // the wings: pale see-through membranes (the vex is drawn translucent) with firmer ribs fanning out from the root
  for (const [x0, y0] of [[16, 22], [24, 22]]) {
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 8; x++) {
        const edge = y === 0 || y === 4 || x === 7;
        if (x === 7 && (y === 0 || y === 4)) continue;
        const rib = (y === 1 && x % 3 === 0) || (y === 3 && x % 3 === 1) || y === 2;
        if (rib) plot(t, x0 + x, y0 + y, 0x8ea5bb, 235);
        else if (edge) plot(t, x0 + x, y0 + y, 0xc8d8e6, 205);
        else plot(t, x0 + x, y0 + y, pick(r, [0xdce7f0, 0xe6eef5, 0xeef4f8]), 150);
      }
  }
  return t;
}

// ---------------------------------------------------------------------------
// the ravager (vanilla RavagerModel, 128x128)

const RV_HEAD = boxFaces(0, 0, 16, 20, 16);
const RV_NOSE = boxFaces(0, 0, 4, 8, 4);
const RV_MOUTH = boxFaces(0, 36, 16, 3, 16);
const RV_BODY = boxFaces(0, 55, 14, 16, 20);
const RV_BELLY = boxFaces(0, 91, 12, 13, 18);
const RV_NECK = boxFaces(68, 73, 10, 10, 18);
const RV_HORN = boxFaces(74, 55, 2, 14, 4);
const RV_HIND = boxFaces(96, 0, 8, 37, 8);
const RV_FRONT = boxFaces(64, 0, 8, 37, 8);

const HIDE: Pal = [0x4d4843, 0x57524c, 0x625c55, 0x6c665e, 0x777067, 0x827b71];
const HIDE_W: Pal = [1, 3, 5, 5, 3, 1];
const HIDE_DARK: Pal = [0x2e2b28, 0x36322f, 0x3e3a36, 0x46423d];
const PALE: Pal = [0x8e877b, 0x9a9387, 0xa69f92, 0xb2ab9d];
const HORN: Pal = [0xb4a888, 0xc2b797, 0xd0c6a6, 0xddd4b6];
const LEATHER: Pal = [0x3b2a1e, 0x453223, 0x503a29];

function ravager(): TexImage {
  const t = img(128, 128);
  const r = new Rand(0x7a4a6e7);
  // the head: pale bony plates over the brow, dark at the muzzle, small red eyes deep set
  noiseBox(t, RV_HEAD, r, PALE, { cell: 2, white: 0.35 });
  paintFace(t, RV_HEAD.bottom, (_x, _y, c) => mulC(c, 0.72));
  paintFace(t, RV_HEAD.front, (x, y, c, w) => {
    if (y >= 12) return pick(r, HIDE_DARK);
    if (y === 8 && (x === 3 || x === 4 || x === w - 4 || x === w - 5)) return 0x1c1210;
    if (y === 9 && (x === 3 || x === w - 4)) return 0xa8261c;
    if (y === 7 && x >= 2 && x <= w - 3) return mulC(c, 0.75);
    return undefined;
  });
  for (const k of ['right', 'left', 'back'] as FaceName[]) paintFace(t, RV_HEAD[k], (_x, y, c, _w, h) => (y >= h - 8 ? mixC(c, HIDE_DARK[2], 0.6) : undefined));
  noiseBox(t, RV_NOSE, r, HIDE_DARK, { cell: 1 });
  paintFace(t, RV_NOSE.front, (x, y) => (y === 5 && (x === 0 || x === 3) ? 0x120c0a : undefined));
  // the jaw: dark hide outside, a red mouth with teeth along its top
  noiseBox(t, RV_MOUTH, r, HIDE_DARK, { cell: 2 });
  paintFace(t, RV_MOUTH.top, (x, y, _c, w) => (y === 0 || x === 0 || x === w - 1 ? ((x + y) % 2 === 0 ? 0xe8e0c8 : 0xcfc5a8) : pick(r, [0x5c1712, 0x6c1c16, 0x7a241c])));
  // the horns: bone, darker towards the tips
  noiseBox(t, RV_HORN, r, HORN, { cell: 1 });
  for (const k of SIDES) paintFace(t, RV_HORN[k], (_x, y, c) => (y < 4 ? mulC(c, 0.72 + y * 0.06) : undefined));
  // the neck and body: rough grey-brown hide, paler underneath
  noiseBox(t, RV_NECK, r, HIDE, { w: HIDE_W, cell: 2 });
  paintFace(t, RV_NECK.bottom, (_x, _y, c) => mixC(c, PALE[1], 0.35));
  noiseBox(t, RV_BODY, r, HIDE, { w: HIDE_W, cell: 2 });
  noiseBox(t, RV_BELLY, r, HIDE, { w: HIDE_W, cell: 2 });
  // (the body's box lies along it: its front face is the belly, its back face the back)
  paintFace(t, RV_BODY.front, (_x, _y, c) => mixC(c, PALE[1], 0.4));
  paintFace(t, RV_BELLY.front, (_x, _y, c) => mixC(c, PALE[1], 0.45));
  // (a saddle strap over the back and down the flanks, a buckle each side)
  paintFace(t, RV_BODY.back, (_x, y) => (y >= 5 && y <= 8 ? pick(r, LEATHER) : undefined));
  for (const k of ['right', 'left'] as FaceName[])
    paintFace(t, RV_BODY[k], (x, y) => {
      if (x >= 5 && x <= 8) return pick(r, LEATHER);
      if ((x === 4 || x === 9) && y >= 6 && y <= 8) return 0x8a7a5a;
      return undefined;
    });
  // (shaggier, darker hair along the spine)
  paintFace(t, RV_BODY.back, (x, y, c, w) => (x >= w / 2 - 1 && x <= w / 2 && (y < 4 || y > 9) ? mulC(c, 0.7) : undefined));
  // the legs: hide, dark hooves
  for (const leg of [RV_HIND, RV_FRONT]) {
    noiseBox(t, leg, r, HIDE, { w: HIDE_W, cell: 2 });
    for (const k of SIDES) paintFace(t, leg[k], (_x, y, c, _w, h) => (y >= h - 5 ? pick(r, HIDE_DARK) : y < 3 ? mulC(c, 0.9) : undefined));
    noiseFace(t, leg.bottom, r, HIDE_DARK);
  }
  return t;
}

// ---------------------------------------------------------------------------
// the fangs (vanilla EvokerFangsModel, 64x32)

const FANG_BASE = boxFaces(0, 0, 10, 12, 10);
const FANG_JAW = boxFaces(40, 0, 4, 14, 8);

function evokerFangs(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0xfa465);
  // the base: dark stone, rough
  noiseBox(t, FANG_BASE, r, [0x2a2826, 0x33302d, 0x3c3935, 0x46423e], { cell: 2 });
  // the jaws: bone, a row of teeth along the biting edge (the jaw's front and back faces' far end)
  noiseBox(t, FANG_JAW, r, [0xb8ae94, 0xc9bfa4, 0xd8cfb6, 0xe6dec8], { cell: 1 });
  for (const k of ['right', 'left'] as FaceName[])
    paintFace(t, FANG_JAW[k], (x, y, c, w) => {
      if (y < 2) return x % 2 === 0 ? 0xf4efe2 : null;
      if (y === 2) return 0xa89c80;
      if (x === 0 || x === w - 1) return mulC(c, 0.85);
      return undefined;
    });
  for (const k of ['front', 'back'] as FaceName[]) paintFace(t, FANG_JAW[k], (x, y, c) => (y < 2 ? (x % 2 === 0 ? 0xf4efe2 : null) : undefined));
  paintFace(t, FANG_JAW.top, (x) => (x % 2 === 0 ? 0xf4efe2 : 0xd8cfb6));
  return t;
}

// ---------------------------------------------------------------------------
// the totem's glitter (vanilla particle/glitter_0..7: a sparkle that shrinks away, white to be tinted)

// prettier-ignore
const GLITTER: string[][] = [
  ['...#....', '...#....', '..###...', '#######.', '..###...', '...#....', '...#....', '........'],
  ['...#....', '...#....', '..###...', '.#####..', '..###...', '...#....', '...#....', '........'],
  ['........', '...#....', '..###...', '.#####..', '..###...', '...#....', '........', '........'],
  ['........', '...#....', '...#....', '.#####..', '...#....', '...#....', '........', '........'],
  ['........', '........', '...#....', '..###...', '...#....', '........', '........', '........'],
  ['........', '........', '...#....', '..#.#...', '...#....', '........', '........', '........'],
  ['........', '........', '........', '...#....', '........', '........', '........', '........'],
  ['........', '........', '........', '...#....', '........', '........', '........', '........'],
];
function glitter(i: number): TexImage {
  const t = img(8, 8);
  GLITTER[i].forEach((row, y) => {
    for (let x = 0; x < 8; x++) if (row[x] === '#') plot(t, x, y, x === 3 && y === 3 ? 0xffffff : 0xe8e8e8);
  });
  return t;
}

MOB_TEXTURES.pillager = () => illager(LOOKS.pillager);
MOB_TEXTURES.vindicator = () => illager(LOOKS.vindicator);
MOB_TEXTURES.evoker = () => illager(LOOKS.evoker);
MOB_TEXTURES.vex = () => vex(false);
MOB_TEXTURES.vex_charging = () => vex(true);
MOB_TEXTURES.ravager = ravager;
MOB_TEXTURES.evoker_fangs = evokerFangs;
for (let i = 0; i < 8; i++) MOB_PARTICLE_TEXTURES[`glitter_${i}`] = () => glitter(i);

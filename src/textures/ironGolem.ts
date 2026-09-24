// The iron golem (vanilla textures/entity/iron_golem, on IronGolemModel's 128x128 layout): riveted grey-white iron
// with a heavy brow over deep red eyes and a long nose, a narrow dark waist, arms that hang to its knees, and vines
// growing over its chest, shoulder and leg. The crackiness layers (low, medium, high) are cracks drawn over the same
// layout, each level keeping the last one's and adding more. Original pixel art in the style of vanilla 1.21.

import { TexImage, img, plot, getPx, getA, clear, mixC, mulC } from './tex';
import { Rand } from '../core/rng';
import { MOB_TEXTURES, boxFaces, noiseFace, paintFace, SIDES, FACES, type Box, type Face, type FaceName } from './mobs';

// ---------------------------------------------------------------------------
// the layout (vanilla IronGolemModel.createBodyLayer)

const HEAD = boxFaces(0, 0, 8, 10, 8);
const NOSE = boxFaces(24, 0, 2, 4, 2);
const CHEST = boxFaces(0, 40, 18, 12, 11);
const WAIST = boxFaces(0, 70, 9, 5, 6);
const RIGHT_ARM = boxFaces(60, 21, 4, 30, 6);
const LEFT_ARM = boxFaces(60, 58, 4, 30, 6);
const RIGHT_LEG = boxFaces(37, 0, 6, 16, 5);
const LEFT_LEG = boxFaces(60, 0, 6, 16, 5);
const BOXES: Box[] = [HEAD, NOSE, CHEST, WAIST, RIGHT_ARM, LEFT_ARM, RIGHT_LEG, LEFT_LEG];

/** the iron: warm light greys, a touch of pink in the lightest (vanilla's golem isn't a cold grey) */
const IRON = [0xa39990, 0xb3a9a0, 0xc2b9b0, 0xcec6be, 0xd8d0c9, 0xe2dbd4, 0xebe6e0];
const IRON_W = [1, 2, 6, 12, 12, 6, 1];
/** the waist's darker iron */
const DARK = [0x5f5751, 0x6e655f, 0x7d746d, 0x8b8179, 0x978d84];
const DARK_W = [2, 5, 8, 5, 2];
const VINE_DARK = 0x2f4d1b;
const VINE = 0x436b27;
const VINE_LIGHT = 0x5f8f35;
const LEAF = [0x3d6424, 0x4d7a2c, 0x5f8f35, 0x72a33f];

// ---------------------------------------------------------------------------

function iron(t: TexImage, f: Face, r: Rand, pal = IRON, w = IRON_W): void {
  noiseFace(t, f, r, pal, { w, cell: 3, white: 0.3 });
}

/** darken toward a face's edges (the plates' rims catch less light) and its bottom rows */
function rim(t: TexImage, f: Face, edge: number, bottom: number, rows = 1): void {
  paintFace(t, f, (x, y, c, w, h) => {
    if (y >= h - rows) return mulC(c, bottom);
    if (x === 0 || x === w - 1) return mulC(c, edge);
    return undefined;
  });
}

/** a row of rivets across a face (a darker dot with a light glint above it) */
function rivets(t: TexImage, f: Face, y: number, xs: number[]): void {
  for (const x of xs) {
    const c = getPx(t, f[0] + x, f[1] + y);
    plot(t, f[0] + x, f[1] + y, mulC(c, 0.72));
    if (y > 0) plot(t, f[0] + x, f[1] + y - 1, mixC(c, 0xf4efe9, 0.45));
  }
}

/** a seam between two plates: a dark line with a lit edge below it */
function seamRow(t: TexImage, f: Face, y: number, from = 0, to = f[2]): void {
  for (let x = from; x < to; x++) {
    plot(t, f[0] + x, f[1] + y, mulC(getPx(t, f[0] + x, f[1] + y), 0.66));
    if (y + 1 < f[3]) plot(t, f[0] + x, f[1] + y + 1, mixC(getPx(t, f[0] + x, f[1] + y + 1), 0xf4efe9, 0.25));
  }
}

function seamCol(t: TexImage, f: Face, x: number, from = 0, to = f[3]): void {
  for (let y = from; y < to; y++) plot(t, f[0] + x, f[1] + y, mulC(getPx(t, f[0] + x, f[1] + y), 0.7));
}

/**
 * a vine creeping down a face from (x, y0): a wandering stem (a pixel wide, dark), with a leaf now and then to one
 * side; returns where it ended so a vine can carry on round a corner
 */
function vine(t: TexImage, f: Face, r: Rand, x: number, y0: number, len: number, leafEvery = 3): number {
  let cx = x;
  for (let i = 0; i < len; i++) {
    const y = y0 + i;
    if (y >= f[3]) break;
    if (i > 0 && r.chance(0.3)) cx = Math.max(0, Math.min(f[2] - 1, cx + (r.nextBool() ? 1 : -1)));
    plot(t, f[0] + cx, f[1] + y, r.chance(0.3) ? VINE_DARK : VINE);
    if (i % leafEvery === leafEvery - 1 || r.chance(0.18)) {
      const side = r.nextBool() ? 1 : -1;
      for (const [dx, dy, c] of [[side, 0, LEAF[2 + r.nextInt(2)]], [side * 2, 0, LEAF[1]], [side, -1, LEAF[3]], [side, 1, LEAF[0]]] as [number, number, number][]) {
        const px = cx + dx, py = y + dy;
        if (px < 0 || px >= f[2] || py < 0 || py >= f[3]) continue;
        if (r.chance(0.8)) plot(t, f[0] + px, f[1] + py, c);
      }
    }
  }
  return cx;
}

/** a vine running round a box's sides at a height, a band that dips and rises */
function vineBand(t: TexImage, b: Box, r: Rand, y: number, faces: FaceName[] = SIDES): void {
  let cy = y;
  for (const k of faces) {
    const f = b[k];
    for (let x = 0; x < f[2]; x++) {
      if (r.chance(0.25)) cy = Math.max(y - 1, Math.min(y + 1, cy + (r.nextBool() ? 1 : -1)));
      plot(t, f[0] + x, f[1] + cy, r.chance(0.3) ? VINE_DARK : VINE);
      if (r.chance(0.35)) plot(t, f[0] + x, f[1] + cy + (r.nextBool() ? 1 : -1), LEAF[1 + r.nextInt(3)]);
      if (r.chance(0.12)) plot(t, f[0] + x, f[1] + cy + 2, VINE_LIGHT);
    }
  }
}

// ---------------------------------------------------------------------------

function ironGolem(): TexImage {
  const t = img(128, 128);
  const r = new Rand(0x901e3);
  for (const b of [HEAD, NOSE, CHEST, RIGHT_ARM, LEFT_ARM, RIGHT_LEG, LEFT_LEG]) for (const k of FACES) iron(t, b[k], r);
  for (const k of FACES) iron(t, WAIST[k], r, DARK, DARK_W);

  // --- the head: a flat top, the brow, red eyes sunk under it, and the long nose
  rim(t, HEAD.front, 0.9, 0.8);
  for (const k of ['right', 'left', 'back'] as FaceName[]) rim(t, HEAD[k], 0.92, 0.8);
  const face = HEAD.front;
  const P = (x: number, y: number, c: number) => plot(t, face[0] + x, face[1] + y, c);
  const at = (x: number, y: number) => getPx(t, face[0] + x, face[1] + y);
  // the brow: one heavy ridge right across, lit along its top
  for (let x = 0; x < 8; x++) {
    P(x, 2, mixC(at(x, 2), 0xf1ebe4, 0.35));
    P(x, 3, x === 0 || x === 7 ? 0x6f665f : 0x585049);
  }
  // under it, the sockets in shadow and the eyes in them
  for (let x = 0; x < 8; x++) P(x, 4, mulC(at(x, 4), x === 3 || x === 4 ? 0.85 : 0.68));
  P(1, 4, 0x5e0d09);
  P(2, 4, 0x9c2317);
  P(5, 4, 0x9c2317);
  P(6, 4, 0x5e0d09);
  for (let x = 0; x < 8; x++) if (x < 3 || x > 4) P(x, 5, mulC(at(x, 5), 0.86));
  // (a crease each side of the nose, down to the chin)
  for (let y = 6; y < 10; y++) {
    P(2, y, mulC(at(2, y), 0.88));
    P(5, y, mulC(at(5, y), 0.88));
  }
  // the brow seen from the sides, and the back of the head's seam
  for (const k of ['right', 'left'] as FaceName[]) {
    const f = HEAD[k];
    for (let x = 0; x < 8; x++) plot(t, f[0] + x, f[1] + 3, mulC(getPx(t, f[0] + x, f[1] + 3), k === 'right' ? (x > 4 ? 0.62 : 0.9) : x < 3 ? 0.62 : 0.9));
  }
  seamRow(t, HEAD.back, 6);
  // the top of the head: a plate with its rivets
  rivets(t, HEAD.top, 1, [1, 6]);
  rivets(t, HEAD.top, 6, [1, 6]);
  // the nose: lit on top, its tip in shadow
  paintFace(t, NOSE.front, (_x, y, c) => (y === 0 ? mixC(c, 0xf1ebe4, 0.3) : y === 3 ? mulC(c, 0.78) : undefined));
  for (const k of ['right', 'left'] as FaceName[]) paintFace(t, NOSE[k], (_x, _y, c) => mulC(c, 0.9));
  paintFace(t, NOSE.bottom, (_x, _y, c) => mulC(c, 0.62));
  // a vine up the left of its head from the neck
  vine(t, HEAD.left, r, 5, 5, 5, 2);

  // --- the chest: two plates either side of a seam, rivets along the collar, and vines
  const cf = CHEST.front;
  rim(t, cf, 0.9, 0.78, 2);
  seamCol(t, cf, 8, 1, 12);
  seamCol(t, cf, 9, 1, 12);
  paintFace(t, cf, (x, y, c) => (y === 0 ? mixC(c, 0xf4efe9, 0.3) : x === 10 && y > 0 ? mixC(c, 0xf4efe9, 0.18) : undefined));
  rivets(t, cf, 2, [2, 6, 11, 15]);
  // the pectoral plates' lower edges
  seamRow(t, cf, 7, 1, 7);
  seamRow(t, cf, 7, 11, 17);
  for (const k of ['right', 'left', 'back'] as FaceName[]) rim(t, CHEST[k], 0.9, 0.78, 2);
  seamRow(t, CHEST.back, 5, 1, 17);
  rivets(t, CHEST.back, 2, [3, 14]);
  paintFace(t, CHEST.bottom, (_x, _y, c) => mulC(c, 0.72));
  // vines: from the right shoulder down its front, over the shoulder and down its back
  const vx = vine(t, cf, r, 3, 0, 12, 3);
  vine(t, cf, r, Math.min(17, vx + 3), 6, 6, 2);
  vine(t, CHEST.top, r, 2, 0, 11, 3);
  vine(t, CHEST.back, r, 14, 0, 9, 3);
  vine(t, CHEST.right, r, 7, 0, 8, 2);

  // --- the waist: dark iron, a belt of rivets
  rivets(t, WAIST.front, 2, [1, 4, 7]);
  rivets(t, WAIST.back, 2, [1, 4, 7]);
  for (const k of SIDES) rim(t, WAIST[k], 0.88, 0.75);

  // --- the arms: long bars of iron, a plate line at the elbow, knuckles at the fist
  for (const arm of [RIGHT_ARM, LEFT_ARM]) {
    for (const k of SIDES) {
      rim(t, arm[k], 0.88, 0.7);
      seamRow(t, arm[k], 12);
      // (the fist: the last eight rows, a little darker, the knuckles along its front)
      paintFace(t, arm[k], (_x, y, c, _w, h) => (y >= h - 8 ? mulC(c, 0.92) : undefined));
    }
    seamRow(t, arm.front, 22);
    rivets(t, arm.front, 25, [1, 2]);
    rivets(t, arm.right, 3, [2]);
    rivets(t, arm.left, 3, [3]);
    paintFace(t, arm.bottom, (_x, _y, c) => mulC(c, 0.8));
  }
  // a vine wound round the right arm's shoulder
  vineBand(t, RIGHT_ARM, r, 4);
  vine(t, RIGHT_ARM.front, r, 1, 5, 7, 2);
  vine(t, RIGHT_ARM.right, r, 3, 5, 5, 2);

  // --- the legs: a knee plate, the feet darker
  for (const leg of [RIGHT_LEG, LEFT_LEG]) {
    for (const k of SIDES) {
      rim(t, leg[k], 0.88, 0.68, 2);
      seamRow(t, leg[k], 7);
    }
    rivets(t, leg.front, 9, [1, 4]);
    paintFace(t, leg.bottom, (_x, _y, c) => mulC(c, 0.7));
  }
  // vines up the right leg from the ground
  vine(t, RIGHT_LEG.front, r, 1, 3, 13, 3);
  vine(t, RIGHT_LEG.right, r, 2, 8, 8, 2);
  return t;
}

// ---------------------------------------------------------------------------
// crackiness (vanilla IronGolemCrackinessLayer: iron_golem_crackiness_low / _medium / _high)

interface Crack {
  f: Face;
  x: number;
  y: number;
  len: number;
  seed: number;
}

/** every crack the golem can get, in the order they appear: the chest and head first, then limbs, then everywhere */
function allCracks(): Crack[] {
  const r = new Rand(0xc4ac5);
  const out: Crack[] = [];
  const add = (f: Face, n: number, lo: number, hi: number) => {
    for (let i = 0; i < n; i++) out.push({ f, x: r.nextInt(f[2]), y: r.nextInt(Math.max(1, f[3] - 2)), len: lo + r.nextInt(hi - lo + 1), seed: r.nextInt(1 << 30) });
  };
  // low (the first 7)
  add(CHEST.front, 3, 4, 7);
  add(HEAD.front, 1, 3, 4);
  add(RIGHT_ARM.front, 1, 5, 8);
  add(LEFT_LEG.front, 1, 4, 6);
  add(CHEST.back, 1, 4, 6);
  // medium (the next 12)
  add(CHEST.front, 2, 5, 8);
  add(CHEST.right, 1, 4, 6);
  add(CHEST.left, 1, 4, 6);
  add(LEFT_ARM.front, 2, 5, 9);
  add(RIGHT_ARM.left, 1, 5, 8);
  add(RIGHT_LEG.front, 1, 4, 7);
  add(HEAD.left, 1, 3, 5);
  add(CHEST.back, 2, 4, 7);
  add(WAIST.front, 1, 2, 4);
  // high (the rest)
  for (const b of BOXES) for (const k of SIDES) if (b !== NOSE) add(b[k], b === CHEST ? 2 : 1, 3, 8);
  add(CHEST.top, 2, 4, 7);
  add(HEAD.top, 1, 3, 5);
  return out;
}

const CRACKS_AT: Record<'low' | 'medium' | 'high', number> = { low: 7, medium: 19, high: Infinity };

/** a crack: a jagged dark line that forks now and then, its broken edges lighter */
function drawCrack(t: TexImage, c: Crack): void {
  const r = new Rand(c.seed);
  const [x0, y0, w, h] = c.f;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const walk = (sx: number, sy: number, n: number, dir: number, depth: number) => {
    let x = sx, y = sy, d = dir;
    for (let i = 0; i < n; i++) {
      if (!inside(x, y)) return;
      plot(t, x0 + x, y0 + y, i % 3 === 1 ? 0x2a2420 : 0x3a322d);
      // (the lip of the break catches the light on one side)
      if (inside(x + 1, y) && getA(t, x0 + x + 1, y0 + y) === 0) plot(t, x0 + x + 1, y0 + y, 0x9e948b, 150);
      if (depth < 2 && r.chance(0.16)) walk(x, y, Math.max(2, (n - i) >> 1), r.nextBool() ? d + 1 : d - 1, depth + 1);
      // mostly down the face, veering left and right
      if (r.chance(0.35)) d += r.nextBool() ? 1 : -1;
      d = Math.max(-1, Math.min(1, d));
      if (r.chance(0.65)) y++;
      else x += d || (r.nextBool() ? 1 : -1);
      x += r.chance(0.3) ? d : 0;
    }
  };
  walk(c.x, c.y, c.len, r.nextInt(3) - 1, 0);
}

function crackiness(level: 'low' | 'medium' | 'high'): TexImage {
  const t = img(128, 128);
  const cracks = allCracks();
  const n = Math.min(cracks.length, CRACKS_AT[level]);
  for (let i = 0; i < n; i++) drawCrack(t, cracks[i]);
  // (anything outside the model's faces stays clear)
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) if (!onModel(x, y)) clear(t, x, y);
  return t;
}

function onModel(x: number, y: number): boolean {
  for (const b of BOXES) for (const k of FACES) {
    const [fx, fy, w, h] = b[k];
    if (x >= fx && y >= fy && x < fx + w && y < fy + h) return true;
  }
  return false;
}

MOB_TEXTURES.iron_golem = ironGolem;
MOB_TEXTURES.iron_golem_crackiness_low = () => crackiness('low');
MOB_TEXTURES.iron_golem_crackiness_medium = () => crackiness('medium');
MOB_TEXTURES.iron_golem_crackiness_high = () => crackiness('high');

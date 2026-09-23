// Mob textures: entity skins in the vanilla box-UV layouts, mob-related
// particles, spawn eggs, the arrow entity, experience orbs and the fire
// animation. Original procedural pixel art in the style of vanilla 1.21.
//
// Box-UV reminder (cube at texture offset u,v with size w,h,d):
//   top [u+d, v, w, d]      bottom [u+d+w, v, w, d]
//   right [u, v+d, d, h]    front [u+d, v+d, w, h]
//   left [u+d+w, v+d, d, h] back [u+2d+w, v+d, w, h]
// "right" is the creature's own right side (model -X). On top/bottom rects the
// row nearest v+d is the front edge. Quadruped/chicken bodies are rotated 90°
// about X: "front" = belly, "back" = spine, "top" = chest, "bottom" = rump, and
// on the side faces the top rows are the head end, the column next to the belly
// rect is the belly edge.

import { TexImage, AnimTex, img, cloneImg, plot, clear, getPx, mixC, mulC, valueNoise, equalize, Rand } from './tex';
import { BOAT_TEXTURES } from './boats';

// ---------------------------------------------------------------------------
// Helpers

type Face = [number, number, number, number]; // x, y, w, h
type FaceName = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back';
type Box = Record<FaceName, Face>;
type Pal = readonly number[];

const FACES: FaceName[] = ['top', 'bottom', 'right', 'front', 'left', 'back'];
const SIDES: FaceName[] = ['right', 'front', 'left', 'back'];

function boxFaces(u: number, v: number, w: number, h: number, d: number): Box {
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + d + w + d, v + d, w, h],
  };
}

/** Weighted palette pick. */
function pick(r: Rand, pal: Pal, w?: Pal): number {
  if (!w) return pal[r.nextInt(pal.length)];
  let s = 0;
  for (const x of w) s += x;
  let k = r.next() * s;
  for (let i = 0; i < pal.length; i++) {
    k -= w[i];
    if (k < 0) return pal[i];
  }
  return pal[pal.length - 1];
}

/** Clustered pixel noise in [0,1]: periodic value noise blended with white noise. */
function mottle(r: Rand, w: number, h: number, cell = 2, white = 0.5): Float32Array {
  const v = valueNoise(r, w, h, cell);
  for (let i = 0; i < v.length; i++) v[i] = v[i] * (1 - white) + r.next() * white;
  return v;
}

interface NoiseOpts {
  /** relative coverage of each palette band */
  w?: Pal;
  /** value-noise cell size (clump size) */
  cell?: number;
  /** share of per-pixel white noise */
  white?: number;
  /** only paint where true (local face coords) */
  mask?: (x: number, y: number, w: number, h: number) => boolean;
}

/** Fill a face with palette noise. The field is equalized so `w` sets each band's coverage exactly. */
function noiseFace(t: TexImage, f: Face, r: Rand, pal: Pal, o: NoiseOpts = {}): void {
  const [x0, y0, w, h] = f;
  const v = equalize(mottle(r, w, h, o.cell ?? 2, o.white ?? 0.5));
  const ws = o.w ?? pal.map(() => 1);
  let tot = 0;
  for (const x of ws) tot += x;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (o.mask && !o.mask(x, y, w, h)) continue;
      const val = v[y * w + x] * tot;
      let k = 0, acc = ws[0];
      while (k < pal.length - 1 && val > acc) acc += ws[++k];
      plot(t, x0 + x, y0 + y, pal[k]);
    }
}

function noiseBox(t: TexImage, b: Box, r: Rand, pal: Pal, o: NoiseOpts = {}, faces: FaceName[] = FACES): void {
  for (const k of faces) noiseFace(t, b[k], r, pal, o);
}

/** Per-pixel edit of a face: return a color, null (clear) or undefined (keep). */
function paintFace(t: TexImage, f: Face, fn: (x: number, y: number, c: number, w: number, h: number) => number | null | undefined): void {
  const [x0, y0, w, h] = f;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = fn(x, y, getPx(t, x0 + x, y0 + y), w, h);
      if (c === null) clear(t, x0 + x, y0 + y);
      else if (c !== undefined) plot(t, x0 + x, y0 + y, c);
    }
}

type Ink = number | null | Pal | (() => number);

/**
 * Draw string rows at (x0,y0). '.' keeps the existing pixel; every other char
 * must have an ink: a color, a palette (random pick), a generator, or null (clear).
 */
function draw(t: TexImage, x0: number, y0: number, rows: readonly string[], inks: Record<string, Ink>, r: Rand): void {
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      const ink = inks[ch];
      if (ink === undefined) throw new Error(`mob texture: unknown pattern char '${ch}'`);
      if (ink === null) clear(t, x0 + x, y0 + y);
      else plot(t, x0 + x, y0 + y, typeof ink === 'number' ? ink : typeof ink === 'function' ? ink() : ink[r.nextInt(ink.length)]);
    }
}

function drawFace(t: TexImage, f: Face, rows: readonly string[], inks: Record<string, Ink>, r: Rand): void {
  draw(t, f[0], f[1], rows, inks, r);
}

/** Sprinkle random pixels of `pal` over a face with probability p. */
function fleck(t: TexImage, f: Face, r: Rand, p: number, pal: Pal, w?: Pal): void {
  paintFace(t, f, () => (r.chance(p) ? pick(r, pal, w) : undefined));
}

// ---------------------------------------------------------------------------
// Pig (64x32)

function pig(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x9161);
  const SKIN = [0xdc8b87, 0xe79894, 0xeda19e, 0xf0a5a2, 0xf3afac, 0xf7bab7];
  const SW = [1, 3, 5, 16, 6, 2];
  const head = boxFaces(0, 0, 8, 8, 8);
  const snout = boxFaces(16, 16, 4, 3, 1);
  const body = boxFaces(28, 8, 10, 16, 8);
  const leg = boxFaces(0, 16, 4, 6, 4);
  noiseBox(t, head, r, SKIN, { w: SW });
  noiseBox(t, body, r, SKIN, { w: SW });
  noiseBox(t, leg, r, SKIN, { w: SW });
  // belly a touch lighter, a few darker bristly specks along the back
  noiseFace(t, body.front, r, SKIN, { w: [0, 1, 3, 14, 8, 3] });
  fleck(t, body.back, r, 0.05, [SKIN[0], SKIN[1]]);
  fleck(t, head.top, r, 0.05, [SKIN[0], SKIN[1]]);
  // eyes: black pupil on the outside, white towards the snout
  drawFace(t, head.front, ['........', '........', '........', 'Kw....wK'], { K: 0x151515, w: 0xffffff }, r);
  // snout
  noiseBox(t, snout, r, [0xe8a29e, 0xf2b5b2, 0xf6c2bf], { w: [1, 3, 2] });
  drawFace(t, snout.front, ['....', 'N..N', '....'], { N: 0x9c5450 }, r);
  // hooves
  for (const k of SIDES) paintFace(t, leg[k], (x, y, c, w, h) => (y === h - 1 ? mixC(c, 0x8c4c46, 0.35) : undefined));
  noiseFace(t, leg.bottom, r, [0xbd7a75, 0xc98782]);
  return t;
}

// ---------------------------------------------------------------------------
// Cow (64x32)

function cow(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0xc0ffee);
  const BR = [0x1f170f, 0x2a2017, 0x352a1e, 0x413324, 0x4b3c2b, 0x564533];
  const BRW = [1, 3, 5, 10, 5, 2];
  const WH = [0xc9c9c9, 0xd9d9d9, 0xe6e6e6, 0xf2f2f2, 0xffffff];
  const WHW = [1, 2, 4, 7, 6];
  const MZ = [0xa99c8f, 0xb8ab9e, 0xc6bbaf, 0xd2c9be];
  const white = () => pick(r, WH, WHW);
  const muzzle = () => pick(r, MZ, [1, 3, 4, 2]);
  const head = boxFaces(0, 0, 8, 8, 6);
  const horn = boxFaces(22, 0, 1, 3, 1);
  const body = boxFaces(18, 4, 12, 18, 10);
  const udder = boxFaces(52, 0, 4, 6, 1);
  const leg = boxFaces(0, 16, 4, 12, 4);

  // body: brown hide with big ragged white patches. The four side faces form one
  // strip that wraps around the barrel (right 0-9, belly 10-21, left 22-31,
  // spine 32-43; rows run head -> tail), so patches continue across edges.
  noiseBox(t, body, r, BR, { w: BRW });
  const patches = (w: number, h: number, ps: [number, number, number, number][], wrap: boolean) => {
    const jag = valueNoise(r, w, h, 3);
    return (x: number, y: number) => {
      for (const [cx, cy, rx, ry] of ps) {
        let dx = Math.abs(x + 0.5 - cx);
        if (wrap) dx = Math.min(dx, w - dx);
        const d = Math.hypot(dx / rx, (y + 0.5 - cy) / ry) + (jag[y * w + x] - 0.5) * 0.7;
        if (d < 1) return true;
      }
      return false;
    };
  };
  const strip = patches(44, 18, [[4, 11, 4.4, 4.4], [7, 2, 2.6, 2.1], [16, 9, 4.6, 5.2], [27, 5, 4.2, 4.6], [29, 15, 2.6, 2.3], [38, 13, 4.2, 3.8], [37, 3, 2.2, 1.9]], true);
  let off = 0;
  for (const k of SIDES) {
    const o = off;
    paintFace(t, body[k], (x, y) => (strip(o + x, y) ? white() : undefined));
    off += body[k][2];
  }
  const chest = patches(12, 10, [[6, 7.5, 3.6, 3]], false);
  const rump = patches(12, 10, [[3.5, 3, 3, 2.6], [10, 8, 2.2, 2]], false);
  paintFace(t, body.top, (x, y) => (chest(x, y) ? white() : undefined));
  paintFace(t, body.bottom, (x, y) => (rump(x, y) ? white() : undefined));

  // head: brown with a white face, pale muzzle
  noiseBox(t, head, r, BR, { w: BRW });
  const inks: Record<string, Ink> = { W: white, M: muzzle, E: 0x0c0c0c, e: 0x3e342c, N: 0x2c231b };
  drawFace(t, head.front, [
    '..WWWW..',
    '.WWWWWW.',
    'WWWWWWWW',
    'WEeWWeEW',
    'WWWWWWWW',
    'WMMMMMMW',
    'MNMMMMNM',
    'MMMMMMMM',
  ], inks, r);
  drawFace(t, head.right, [
    '......',
    '......',
    '.....W',
    '....WW',
    '.....W',
    '....WM',
    '...WMM',
    '....MM',
  ], inks, r);
  drawFace(t, head.left, [
    '...WW.',
    '..WWWW',
    'W..WW.',
    'WW....',
    'W.....',
    'MW....',
    'MMW...',
    'MM....',
  ], inks, r);
  drawFace(t, head.top, [
    '........',
    '........',
    '...W....',
    '..WWW...',
    '..WWWW..',
    '..WWWW..',
  ], inks, r);
  drawFace(t, head.bottom, [
    '........',
    '..WWWW..',
    '.WWWWWW.',
    'MMMMMMMM',
    'MMMMMMMM',
    'MMMMMMMM',
  ], inks, r);
  // horns: pale, a little darker at the base
  noiseBox(t, horn, r, [0xc4baa6, 0xd3cab8, 0xe0d9ca]);
  for (const k of SIDES) paintFace(t, horn[k], (x, y, c) => (y === 2 ? mulC(c, 0.85) : y === 0 ? mixC(c, 0xffffff, 0.3) : undefined));
  // udder
  noiseBox(t, udder, r, [0xd38b87, 0xe29f9b, 0xeeb3b0], { w: [1, 3, 2] });
  // legs: brown, white sock on the outer/front side, dark hooves
  noiseBox(t, leg, r, BR, { w: BRW });
  const LEG = [
    '................',
    '................',
    '................',
    '................',
    '................',
    '..W.............',
    '.WWWW...........',
    'WWWWWW.........W',
    'WWWWWWW.......WW',
    'WWWWWWW.......WW',
    'WWWWWWWW.....WWW',
    'HHHHHHHHHHHHHHHH',
  ];
  draw(t, 0, 20, LEG, { W: white, H: [0x2e2923, 0x38322b, 0x433c34] }, r);
  noiseFace(t, leg.bottom, r, [0x2e2923, 0x38322b, 0x433c34]);
  return t;
}

// ---------------------------------------------------------------------------
// Sheep (64x32) — sheared base layer

function sheep(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x5eef);
  const SKIN = [0xb09488, 0xc0a597, 0xceb4a6, 0xd9c1b4, 0xe3cec2];
  const SKW = [1, 3, 7, 6, 2];
  const WOOL = [0xcbcbcb, 0xd9d9d9, 0xe5e5e5, 0xefefef, 0xf8f8f8];
  const WOW = [1, 3, 6, 7, 4];
  const BARE = [0xc4a191, 0xd0af9f, 0xdab9aa, 0xe2c5b7, 0xead3c7];
  const BAW = [1, 3, 8, 6, 2];
  const LEG = [0xa99a90, 0xb9a99f, 0xc7b8ae, 0xd2c5bc];
  const head = boxFaces(0, 0, 6, 6, 8);
  const body = boxFaces(28, 8, 8, 16, 6);
  const leg = boxFaces(0, 16, 4, 12, 4);
  // head: woolly, with the bare face and muzzle end sticking out of the fleece
  noiseBox(t, head, r, WOOL, { w: WOW });
  noiseFace(t, head.front, r, SKIN, { w: SKW });
  noiseFace(t, head.right, r, SKIN, { w: SKW, mask: (x) => x >= 6 });
  noiseFace(t, head.left, r, SKIN, { w: SKW, mask: (x) => x <= 1 });
  noiseFace(t, head.top, r, SKIN, { w: SKW, mask: (_x, y) => y >= 6 });
  noiseFace(t, head.bottom, r, SKIN, { w: SKW, mask: (_x, y) => y >= 5 });
  drawFace(t, head.front, [
    '......',
    '......',
    'wK..Kw',
    '......',
    '..nn..',
    '..mm..',
  ], { K: 0x141414, w: 0xf6f6f6, n: 0xc98f8b, m: 0xb2837e }, r);
  // sheared body: bare pinkish skin with faint stubble
  noiseBox(t, body, r, BARE, { w: BAW });
  for (const k of FACES) fleck(t, body[k], r, 0.08, [0xf0e2da, 0xeadbd2]);
  // legs
  noiseBox(t, leg, r, LEG, { w: [1, 3, 5, 3] });
  for (const k of SIDES) paintFace(t, leg[k], (x, y, c, w, h) => (y === h - 1 ? mulC(c, 0.82) : undefined));
  noiseFace(t, leg.bottom, r, [0x8e8078, 0x9a8b82]);
  return t;
}

// ---------------------------------------------------------------------------
// Sheep wool layer (64x32) — tinted by dye color at runtime

function sheepFur(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0xf1eece);
  const WOOL = [0xd8d8d8, 0xe3e3e3, 0xececec, 0xf4f4f4, 0xfbfbfb, 0xffffff];
  const o: NoiseOpts = { w: [1, 2, 4, 6, 6, 4], cell: 2, white: 0.45 };
  noiseBox(t, boxFaces(0, 0, 6, 6, 6), r, WOOL, o);
  noiseBox(t, boxFaces(28, 8, 8, 16, 6), r, WOOL, o);
  noiseBox(t, boxFaces(0, 16, 4, 6, 4), r, WOOL, o);
  return t;
}

// ---------------------------------------------------------------------------
// Chicken (64x32)

function chicken(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0xc41c);
  const WH = [0xcfcfcf, 0xdedede, 0xebebeb, 0xf6f6f6, 0xffffff];
  const WHW = [1, 2, 4, 7, 9];
  const head = boxFaces(0, 0, 4, 6, 3);
  const beak = boxFaces(14, 0, 4, 2, 2);
  const wattle = boxFaces(14, 4, 2, 2, 2);
  const body = boxFaces(0, 9, 6, 8, 6);
  const leg = boxFaces(26, 0, 3, 5, 3);
  const wing = boxFaces(24, 13, 1, 4, 6);
  noiseBox(t, head, r, WH, { w: WHW });
  noiseBox(t, body, r, WH, { w: WHW });
  noiseBox(t, wing, r, WH, { w: WHW });
  drawFace(t, head.front, ['....', 'K..K'], { K: 0x111111 }, r);
  // beak and wattle
  noiseBox(t, beak, r, [0xd08a12, 0xe39f1c, 0xf2b52a, 0xfcca42], { w: [1, 3, 4, 2] });
  drawFace(t, beak.front, ['....', 'dDDd'], { d: 0xc27e10, D: 0xd49014 }, r);
  noiseBox(t, wattle, r, [0x9e0d0d, 0xbc1414, 0xd41e1e], { w: [1, 3, 2] });
  // thin legs with toes, the rest of the leg cube stays transparent
  const L = { L: 0xe9a224, l: 0xc98418 };
  const TOES: Record<string, string> = { right: '.lL', front: 'lLl', left: 'Ll.', back: '.l.' };
  for (const k of SIDES) drawFace(t, leg[k], ['.L.', '.L.', '.L.', '.L.', TOES[k]], L, r);
  drawFace(t, leg.top, ['...', '.L.', '...'], L, r);
  drawFace(t, leg.bottom, ['.l.', '.L.', 'lLl'], L, r);
  // feather tips on the wings, slight shading under the body
  for (const k of ['right', 'left'] as FaceName[]) paintFace(t, wing[k], (x, y, c) => (y === 3 && (x & 1) ? 0xc8c8c8 : undefined));
  return t;
}

// ---------------------------------------------------------------------------
// Zombie (64x64)

function zombie(): TexImage {
  const t = img(64, 64);
  const r = new Rand(0x20b1e);
  const SK = [0x33602a, 0x3d6e30, 0x467b37, 0x4f873e, 0x589146, 0x629b4f, 0x6ea85b];
  const SKW = [1, 2, 4, 7, 6, 3, 1];
  const HAIR = [0x1f3a16, 0x27461c, 0x2f5222, 0x375e29];
  const SH = [0x006666, 0x007878, 0x008a8a, 0x009c9c, 0x00acac, 0x14b8b8];
  const SHW = [1, 2, 3, 5, 6, 2];
  const PA = [0x2a2a68, 0x313176, 0x383882, 0x3e3e8e, 0x46469a, 0x5050a6];
  const PAW = [1, 2, 4, 6, 3, 1];
  const SHOE = [0x2f2f2f, 0x3b3b3b, 0x474747, 0x525252];
  const head = boxFaces(0, 0, 8, 8, 8);
  const body = boxFaces(16, 16, 8, 12, 4);
  const arm = boxFaces(40, 16, 4, 12, 4);
  const leg = boxFaces(0, 16, 4, 12, 4);

  // head
  noiseBox(t, head, r, SK, { w: SKW });
  noiseFace(t, head.top, r, HAIR, { w: [1, 2, 3, 2] });
  for (const k of SIDES) {
    const rows = k === 'back' ? 3 : k === 'front' ? 1 : 2;
    noiseFace(t, head[k], r, HAIR, { mask: (x, y) => y < rows || (y === rows && r.chance(0.4)) });
  }
  drawFace(t, head.front, [
    '........',
    'h......h',
    '........',
    '.bb..bb.',
    '.KE..EK.',
    '...nn...',
    '..mMMm..',
    '...cc...',
  ], {
    h: HAIR, b: SK[1], K: 0x000000, E: 0x121212, n: SK[1], m: 0x223f1b, M: 0x16290f, c: SK[2],
  }, r);

  // body: torn teal shirt, neck skin, trouser waistband at the bottom
  noiseBox(t, body, r, SH, { w: SHW });
  const pants = () => pick(r, PA, PAW);
  const sk = () => pick(r, SK, SKW);
  drawFace(t, body.front, [
    '...ss...',
    '....s...',
    '........',
    '........',
    '........',
    '.s......',
    '........',
    '........',
    '.....ss.',
    '........',
    'P.PP..PP',
    'PPPPPPPP',
  ], { s: sk, P: pants }, r);
  drawFace(t, body.back, [
    '........',
    '........',
    '........',
    '...s....',
    '...ss...',
    '........',
    '........',
    '........',
    '........',
    '........',
    'PP..PP.P',
    'PPPPPPPP',
  ], { s: sk, P: pants }, r);
  for (const k of ['right', 'left'] as FaceName[]) drawFace(t, body[k], ['....', '....', '....', '....', '....', '....', '....', '....', '....', '....', 'P.PP', 'PPPP'], { P: pants }, r);
  noiseFace(t, body.bottom, r, PA, { w: PAW });

  // arms: bare green skin, darker underside
  noiseBox(t, arm, r, SK, { w: SKW });
  for (const k of SIDES) paintFace(t, arm[k], (x, y, c, w, h) => (y >= h - 2 ? mulC(c, 0.92) : undefined));
  paintFace(t, arm.back, (x, y, c) => mulC(c, 0.9));

  // legs: trousers and shoes
  noiseBox(t, leg, r, PA, { w: PAW });
  for (const k of SIDES) noiseFace(t, leg[k], r, SHOE, { mask: (x, y) => y >= 10 || (y === 9 && r.chance(0.3)) });
  noiseFace(t, leg.bottom, r, SHOE);
  return t;
}

// ---------------------------------------------------------------------------
// Skeleton (64x32)

function skeleton(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x5ce1e7);
  const BN = [0x9a9a9a, 0xa8a8a8, 0xb4b4b4, 0xbdbdbd, 0xc6c6c6, 0xcfcfcf];
  const BNW = [1, 2, 4, 8, 5, 2];
  const head = boxFaces(0, 0, 8, 8, 8);
  const body = boxFaces(16, 16, 8, 12, 4);
  const arm = boxFaces(40, 16, 2, 12, 2);
  const leg = boxFaces(0, 16, 2, 12, 2);
  noiseBox(t, head, r, BN, { w: BNW });
  for (const k of ['top', 'right', 'left', 'back'] as FaceName[]) fleck(t, head[k], r, 0.05, [0x858585, 0x8f8f8f]);
  drawFace(t, head.front, [
    '........',
    '........',
    '........',
    '.KK..KK.',
    '.kK..Kk.',
    '...nn...',
    '.DtDDtD.',
    '........',
  ], { K: 0x0d0d0d, k: 0x1f1f1f, n: 0x3a3a3a, D: 0x262626, t: 0x9a9a9a }, r);
  // ribcage: solid rib rows, open gaps elsewhere except the spine (front/back)
  noiseBox(t, body, r, BN, { w: BNW });
  const RIB = [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1];
  for (const k of SIDES) {
    const spine = k === 'front' || k === 'back';
    paintFace(t, body[k], (x, y) => (!RIB[y] && !(spine && (x === 3 || x === 4)) ? null : undefined));
  }
  // limbs: bone with darker joints
  for (const b of [arm, leg]) {
    noiseBox(t, b, r, BN, { w: BNW });
    for (const k of SIDES) paintFace(t, b[k], (x, y, c) => (y === 5 || y === 6 ? mulC(c, 0.88) : undefined));
  }
  return t;
}

// ---------------------------------------------------------------------------
// Creeper (64x32)

function creeper(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0xc4ee);
  const G = [0x0c5a0c, 0x1a741a, 0x288e28, 0x37a837, 0x4dbb4d, 0x6fcb6f, 0x9cd69c];
  const GW = [2, 3, 5, 6, 5, 3, 1];
  const head = boxFaces(0, 0, 8, 8, 8);
  const body = boxFaces(16, 16, 8, 12, 4);
  const leg = boxFaces(0, 16, 4, 6, 4);
  for (const b of [head, body, leg]) {
    noiseBox(t, b, r, G, { w: GW, cell: 1.6, white: 0.55 });
    for (const k of FACES) fleck(t, b[k], r, 0.01, [0xcfd9cf, 0xe6ece6]);
  }
  drawFace(t, head.front, [
    '........',
    '........',
    '.XX..XX.',
    '.XX..XX.',
    '...XX...',
    '..XXXX..',
    '..XXXX..',
    '..X..X..',
  ], { X: () => pick(r, [0x000000, 0x0e0e0e, 0x1a1f1a], [6, 3, 1]) }, r);
  return t;
}

// ---------------------------------------------------------------------------
// Spider (64x32) + emissive eyes

// 8x8 front face of the head; E = large eyes, e = small eyes
const SPIDER_EYES = [
  '........',
  'e.e..e.e',
  '........',
  '.EE..EE.',
  '.EE..EE.',
  '........',
  '.e....e.',
  '........',
];

interface SpiderLook {
  seed: number;
  /** body shades, dark to light, and their coverage */
  pal: Pal;
  w: Pal;
  /** abdomen / leg markings: a = speckle, h = lighter hair */
  a: number;
  h: number;
}

const SPIDER_LOOK: SpiderLook = { seed: 0x5b1de4, pal: [0x1a1511, 0x221c17, 0x2a241e, 0x332c26, 0x3b342d, 0x474036, 0x574d43], w: [2, 4, 6, 7, 4, 2, 1], a: 0x4a4038, h: 0x5a4e44 };
/** vanilla cave_spider.png: the spider layout in dark blue-teal with pale teal hair */
const CAVE_SPIDER_LOOK: SpiderLook = { seed: 0xca5e5b, pal: [0x07161a, 0x0a1e23, 0x0e272d, 0x123139, 0x173c45, 0x1f4c57, 0x2a606b], w: [2, 4, 6, 7, 4, 2, 1], a: 0x2c6a74, h: 0x3f8490 };

function spider(look: SpiderLook = SPIDER_LOOK): TexImage {
  const t = img(64, 32);
  const r = new Rand(look.seed);
  const SP = look.pal;
  const SPW = look.w;
  const head = boxFaces(32, 4, 8, 8, 8);
  const neck = boxFaces(0, 0, 6, 6, 6);
  const abdomen = boxFaces(0, 12, 10, 8, 12);
  const leg = boxFaces(18, 0, 16, 2, 2);
  for (const b of [head, neck, abdomen, leg]) noiseBox(t, b, r, SP, { w: SPW });
  drawFace(t, head.front, SPIDER_EYES, { E: 0x8a0a0a, e: 0x740808 }, r);
  // hairy markings on top of the abdomen (bottom rows of the rect face the thorax)
  drawFace(t, abdomen.top, [
    '....aa....',
    '...a..a...',
    '..h.hh.h..',
    '....hh....',
    '.a..aa..a.',
    '..a.hh.a..',
    '...h..h...',
    '....hh....',
    '.h..aa..h.',
    '..a....a..',
    '....hh....',
    '..........',
  ], { a: look.a, h: look.h }, r);
  for (const k of SIDES) fleck(t, leg[k], r, 0.1, [look.a, look.h]);
  return t;
}

function spiderEyes(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x5b1de5);
  draw(t, 40, 12, SPIDER_EYES, { E: [0xff0000, 0xff1c1c, 0xe80000], e: 0xc80000 }, r);
  return t;
}

// ---------------------------------------------------------------------------
// Enderman (64x32) + emissive eyes

// row 4 of the head front: a magenta slit per eye with a paler centre
const ENDER_EYES = ['........', '........', '........', '........', 'PLP..PLP'];

function enderman(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0xe7de4);
  const EN = [0x000000, 0x070707, 0x0d0d0d, 0x131313, 0x191919];
  const ENW = [3, 5, 5, 3, 1];
  const head = boxFaces(0, 0, 8, 8, 8);
  const jaw = boxFaces(0, 16, 8, 8, 8);
  const body = boxFaces(32, 16, 8, 12, 4);
  const limb = boxFaces(56, 0, 2, 30, 2);
  for (const b of [head, jaw, body, limb]) {
    noiseBox(t, b, r, EN, { w: ENW });
    for (const k of FACES) fleck(t, b[k], r, 0.03, [0x1f1b22, 0x241f28, 0x2a2430]);
  }
  drawFace(t, head.front, ENDER_EYES, { P: 0xcc00fa, L: 0xe079fa }, r);
  return t;
}

function endermanEyes(): TexImage {
  const t = img(64, 32);
  const r = new Rand(1);
  draw(t, 8, 8, ENDER_EYES, { P: 0xcc00fa, L: 0xe079fa }, r);
  return t;
}

// ---------------------------------------------------------------------------
// Squid (64x32)

function squid(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x5901d);
  const NAVY = [0x1a2e42, 0x1f3a55, 0x244360, 0x284b69, 0x2d5372, 0x345e7e];
  const NW = [1, 3, 5, 7, 4, 2];
  const LIGHT = [0x46647e, 0x54728b, 0x62809a, 0x728fa6];
  const body = boxFaces(0, 0, 12, 16, 12);
  const ten = boxFaces(48, 0, 2, 18, 2);
  noiseBox(t, body, r, NAVY, { w: NW });
  const fade = (y: number, h: number, from: number) => {
    const k = (y - from) / (h - from);
    return k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
  };
  for (const k of SIDES) paintFace(t, body[k], (x, y, c, w, h) => (r.next() < fade(y, h, 9) ? pick(r, LIGHT) : undefined));
  noiseFace(t, body.bottom, r, LIGHT);
  drawFace(t, body.bottom, ['............', '............', '............', '............', '.....dd.....', '....dDDd....', '....dDDd....', '.....dd.....'], { d: 0x2a4258, D: 0x16222e }, r);
  for (const k of ['right', 'left'] as FaceName[])
    drawFace(t, body[k], ['', '', '', '', '.....LL', '....LKKL', '.....LL'], { L: [0x7d97ab, 0x8aa2b4], K: 0x0a121a }, r);
  // tentacles
  noiseBox(t, ten, r, NAVY, { w: NW });
  for (const k of SIDES) paintFace(t, ten[k], (x, y, c, w, h) => (r.next() < fade(y, h, 4) ? pick(r, LIGHT) : undefined));
  return t;
}

// ---------------------------------------------------------------------------
// Slime (64x32)

function slime(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x511e);
  const outer = boxFaces(0, 0, 8, 8, 8);
  for (const k of FACES) {
    const [x0, y0, w, h] = outer[k];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        const c = edge ? pick(r, [0x7cc86b, 0x86cf76, 0x8fd680]) : pick(r, [0x62b552, 0x6abf5a, 0x72c562], [2, 4, 2]);
        plot(t, x0 + x, y0 + y, c, edge ? 190 : 150 + r.nextInt(20));
      }
    plot(t, x0 + 1, y0 + 1, 0xb4e8a8, 200);
  }
  noiseBox(t, boxFaces(0, 16, 6, 6, 6), r, [0x3e8531, 0x46903a, 0x4e9a3f, 0x57a548], { w: [1, 3, 5, 2] });
  noiseBox(t, boxFaces(32, 0, 2, 2, 2), r, [0x0f1c0c, 0x172a13]);
  noiseBox(t, boxFaces(32, 4, 2, 2, 2), r, [0x0f1c0c, 0x172a13]);
  noiseBox(t, boxFaces(32, 8, 1, 1, 1), r, [0x1a2c16]);
  return t;
}

// ---------------------------------------------------------------------------
// Magma cube (64x32, vanilla LavaSlimeModel): eight 8x1x8 slices whose side strips sit at rows 8-15 (u 0) and,
// for the eyes' rows 2 and 3, at rows 18 and 27 (u 24); their tops and bottoms overlap one another, as in
// vanilla's sheet. A dark, cooled crust veined with glowing lava, round a molten core.

function magmaCube(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x3a6a);
  const CRUST = [0x1c0605, 0x260807, 0x320b08, 0x3f0f09, 0x4e150b];
  const VEIN = [0x8e1f08, 0xc2370c, 0xe85a14, 0xfb8a22, 0xffbe3c];
  // one 8x8 look per face (a crust with a web of veins), cut into the slices' strips
  const face = (): number[] => {
    const px: number[] = [];
    for (let i = 0; i < 64; i++) px.push(pick(r, CRUST, [2, 3, 3, 2, 1]));
    // veins: a few short wandering runs, hottest in the middle of each run
    for (let k = 0; k < 3; k++) {
      let x = r.nextInt(8), y = r.nextInt(8);
      const len = 2 + r.nextInt(3);
      for (let i = 0; i < len; i++) {
        const heat = Math.min(4, Math.round(2 * Math.sin((Math.PI * (i + 0.5)) / len)) + (r.next() < 0.25 ? 2 : 1));
        px[y * 8 + x] = VEIN[heat];
        if (r.next() < 0.5) x = (x + (r.nextBool() ? 1 : 7)) % 8;
        else y = (y + (r.nextBool() ? 1 : 7)) % 8;
      }
    }
    return px;
  };
  const rowY = (i: number) => (i === 2 ? 18 : i === 3 ? 27 : 8 + i);
  const rowU = (i: number) => (i === 2 || i === 3 ? 24 : 0);
  // the sides: right, front, left, back
  for (let s = 0; s < 4; s++) {
    const f = face();
    // (the face's two eye rows stay plain crust so the eyes stand out)
    if (s === 1) for (let i = 16; i < 32; i++) f[i] = pick(r, CRUST, [2, 3, 3, 1, 0]);
    for (let i = 0; i < 8; i++) for (let x = 0; x < 8; x++) plot(t, rowU(i) + s * 8 + x, rowY(i), f[i * 8 + x]);
  }
  // the eyes, on the front of rows 2 and 3: glowing orange with a hot yellow top
  for (const ex of [1, 5]) {
    plot(t, 32 + ex, 18, 0xffd24a);
    plot(t, 33 + ex, 18, 0xffe27a);
    plot(t, 32 + ex, 27, 0xf36a16);
    plot(t, 33 + ex, 27, 0xfb8a22);
  }
  // tops and bottoms: the cube's top (8,0) and the undersides seen when the slices part
  const fill = (x0: number, y0: number, w: number, h: number) => {
    const f = face();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!getPx(t, x0 + x, y0 + y)) plot(t, x0 + x, y0 + y, f[(y % 8) * 8 + (x % 8)]);
  };
  fill(8, 0, 16, 8);
  fill(32, 10, 16, 8);
  fill(32, 19, 16, 8);
  // the molten core: bright orange going yellow in the middle
  const core = boxFaces(0, 16, 4, 4, 4);
  noiseBox(t, core, r, [0xe8580f, 0xf5781c, 0xfb9a2a, 0xffbf45, 0xffdc6e], { w: [1, 2, 3, 2, 1], cell: 1 });
  return t;
}

// ---------------------------------------------------------------------------
// Bat (32x32, the 1.20.3+ BatModel layout): body (0,0) 3x5x2, head (0,7) 4x3x2, and the flat
// parts with their front rect (the side the face looks to) left of the back rect: ears (1,15) /
// (8,15), inner wings (12,0) / (12,7), wing tips (16,0) / (16,8), feet (16,16).

// one wing seen from the front, columns counted from the body outwards (0-1 = inner wing, 2-7 =
// tip; the inner wing has 7 rows, the tip 8): 'B' the arm along the leading edge, 'b' finger
// bones, 'm' membrane, '.' nothing (the scalloped trailing edge)
const BAT_WING = [
  'BBBBBBBB',
  'mmmmbbBB',
  'mmmbmmbm',
  'mmmbmmbm',
  'mmbmmmbm',
  'mmbmmmbm',
  'm.bmm.b.',
  '..b...b.',
];

function bat(): TexImage {
  const t = img(32, 32);
  const r = new Rand(0xba7);
  const FUR = [0x3a2c21, 0x423226, 0x4a392b, 0x534031];
  const FW = [1, 3, 3, 1];
  const body = boxFaces(0, 0, 3, 5, 2);
  const head = boxFaces(0, 7, 4, 3, 2);
  noiseBox(t, body, r, FUR, { w: FW, cell: 1 });
  noiseBox(t, head, r, FUR, { w: FW, cell: 1 });
  // a lighter chest, a darker back, and a small face: eyes at the edges over a paler muzzle
  noiseFace(t, body.front, r, [0x584535, 0x614c3b, 0x6a5442], { w: [2, 3, 1], cell: 1 });
  noiseFace(t, body.back, r, [0x30241b, 0x382a20, 0x403025], { w: [1, 2, 2], cell: 1 });
  drawFace(t, head.front, ['....', 'EssE', '.nn.'], { E: 0x0c0907, s: [0x5c4838, 0x634d3c], n: 0x231913 }, r);
  // ears: pinkish-brown inside (front), fur outside, pointed tips
  const EAR = ['.o.', 'oio', 'oio', 'oio', 'ooo'];
  const EDGE = [0x33271e, 0x3a2c21];
  for (const u of [1, 8]) {
    draw(t, u, 15, EAR, { o: EDGE, i: [0x6a4a3c, 0x735142] }, r);
    draw(t, u + 3, 15, EAR.map((row) => row.replace(/i/g, 'o')), { o: FUR }, r);
  }
  // wings: `o(c)` maps a rect column to the distance from the body; the back (top side in flight) is darker
  const MEMBRANE = [0x2c231c, 0x30261e, 0x352a21];
  const wing = (x0: number, y0: number, w: number, h: number, o: (c: number) => number, back: boolean) => {
    for (let y = 0; y < h; y++)
      for (let c = 0; c < w; c++) {
        const ch = BAT_WING[y][o(c)];
        if (ch === '.') continue;
        const col = ch === 'B' ? pick(r, [0x4d3d30, 0x544334]) : ch === 'b' ? 0x43352a : pick(r, MEMBRANE);
        plot(t, x0 + c, y0 + y, back ? mulC(col, 0.86) : col);
      }
  };
  // the right wing's front rect runs from its tip (-X) inwards, the left one's from the body outwards
  wing(12, 0, 2, 7, (c) => 1 - c, false);
  wing(14, 0, 2, 7, (c) => c, true);
  wing(16, 0, 6, 8, (c) => 7 - c, false);
  wing(22, 0, 6, 8, (c) => 2 + c, true);
  wing(12, 7, 2, 7, (c) => c, false);
  wing(14, 7, 2, 7, (c) => 1 - c, true);
  wing(16, 8, 6, 8, (c) => 2 + c, false);
  wing(22, 8, 6, 8, (c) => 7 - c, true);
  // feet: two little clawed legs
  draw(t, 16, 16, ['k.k', 'k.k'], { k: 0x261c16 }, r);
  draw(t, 19, 16, ['k.k', 'k.k'], { k: 0x211813 }, r);
  return t;
}

// ---------------------------------------------------------------------------
// Minecart (64x32, vanilla MinecartModel layout): wall box at (0,0) 16x8x2 (front = inside face,
// back = outside face, top = rim), floor box at (0,10) 20x16x2 rotated flat (back = the floor
// inside, front = the underside, top/bottom/right/left = the base's edges), inner plate at (44,10).

function minecart(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x3ca47);
  const METAL = [0x767676, 0x7d7d7d, 0x848484, 0x8b8b8b, 0x929292];
  const MW = [1, 3, 5, 4, 1];
  const FLOOR = [0x404040, 0x464646, 0x4b4b4b, 0x505050];
  const FW = [1, 3, 4, 2];
  const wall = boxFaces(0, 0, 16, 8, 2);
  const base = boxFaces(0, 10, 20, 16, 2);
  const plate = boxFaces(44, 10, 18, 14, 1);
  // outside of the walls: riveted plates between darker corner posts, a bright lip and a dark foot
  noiseFace(t, wall.back, r, METAL, { w: MW });
  paintFace(t, wall.back, (x, y, c, w, h) => {
    if (x === 0 || x === w - 1) return y === 0 ? 0x9c9c9c : y === h - 1 ? 0x434343 : pick(r, [0x575757, 0x5d5d5d]);
    if (y === 0) return pick(r, [0xb4b4b4, 0xbababa]);
    if (y === 1) return mixC(c, 0xa6a6a6, 0.6);
    if (y === h - 2) return mulC(c, 0.8);
    if (y === h - 1) return pick(r, [0x4a4a4a, 0x505050]);
    if (x === 7) return mulC(c, 0.86);
    return undefined;
  });
  for (const [x, y] of [[2, 2], [5, 2], [10, 2], [13, 2], [2, 5], [5, 5], [10, 5], [13, 5]]) {
    plot(t, wall.back[0] + x, wall.back[1] + y, 0xc4c4c4);
    plot(t, wall.back[0] + x + 1, wall.back[1] + y + 1, 0x5c5c5c);
  }
  // inside of the walls: shadowed, darker towards the floor
  noiseFace(t, wall.front, r, METAL, { w: MW });
  paintFace(t, wall.front, (x, y, c, w, h) => {
    if (y === 0) return mixC(c, 0x9a9a9a, 0.5);
    const k = 0.92 - (y / (h - 1)) * 0.3;
    return mulC(x === 0 || x === w - 1 ? mulC(c, 0.85) : c, k);
  });
  // the rim: light outer edge, a shade darker on the inner edge
  paintFace(t, wall.top, (_x, y) => (y === 0 ? pick(r, [0xbebebe, 0xc6c6c6]) : pick(r, [0xa2a2a2, 0xa9a9a9])));
  noiseFace(t, wall.bottom, r, [0x474747, 0x4d4d4d]);
  for (const k of ['right', 'left'] as FaceName[]) paintFace(t, wall[k], (_x, y, _c, _w, h) => (y === 0 ? 0x9c9c9c : y === h - 1 ? 0x434343 : pick(r, [0x5a5a5a, 0x606060])));
  // the base: dark edges under the walls, the underside with two axle bars
  for (const k of ['top', 'bottom', 'right', 'left'] as FaceName[]) noiseFace(t, base[k], r, [0x3e3e3e, 0x444444, 0x4a4a4a], { w: [2, 3, 1] });
  noiseFace(t, base.front, r, [0x353535, 0x3a3a3a, 0x3f3f3f], { w: [2, 3, 2] });
  paintFace(t, base.front, (x, y, c, w, h) => {
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return 0x2e2e2e;
    if (y === 3 || y === h - 4) return pick(r, [0x575757, 0x5e5e5e]);
    if (y === 4 || y === h - 3) return 0x2a2a2a;
    return c;
  });
  // the floor and the inner plate: dark iron sheet with seams every 4 pixels
  for (const f of [base.back, plate.front]) {
    noiseFace(t, f, r, FLOOR, { w: FW });
    paintFace(t, f, (x, _y, c) => (x % 4 === 3 ? mulC(c, 0.82) : undefined));
  }
  for (const k of ['top', 'right', 'left'] as FaceName[]) noiseFace(t, plate[k], r, [0x3c3c3c, 0x414141]);
  return t;
}

// ---------------------------------------------------------------------------
// Arrow entity (32x32)

function arrow(): TexImage {
  const t = img(32, 32);
  const r = new Rand(0xa770);
  const inks: Record<string, Ink> = {
    W: 0xf4f4f4, F: 0xd2d2d2, g: 0xa8a8a8, s: 0x7a5230, S: 0x6a4628, n: 0x4a3018,
    h: 0xb8b8b8, T: 0x8c8c8c, d: 0x5c5c5c, t: 0xd4d4d4,
  };
  // side view: fletching at the left, flint head pointing right (tip at x=15)
  draw(t, 0, 0, [
    'WWF.............',
    '.WWF........hh..',
    'nsssSssssSssTTTt',
    '.FFg........dd..',
    'FFg.............',
  ], inks, r);
  // view from behind: cross of fletching around the shaft end
  draw(t, 0, 5, ['..W..', '..W..', 'WFnFg', '..F..', '..g..'], inks, r);
  return t;
}

// ---------------------------------------------------------------------------
// Experience orb (64x64: 4x4 grid of 16x16 cells, cells 0..10 used)

function experienceOrb(): TexImage {
  const t = img(64, 64);
  const OUT = 0x3a6a00, SHADOW = 0x6ca800, MID = 0xc8f050, LIGHT = 0xe6fa84, CORE = 0xffffa0;
  const DIAM = [3, 4, 5, 6, 7, 8, 9, 10, 11, 11.6, 12.4];
  for (let i = 0; i < DIAM.length; i++) {
    const ox = (i % 4) * 16, oy = Math.floor(i / 4) * 16;
    const D = DIAM[i], R = D / 2;
    const c = Number.isInteger(D) && D % 2 === 1 ? 7.5 : 8;
    const inside = (x: number, y: number) => {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      return dx * dx + dy * dy <= R * R + 0.01;
    };
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if (!inside(x, y)) continue;
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        let col: number;
        if (edge) col = OUT;
        else {
          const u = (x + 0.5 - c) / R, v = (y + 0.5 - c) / R;
          const l = 0.55 * (1 - Math.hypot(u, v)) + 0.3 * (-u - v) + 0.35;
          col = l > 0.72 ? CORE : l > 0.55 ? LIGHT : l > 0.3 ? MID : SHADOW;
        }
        plot(t, ox + x, oy + y, col);
      }
  }
  return t;
}

// ---------------------------------------------------------------------------
// Particles

// Smoke/poof puffs, largest first (x = body, o = rim).
const GENERIC = [
  ['..ooo..', '.oxxxo.', 'oxxxxxo', 'oxxxxxo', 'oxxxxxo', '.oxxxo.', '..ooo..'],
  ['.oooo.', 'oxxxxo', 'oxxxxo', 'oxxxxo', 'oxxxxo', '.oooo.'],
  ['.ooo.', 'oxxxo', 'oxxxo', 'oxxxo', '.ooo.'],
  ['.oo.', 'oxxo', 'oxxo', '.oo.'],
  ['oxo', 'xxx', 'oxo'],
  ['.o.', 'oxo', '.o.'],
  ['xo', 'oo'],
  ['x'],
];

function genericParticle(i: number): TexImage {
  const t = img(8, 8);
  const r = new Rand(0x9e0 + i);
  const rows = GENERIC[i], n = rows.length, off = (8 - n) >> 1;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      const lower = x + y >= n - 1;
      plot(t, off + x, off + y, ch === 'o' ? (lower ? 0xc4c4c4 : 0xdadada) : r.chance(0.25) ? 0xeeeeee : 0xffffff);
    }
  return t;
}

/** Explosion puff: union of shaded lumps that drift apart and break up over 16 frames. */
function explosionFrames(): TexImage[] {
  const r = new Rand(0xe8b1);
  const lumps: { x: number; y: number; rad: number; vx: number; vy: number; k: number }[] = [];
  // a big central lump ringed by smaller ones -> round cauliflower silhouette
  lumps.push({ x: 8, y: 8.3, rad: 3.7, vx: 0, vy: -0.2, k: 1 });
  for (let n = 0; n < 9; n++) {
    const a = ((n + r.next() * 0.6) * Math.PI * 2) / 9, d = 3.6 + r.next() * 1.2;
    lumps.push({ x: 8 + Math.cos(a) * d, y: 8 + Math.sin(a) * d, rad: 2.7 + r.next() * 1.1, vx: Math.cos(a) * (0.5 + r.next() * 0.7), vy: Math.sin(a) * (0.5 + r.next() * 0.7) - 0.2, k: 0.6 + r.next() * 0.6 });
  }
  // blobby erosion order: holes open up in clumps rather than salt-and-pepper
  const erode = equalize(mottle(r, 16, 16, 2.3, 0.25));
  const PAL = [0x6e6e6e, 0x8a8a8a, 0xa4a4a4, 0xbebebe, 0xd4d4d4, 0xe8e8e8, 0xf8f8f8, 0xffffff];
  const out: TexImage[] = [];
  for (let f = 0; f < 16; f++) {
    const t = img(16, 16);
    const p = f / 15;
    const shade = new Int8Array(256).fill(-1);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        let best = 0, lit = 0;
        for (const L of lumps) {
          const cx = L.x + L.vx * p * 2.6, cy = L.y + L.vy * p * 2.6;
          const rad = L.rad * (1 - 0.35 * p * L.k);
          const nx = (x + 0.5 - cx) / rad, ny = (y + 0.5 - cy) / rad;
          const q = 1 - nx * nx - ny * ny;
          if (q <= 0) continue;
          const nz = Math.sqrt(q);
          if (nz * rad > best) {
            best = nz * rad;
            lit = -0.55 * nx - 0.65 * ny + 0.55 * nz;
          }
        }
        if (best <= 0 || erode[y * 16 + x] < Math.pow(p, 1.3) * 0.9) continue;
        shade[y * 16 + x] = Math.max(0, Math.min(PAL.length - 1, Math.round((lit * 0.75 + 0.42 - p * 0.3) * (PAL.length - 1))));
      }
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        let s = shade[y * 16 + x];
        if (s < 0) continue;
        const empty = (xx: number, yy: number) => xx < 0 || yy < 0 || xx > 15 || yy > 15 || shade[yy * 16 + xx] < 0;
        if (empty(x + 1, y) || empty(x, y + 1)) s = Math.max(0, s - 2);
        else if (empty(x - 1, y) || empty(x, y - 1)) s = Math.max(0, s - 1);
        plot(t, x, y, PAL[s]);
      }
    out.push(t);
  }
  return out;
}

function starParticle(rows: string[]): TexImage {
  const t = img(8, 8);
  draw(t, 0, 0, rows, { W: 0xffffff, w: 0xd8d8d8, g: 0xa8a8a8 }, new Rand(1));
  return t;
}

const HEART = [
  '.OO.OO..',
  'OrrOrrO.',
  'OrhrrrO.',
  'OrrrrdO.',
  '.OrrdO..',
  '..OdO...',
  '...O....',
  '........',
];

function heartParticle(o: number, r0: number, h: number, d: number): TexImage {
  const t = img(8, 8);
  draw(t, 0, 0, HEART, { O: o, r: r0, h, d }, new Rand(1));
  return t;
}

function sweepFrame(i: number): TexImage {
  const t = img(16, 16);
  const p = i / 7;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const px = x + 0.5, py = y + 0.5;
      const ox = (px - 8) / 7.9, oy = (py - 1.5) / 12.2;
      if (ox * ox + oy * oy > 1 || py < 1.5) continue;
      const iy0 = 0.4 + p * 3.2;
      const ix = (px - 8) / (7.4 - p * 0.6), iy = (py - iy0) / 9.2;
      const din = ix * ix + iy * iy;
      if (din <= 1) continue;
      const tip = Math.abs(px - 8) / 8;
      if (tip > 0.97 - p * 0.35) continue;
      const band = Math.min(1, (din - 1) * 2.2);
      const g = 255 - p * 70 - band * 40;
      if (p > 0.5 && ((x * 7 + y * 3 + i) % 5 === 0)) continue;
      plot(t, x, y, ((g & 255) << 16) | ((g & 255) << 8) | (g & 255));
    }
  return t;
}

/** an 8x8 particle sprite from a pixel pattern */
function pixelSprite(rows: readonly string[], inks: Record<string, number>): TexImage {
  const t = img(8, 8);
  draw(t, 0, 0, rows, inks, new Rand(1));
  return t;
}

function flameParticle(): TexImage {
  const t = img(8, 8);
  draw(t, 0, 0, [
    '....r...',
    '...rr...',
    '...oyr..',
    '..ryyo..',
    '.royWyr.',
    '.oyWWyo.',
    '.ryWWyr.',
    '..roor..',
  ], { r: 0xd8501a, o: 0xf08a1e, y: 0xffc836, W: 0xfff4a8 }, new Rand(1));
  return t;
}

// ---------------------------------------------------------------------------
// Spawn eggs (16x16)

// o = outline, x = shell
const EGG = [
  '................',
  '................',
  '.......oo.......',
  '......oxxo......',
  '.....oxxxxo.....',
  '....oxxxxxxo....',
  '....oxxxxxxo....',
  '...oxxxxxxxxo...',
  '...oxxxxxxxxo...',
  '...oxxxxxxxxo...',
  '...oxxxxxxxxo...',
  '...oxxxxxxxxo...',
  '....oxxxxxxo....',
  '.....oxxxxo.....',
  '......oooo......',
  '................',
];

// s = spot, S = spot shadow (only drawn on the shell)
const EGG_SPOTS = [
  '................',
  '................',
  '................',
  '................',
  '.......ss.......',
  '........S.......',
  '.....ss.........',
  '....ssS...s.....',
  '.....S....ss....',
  '.......ss.SS....',
  '.......sS.......',
  '....ss..........',
  '.....S...ss.....',
  '.........S......',
  '................',
  '................',
];

function spawnEgg(base: number, spot: number): TexImage {
  const t = img(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const ch = EGG[y][x];
      if (ch === '.') continue;
      if (ch === 'o') {
        plot(t, x, y, mulC(base, 0.32));
        continue;
      }
      const u = (x + 0.5 - 8) / 5, v = (y + 0.5 - 8.8) / 6.5;
      const l = -0.5 * u - 0.55 * v + 0.6 * Math.sqrt(Math.max(0, 1 - u * u - v * v));
      const f = l > 0.62 ? 1.12 : l > 0.35 ? 1 : l > 0.1 ? 0.86 : 0.72;
      plot(t, x, y, f > 1 ? mixC(base, 0xffffff, 0.22) : mulC(base, f));
      const s = EGG_SPOTS[y][x];
      if (s === 's') plot(t, x, y, spot);
      else if (s === 'S') plot(t, x, y, mulC(spot, 0.78));
    }
  return t;
}

// ---------------------------------------------------------------------------
// Fire (16x16, 32 frames)

interface FireOpts {
  rate: number; // flame blobs emitted per frame
  v: [number, number]; // rise speed range (px/frame)
  rx: [number, number]; // initial half-width range
  life: [number, number]; // lifetime range (frames, < 32)
  stretch: number; // height/width of a blob
}

/**
 * Flame blobs are emitted just below the bottom edge, rise, sway, shrink and
 * cool; their heat is summed (dense bottom -> bright core, lone blobs -> tongue
 * tips) and mapped through the fire palette. Emission times wrap modulo 32 and
 * lifetimes are shorter than the loop, so frame 31 flows seamlessly into frame
 * 0. Horizontal distances wrap so the texture tiles side by side.
 */
const FIRE_PAL = [0xa8300c, 0xd45416, 0xec801e, 0xf7ab30, 0xfbd04a, 0xfff0a0];
/** soul fire: the same flames in cold turquoise */
const SOUL_FIRE_PAL = [0x0a5a66, 0x0b8792, 0x17b1ba, 0x3fd3d9, 0x86eaee, 0xd9fdfe];

function fire(seed: number, o: FireOpts, PAL = FIRE_PAL): AnimTex {
  const W = 16, H = 16, N = 32;
  const r = new Rand(seed);
  const streak = valueNoise(r, W, 64, 2, 4); // internal streaks drifting up 2 px/frame
  const blobs: { e: number; x: number; v: number; rx: number; life: number; ph: number; sw: number; heat: number }[] = [];
  for (let i = 0, n = Math.round(N * o.rate); i < n; i++)
    blobs.push({
      e: r.next() * N, x: r.next() * W, v: o.v[0] + r.next() * (o.v[1] - o.v[0]), rx: o.rx[0] + r.next() * (o.rx[1] - o.rx[0]),
      life: o.life[0] + r.next() * (o.life[1] - o.life[0]), ph: r.next() * 6.28, sw: 0.2 + r.next() * 0.6, heat: 0.75 + r.next() * 0.5,
    });
  const CUT = [0.32, 0.45, 0.64, 0.92, 1.35, 1.95];
  const frames: Uint8ClampedArray[] = [];
  const field = new Float32Array(W * H);
  for (let f = 0; f < N; f++) {
    field.fill(0);
    for (const b of blobs) {
      const age = (f - b.e + N) % N;
      if (age > b.life) continue;
      const k = age / b.life;
      const cy = 17.5 - b.v * age, cx = b.x + Math.sin(b.ph + age * 0.35) * b.sw;
      const rx = b.rx * (1 - 0.85 * k), ry = rx * o.stretch, h = b.heat * (1 - 0.6 * k);
      for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y++)
        for (let x = 0; x < W; x++) {
          let dx = Math.abs(x + 0.5 - cx) % W;
          if (dx > W / 2) dx = W - dx;
          const dy = y + 0.5 - cy;
          const d = (dx / rx) * (dx / rx) + (dy / ry) * (dy / ry);
          if (d < 1) field[y * W + x] += h * (1 - d);
        }
    }
    const t = img(W, H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let v = field[y * W + x] + Math.max(0, (y - 11) / 4) * 0.5;
        v *= 0.78 + 0.44 * streak[((y + 2 * f) % 64) * W + x];
        if (y >= 13 && v < 0.66) v = 0.66; // solid base row band, flames start at the bottom edge
        let c = -1;
        for (let i = 0; i < CUT.length; i++) if (v >= CUT[i]) c = i;
        if (c >= 0) plot(t, x, y, PAL[c]);
      }
    frames.push(t.data);
  }
  return { w: W, h: H, frames, frameTime: 1 };
}

// ---------------------------------------------------------------------------
// Registries

export const MOB_TEXTURES: Record<string, () => TexImage> = {
  pig,
  cow,
  sheep,
  sheep_fur: sheepFur,
  chicken,
  zombie,
  skeleton,
  creeper,
  spider: () => spider(),
  cave_spider: () => spider(CAVE_SPIDER_LOOK),
  spider_eyes: spiderEyes,
  enderman,
  enderman_eyes: endermanEyes,
  squid,
  slime,
  magma_cube: magmaCube,
  bat,
  minecart,
  arrow,
  experience_orb: experienceOrb,
  ...BOAT_TEXTURES,
};

// the 16 explosion frames are generated together; hand out copies of the cached set
let explosionCache: TexImage[] | null = null;
const explosion = (i: number) => () => cloneImg((explosionCache ??= explosionFrames())[i]);

export const MOB_PARTICLE_TEXTURES: Record<string, () => TexImage> = {};
for (let i = 0; i < 8; i++) MOB_PARTICLE_TEXTURES['generic_' + i] = () => genericParticle(i);
for (let i = 0; i < 16; i++) MOB_PARTICLE_TEXTURES['explosion_' + i] = explosion(i);
MOB_PARTICLE_TEXTURES['critical_hit'] = () =>
  starParticle(['...g....', '...W....', '..gWg...', 'gWWWWWg.', '..gWg...', '...W....', '...g....', '........']);
MOB_PARTICLE_TEXTURES['enchanted_hit'] = () =>
  starParticle(['...g....', '.w.W.w..', '..WWW...', 'gWWWWWg.', '..WWW...', '.w.W.w..', '...g....', '........']);
MOB_PARTICLE_TEXTURES['damage'] = () => heartParticle(0x000000, 0x5a0000, 0x8c0a0a, 0x420000);
MOB_PARTICLE_TEXTURES['heart'] = () => heartParticle(0x3c0404, 0xe41c1c, 0xffffff, 0xae0f0f);
for (let i = 0; i < 8; i++) MOB_PARTICLE_TEXTURES['sweep_' + i] = () => sweepFrame(i);
MOB_PARTICLE_TEXTURES['flame'] = flameParticle;
MOB_PARTICLE_TEXTURES['lava'] = () => pixelSprite([
  '........',
  '..rrrr..',
  '.royyor.',
  '.ryWWyr.',
  '.ryWyyr.',
  '.royyor.',
  '..rrrr..',
  '........',
], { r: 0xc0390c, o: 0xe56f19, y: 0xffb32c, W: 0xfff08c });
// drips are drawn white and tinted per fluid (vanilla DripParticle colours)
MOB_PARTICLE_TEXTURES['drip_hang'] = () => pixelSprite([
  '........',
  '........',
  '........',
  '...ww...',
  '...ww...',
  '...ss...',
  '........',
  '........',
], { w: 0xffffff, s: 0xd8d8d8 });
MOB_PARTICLE_TEXTURES['drip_fall'] = () => pixelSprite([
  '........',
  '........',
  '........',
  '...ww...',
  '...ss...',
  '........',
  '........',
  '........',
], { w: 0xffffff, s: 0xd8d8d8 });
MOB_PARTICLE_TEXTURES['drip_land'] = () => pixelSprite([
  '........',
  '........',
  '........',
  '........',
  '..swws..',
  '........',
  '........',
  '........',
], { w: 0xffffff, s: 0xd8d8d8 });
// splash / rain droplets (vanilla splash_0..3)
const SPLASH_INK = { w: 0xe3edff, b: 0x86a6ec, d: 0x4b6cc9 };
MOB_PARTICLE_TEXTURES['splash_0'] = () => pixelSprite(['........', '........', '...w....', '..wbd...', '...d....', '........', '........', '........'], SPLASH_INK);
MOB_PARTICLE_TEXTURES['splash_1'] = () => pixelSprite(['........', '........', '........', '...wb...', '...bd...', '........', '........', '........'], SPLASH_INK);
MOB_PARTICLE_TEXTURES['splash_2'] = () => pixelSprite(['........', '........', '........', '....w...', '....d...', '........', '........', '........'], SPLASH_INK);
MOB_PARTICLE_TEXTURES['splash_3'] = () => pixelSprite(['........', '........', '........', '...b....', '........', '........', '........', '........'], SPLASH_INK);
MOB_PARTICLE_TEXTURES['bubble'] = () => pixelSprite([
  '........',
  '..bbb...',
  '.bWw.b..',
  '.bw..b..',
  '.b...b..',
  '..bbb...',
  '........',
  '........',
], { b: 0xa9c6f2, W: 0xffffff, w: 0xdce8ff });
// status effect swirls (vanilla effect_0..7): white, tinted with the effect colour; effect_7 is the
// first frame, a wide swirl that tightens down to a dot
const EFFECT_SWIRL = [
  ['........', '........', '........', '...W....', '........', '........', '........', '........'],
  ['........', '........', '........', '...WW...', '...WW...', '........', '........', '........'],
  ['........', '........', '...ww...', '..wWWw..', '..wWWw..', '...ww...', '........', '........'],
  ['........', '........', '...WW...', '..WwwW..', '..WwwW..', '...WW...', '........', '........'],
  ['........', '........', '...WW...', '..W..W..', '..W..w..', '...Ww...', '........', '........'],
  ['........', '........', '..wWWw..', '..W..W..', '..W.WW..', '..wW....', '........', '........'],
  ['........', '...WW...', '.w....w.', '.W.ww.W.', '.W.W..W.', '.w..WW..', '...W....', '........'],
  ['...WW...', '.w....w.', '.W.ww.W.', 'W.W..W.W', 'W.W.W..W', '.W..W.w.', '.w..W...', '...W....'],
];
EFFECT_SWIRL.forEach((rows, i) => (MOB_PARTICLE_TEXTURES['effect_' + i] = () => pixelSprite(rows, { W: 0xffffff, w: 0xbdbdbd })));
// happy villager / bone meal sparkle (vanilla glint)
MOB_PARTICLE_TEXTURES['glint'] = () => pixelSprite([
  '........',
  '...g....',
  '...G....',
  '.gGWGg..',
  '...G....',
  '...g....',
  '........',
  '........',
], { g: 0x2f8f2f, G: 0x5ad65a, W: 0xc8ffc8 });

const EGGS: [string, number, number][] = [
  ['bat', 0x4c3e30, 0x0f0f0f],
  ['cave_spider', 0x0c424e, 0xa80e0e],
  ['pig', 0xf0a5a2, 0xdb635f],
  ['cow', 0x443626, 0xa1a1a1],
  ['sheep', 0xe7e7e7, 0xffb5b5],
  ['chicken', 0xa1a1a1, 0xff0000],
  ['zombie', 0x00afaf, 0x799c65],
  ['skeleton', 0xc1c1c1, 0x494949],
  ['creeper', 0x0da70b, 0x000000],
  ['spider', 0x342d27, 0xa80e0e],
  ['enderman', 0x161616, 0x000000],
  ['squid', 0x223b4d, 0x708899],
  ['slime', 0x51a03e, 0x7ebf6e],
  ['magma_cube', 0x340000, 0xfcfc00],
];

export const SPAWN_EGG_TEXTURES: Record<string, () => TexImage> = {};
for (const [name, base, spot] of EGGS) SPAWN_EGG_TEXTURES[name + '_spawn_egg'] = () => spawnEgg(base, spot);

export const FIRE_TEXTURES: Record<string, () => AnimTex> = {
  fire_0: () => fire(0xf14e2, { rate: 2.6, v: [0.7, 1.2], rx: [1.8, 3.6], life: [12, 22], stretch: 2.3 }),
  fire_1: () => fire(0xf14e4, { rate: 2.4, v: [0.8, 1.3], rx: [2.0, 3.4], life: [11, 20], stretch: 2.6 }),
  soul_fire_0: () => fire(0x50f14e2, { rate: 2.6, v: [0.7, 1.2], rx: [1.8, 3.6], life: [12, 22], stretch: 2.3 }, SOUL_FIRE_PAL),
  soul_fire_1: () => fire(0x50f14e4, { rate: 2.4, v: [0.8, 1.3], rx: [2.0, 3.4], life: [11, 20], stretch: 2.6 }, SOUL_FIRE_PAL),
};

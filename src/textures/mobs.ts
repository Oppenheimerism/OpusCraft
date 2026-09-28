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

export type Face = [number, number, number, number]; // x, y, w, h
export type FaceName = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back';
export type Box = Record<FaceName, Face>;
export type Pal = readonly number[];

export const FACES: FaceName[] = ['top', 'bottom', 'right', 'front', 'left', 'back'];
export const SIDES: FaceName[] = ['right', 'front', 'left', 'back'];

export function boxFaces(u: number, v: number, w: number, h: number, d: number): Box {
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
export function pick(r: Rand, pal: Pal, w?: Pal): number {
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
export function noiseFace(t: TexImage, f: Face, r: Rand, pal: Pal, o: NoiseOpts = {}): void {
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

export function noiseBox(t: TexImage, b: Box, r: Rand, pal: Pal, o: NoiseOpts = {}, faces: FaceName[] = FACES): void {
  for (const k of faces) noiseFace(t, b[k], r, pal, o);
}

/** Per-pixel edit of a face: return a color, null (clear) or undefined (keep). */
export function paintFace(t: TexImage, f: Face, fn: (x: number, y: number, c: number, w: number, h: number) => number | null | undefined): void {
  const [x0, y0, w, h] = f;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = fn(x, y, getPx(t, x0 + x, y0 + y), w, h);
      if (c === null) clear(t, x0 + x, y0 + y);
      else if (c !== undefined) plot(t, x0 + x, y0 + y, c);
    }
}

export type Ink = number | null | Pal | (() => number);

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

export function drawFace(t: TexImage, f: Face, rows: readonly string[], inks: Record<string, Ink>, r: Rand): void {
  draw(t, f[0], f[1], rows, inks, r);
}

/** Sprinkle random pixels of `pal` over a face with probability p. */
export function fleck(t: TexImage, f: Face, r: Rand, p: number, pal: Pal, w?: Pal): void {
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

/**
 * vanilla pig_saddle (64x32, the pig's layout, drawn on a model half a pixel bigger): a leather seat on the spine
 * with flaps down the flanks and a girth strap under the belly, buckled on each side
 */
function pigSaddle(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x5add2e);
  const LEATHER = [0x4f311c, 0x5c3a21, 0x6b4427, 0x7a4e2d, 0x885833];
  const RIM = [0x3e2616, 0x472c19];
  const STRAP = [0x2e1d11, 0x3a2516];
  const leather = () => pick(r, LEATHER, [1, 2, 4, 3, 1]);
  const body = boxFaces(28, 8, 10, 16, 8);
  // the seat along the spine (rows run head to tail): pommel in front, cantle behind, a dark rim round it
  paintFace(t, body.back, (x, y) => {
    if (y < 4 || y > 11) return undefined;
    if (x === 0 || x === 9 || y === 11) return pick(r, RIM);
    if (y === 4 || y === 10) return pick(r, [0x92603a, 0x9e6a40]);
    return leather();
  });
  // flaps from the spine edge down each flank, the girth across to the belly edge, a buckle midway
  const flank = (x: number, y: number, fromSpine: number): number | undefined => {
    if (y >= 5 && y <= 10 && fromSpine <= 3) return fromSpine === 3 || y === 5 || y === 10 ? pick(r, RIM) : leather();
    if (y >= 7 && y <= 8 && fromSpine > 3) return fromSpine === 5 ? pick(r, [0x8e8e8e, 0xa8a8a8, 0x6e6e6e]) : pick(r, STRAP);
    void x;
    return undefined;
  };
  paintFace(t, body.right, (x, y) => flank(x, y, x));
  paintFace(t, body.left, (x, y) => flank(x, y, 7 - x));
  paintFace(t, body.front, (_x, y) => (y >= 7 && y <= 8 ? pick(r, STRAP) : undefined));
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
// Skeleton and wither skeleton (64x32, one layout): the same bony build, in bone white or in the wither
// skeleton's sooty near-black

interface SkeletonLook {
  seed: number;
  /** the bone's shades, dark to light, and each one's share */
  bone: Pal;
  w: Pal;
  /** darker flecks on the skull */
  fleck: Pal;
  /** the face: eye sockets (K, k round their rims), nose (n), mouth (D) and teeth (t) */
  face: Record<'K' | 'k' | 'n' | 'D' | 't', number>;
}

const SKELETON_LOOK: SkeletonLook = {
  seed: 0x5ce1e7,
  bone: [0x9a9a9a, 0xa8a8a8, 0xb4b4b4, 0xbdbdbd, 0xc6c6c6, 0xcfcfcf],
  w: [1, 2, 4, 8, 5, 2],
  fleck: [0x858585, 0x8f8f8f],
  face: { K: 0x0d0d0d, k: 0x1f1f1f, n: 0x3a3a3a, D: 0x262626, t: 0x9a9a9a },
};

const WITHER_SKELETON_LOOK: SkeletonLook = {
  seed: 0x3a1e7,
  bone: [0x1a1a1a, 0x222222, 0x2a2a2a, 0x313131, 0x393939, 0x474747],
  w: [1, 2, 4, 8, 5, 2],
  fleck: [0x141414, 0x181818],
  face: { K: 0x000000, k: 0x080808, n: 0x0c0c0c, D: 0x0a0a0a, t: 0x3e3e3e },
};

function skeleton(look: SkeletonLook = SKELETON_LOOK): TexImage {
  const t = img(64, 32);
  const r = new Rand(look.seed);
  const BN = look.bone;
  const BNW = look.w;
  const head = boxFaces(0, 0, 8, 8, 8);
  const body = boxFaces(16, 16, 8, 12, 4);
  const arm = boxFaces(40, 16, 2, 12, 2);
  const leg = boxFaces(0, 16, 2, 12, 2);
  noiseBox(t, head, r, BN, { w: BNW });
  for (const k of ['top', 'right', 'left', 'back'] as FaceName[]) fleck(t, head[k], r, 0.05, look.fleck);
  drawFace(t, head.front, [
    '........',
    '........',
    '........',
    '.KK..KK.',
    '.kK..Kk.',
    '...nn...',
    '.DtDDtD.',
    '........',
  ], look.face, r);
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

/**
 * the charged creeper's power layer (vanilla creeper_armor.png): wavy diagonal streaks of pale blue on nothing, tiling
 * both ways so the scrolling swirl never shows a seam
 */
function creeperArmor(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0xa2c0);
  const TAU = Math.PI * 2;
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 64; x++) {
      const w = 0.16 * Math.sin(TAU * (x / 32 - y / 16)) + 0.06 * Math.sin(TAU * (x / 16 + y / 32));
      const b = (((x / 16 + y / 8 + w) % 1) + 1) % 1;
      const b2 = (((x / 16 - y / 8 - w * 0.5) % 1) + 1) % 1;
      let i = b < 0.34 ? 1 - Math.abs(b - 0.17) / 0.17 : 0;
      i = Math.max(i, b2 < 0.12 ? 0.55 * (1 - Math.abs(b2 - 0.06) / 0.06) : 0);
      i *= 0.8 + r.next() * 0.35;
      if (i < 0.18) continue;
      const k = Math.min(1, i);
      plot(t, x, y, mixC(0x3f63d8, 0xbfe4ff, k * k));
    }
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
// Ghast (64x32, vanilla GhastModel): the 16-cube body, and in the top-left corner the strip all nine tentacles
// share. Pale, faintly blotched; its face weeps grey tears with its eyes shut, and opens them red (and its mouth)
// while it charges a shot (vanilla ghast_shooting).

function ghast(shooting: boolean): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x9a57);
  const SKIN = [0xc9c9c9, 0xd6d6d6, 0xe1e1e1, 0xeaeaea, 0xf2f2f2, 0xf9f9f9];
  const body = boxFaces(0, 0, 16, 16, 16);
  noiseBox(t, body, r, SKIN, { w: [1, 2, 3, 5, 5, 2] });
  // the tentacles' strip, a shade greyer towards the tips
  const tent = boxFaces(0, 0, 2, 14, 2);
  noiseBox(t, tent, r, SKIN.slice(0, 5), { w: [1, 2, 4, 4, 2], cell: 1 });
  for (const k of SIDES) paintFace(t, tent[k], (_x, y, c) => (y > 9 ? mixC(c, 0xa8a8a8, (y - 9) / 8) : undefined));
  const G = 0x7c7c7c, g = 0xa2a2a2, K = 0x3a3a3a;
  drawFace(t, body.front, shooting
    ? [
      '................',
      '................',
      '................',
      '................',
      '..KKKK....KKKK..',
      '..KRRK....KRRK..',
      '..KrrK....KrrK..',
      '...rr......rr...',
      '...r........r...',
      '...r........r...',
      '.....KKKKKK.....',
      '.....KmmmmK.....',
      '.....KmMMmK.....',
      '.....KKKKKK.....',
      '................',
      '................',
    ]
    : [
      '................',
      '................',
      '................',
      '................',
      '................',
      '..GGGG....GGGG..',
      '...gg......gg...',
      '...g........g...',
      '...g........g...',
      '...g........g...',
      '................',
      '......GGGG......',
      '.....g....g.....',
      '................',
      '................',
      '................',
    ], { G, g, K, R: 0xc81010, r: 0x9a1212, m: 0x5a1a1a, M: 0x2a0a0a }, r);
  return t;
}

// ---------------------------------------------------------------------------
// Zombified piglin (64x64, vanilla PiglinModel): a piglin gone to rot. Pink, blotchy, greying skin; the skull
// showing through on one side of the face, an empty socket; ribs through a hole in the chest; one forearm
// picked down to the bone; a leather loincloth; dark hooves.

function zombifiedPiglin(): TexImage {
  const t = img(64, 64);
  const r = new Rand(0x2b1c);
  const SK = [0xa9645a, 0xba7266, 0xc98174, 0xd69183, 0xe0a091, 0xe9ae9f];
  const SKW = [1, 2, 4, 5, 3, 1];
  const ROT = [0x7c7a52, 0x8b8a5e, 0x9a996b];
  const BONE = [0xc9c2aa, 0xd8d2bb, 0xe6e0ca];
  const GORE = [0x4e1a1a, 0x632423, 0x762e2a];
  const HIDE = [0x4f3520, 0x5e4128, 0x6d4d30, 0x7b5838];
  const HOOF = [0x2e211d, 0x3a2b25, 0x46342c];
  const rot = (o: NoiseOpts['mask']) => (f: Face) => noiseFace(t, f, r, ROT, { mask: o, cell: 1 });
  const blotch = rot((x, y) => r.chance(0.07) || ((x * 7 + y * 13) % 17 === 0 && r.chance(0.6)));
  const skinBox = (b: Box) => {
    noiseBox(t, b, r, SK, { w: SKW });
    for (const k of FACES) blotch(b[k]);
  };
  const head = boxFaces(0, 0, 10, 8, 8);
  const snout = boxFaces(31, 1, 4, 4, 1);
  const tuskA = boxFaces(2, 4, 1, 2, 1), tuskB = boxFaces(2, 0, 1, 2, 1);
  const earL = boxFaces(51, 6, 1, 5, 4), earR = boxFaces(39, 6, 1, 5, 4);
  const body = boxFaces(16, 16, 8, 12, 4);
  const armR = boxFaces(40, 16, 4, 12, 4), armL = boxFaces(32, 48, 4, 12, 4);
  const legR = boxFaces(0, 16, 4, 12, 4), legL = boxFaces(16, 48, 4, 12, 4);
  for (const b of [head, snout, earL, earR, body, armR, armL, legR, legL]) skinBox(b);

  // the face: the skull bared round the right eye (an empty socket), the left eye beady and pale
  drawFace(t, head.front, [
    '..........',
    '.BB.......',
    'BbbB......',
    'BKKb..wE..',
    'BKKB......',
    '.bB.......',
    '..........',
    '..........',
  ], { B: BONE, b: BONE[0], K: 0x140c0a, w: 0xe6dcc4, E: 0x1e1410 }, r);
  // the bone carries on round the side of the head
  drawFace(t, head.right, ['........', '......BB', '.....BbB', '......BB', '.......B', '........', '........', '........'], { B: BONE, b: BONE[0] }, r);
  // the snout: paler, with two dark nostrils
  noiseBox(t, snout, r, [0xd9998a, 0xe4a898, 0xecb6a6], { cell: 1 });
  drawFace(t, snout.front, ['....', 'K..K', 'K..K', '....'], { K: 0x4a2622 }, r);
  // tusks
  for (const tb of [tuskA, tuskB]) noiseBox(t, tb, r, [0xd8cfa8, 0xe8e0bc]);
  // ears: flesh, one of them torn ragged at the tip
  for (const k of FACES) paintFace(t, earL[k], (x, y, _c, w, h) => (k !== 'top' && y >= h - 2 && (x + y) % 2 === 0 ? null : undefined));
  // body: ribs through a hole in the chest, then the loincloth's belt
  const hide = () => pick(r, HIDE, [1, 3, 3, 1]);
  drawFace(t, body.front, [
    '........',
    '..gggg..',
    '.gbBBbg.',
    '.gggBgg.',
    '.gbBBbg.',
    '.gggBgg.',
    '.gbBBbg.',
    '..ggBg..',
    '........',
    'HHHHHHHH',
    'HhHHHHhH',
    'HHHHHHHH',
  ], { g: GORE, b: BONE[0], B: BONE, H: hide, h: 0x3c2816 }, r);
  for (const k of ['back', 'right', 'left'] as FaceName[]) {
    const [, , w] = body[k];
    drawFace(t, body[k], Array.from({ length: 12 }, (_, y) => (y >= 9 ? 'H'.repeat(w) : '.'.repeat(w))), { H: hide }, r);
  }
  // the left forearm is bare bone below the elbow (dark gaps between the two bones)
  for (const k of SIDES) paintFace(t, armL[k], (x, y) => (y >= 6 ? (x === 1 || x === 2) && y < 11 ? pick(r, GORE) : pick(r, BONE) : undefined));
  paintFace(t, armL.bottom, () => pick(r, BONE));
  // legs: the loincloth's flaps over the thighs, hooves at the bottom
  for (const leg of [legR, legL]) {
    for (const k of SIDES) paintFace(t, leg[k], (x, y) => (y < 3 && (k === 'front' || k === 'back' || y < 2) ? hide() : y >= 10 ? pick(r, HOOF) : undefined));
    noiseFace(t, leg.bottom, r, HOOF);
  }
  return t;
}

// ---------------------------------------------------------------------------
// Piglin (64x64, vanilla PiglinModel): what the zombified piglin was. Rosy pink skin with darker bristly patches
// and a dark crown of coarse hair, small black eyes set close either side of a broad snout, two tusks jutting up
// from the jaw, floppy ears; a leather belt with a gold buckle and studs, the loincloth's flaps over the thighs;
// dark hooves. The zombified texture shares the layout.

function piglin(): TexImage {
  return piglinSkin(false);
}

// (bastions) Piglin brute (64x64, the piglin's model): the same face, scarred across the brow, but dressed for war
// in black: a tunic trimmed with gold at the collar and hem, a gold buckle and studded belt, black sleeves with a gold
// band round the right arm, black breeches over the hooves.
function piglinBrute(): TexImage {
  return piglinSkin(true);
}

function piglinSkin(brute: boolean): TexImage {
  const t = img(64, 64);
  const r = new Rand(0x9161a);
  const SK = [0xb66a5e, 0xc87a6c, 0xd88a7a, 0xe49a88, 0xeea996, 0xf5b8a4];
  const SKW = [1, 2, 4, 5, 3, 1];
  const BRISTLE = [0x8c4c43, 0x9c5a4e, 0xab665a];
  const HAIR = [0x3a2217, 0x4a2c1e, 0x5b3826];
  const HIDE = [0x4a2f1b, 0x5a3a22, 0x6b472b, 0x7a5434];
  const GOLD = [0xd8a922, 0xf0c935, 0xfbe165];
  const HOOF = [0x2b1f1b, 0x382922, 0x45322a];
  const skinBox = (b: Box) => {
    noiseBox(t, b, r, SK, { w: SKW });
    for (const k of FACES) fleck(t, b[k], r, 0.05, BRISTLE);
  };
  const head = boxFaces(0, 0, 10, 8, 8);
  const snout = boxFaces(31, 1, 4, 4, 1);
  const tuskA = boxFaces(2, 4, 1, 2, 1), tuskB = boxFaces(2, 0, 1, 2, 1);
  const earL = boxFaces(51, 6, 1, 5, 4), earR = boxFaces(39, 6, 1, 5, 4);
  const body = boxFaces(16, 16, 8, 12, 4);
  const armR = boxFaces(40, 16, 4, 12, 4), armL = boxFaces(32, 48, 4, 12, 4);
  const legR = boxFaces(0, 16, 4, 12, 4), legL = boxFaces(16, 48, 4, 12, 4);
  for (const b of [head, snout, earL, earR, body, armR, armL, legR, legL]) skinBox(b);

  // the crown: coarse dark hair over the top, spilling down the back and the sides of the head
  noiseFace(t, head.top, r, HAIR, { cell: 1 });
  paintFace(t, head.back, (x, y) => (y < 3 || (y < 5 && (x * 5 + y * 3) % 4 === 0) ? pick(r, HAIR) : undefined));
  for (const k of ['right', 'left'] as FaceName[]) paintFace(t, head[k], (x, y) => (y === 0 || (y === 1 && x % 3 !== 1) ? pick(r, HAIR) : undefined));
  // the face: a dark brow, small eyes (white outside, the black pupil in towards the snout), cheeks a touch darker
  drawFace(t, head.front, [
    'HhHHHHHHhH',
    '.bbb..bbb.',
    '..........',
    '.wK....Kw.',
    '..........',
    'c........c',
    'cc......cc',
    '..........',
  ], { H: HAIR, h: HAIR[2], b: BRISTLE, w: 0xf2ece4, K: 0x120a08, c: BRISTLE[2] }, r);
  // the snout: paler, with two dark nostrils
  noiseBox(t, snout, r, [0xe7a592, 0xefb3a0, 0xf6c2b0], { cell: 1 });
  drawFace(t, snout.front, ['....', 'K..K', 'K..K', '....'], { K: 0x5a2a24 }, r);
  // tusks
  for (const tb of [tuskA, tuskB]) noiseBox(t, tb, r, [0xe4dcc0, 0xf2ecd4]);
  // ears: a darker inside (the face towards the head)
  for (const f of [earL.right, earR.left]) paintFace(t, f, (x, y, _c, w, h) => (x > 0 && x < w - 1 && y > 0 && y < h - 1 ? pick(r, BRISTLE) : undefined));
  if (brute) {
    bruteOutfit(t, r, { head, body, armR, armL, legR, legL }, GOLD, HOOF, HIDE, BRISTLE);
    return t;
  }
  // body: the belt, its gold buckle at the front and gold studs round it
  const hide = () => pick(r, HIDE, [1, 3, 3, 1]);
  drawFace(t, body.front, [
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    'HHHHHHHH',
    'HgHGGHgH',
    'HHHGGHHH',
    'hHHHHHHh',
  ], { H: hide, h: HIDE[0], G: GOLD, g: GOLD[1] }, r);
  for (const k of ['back', 'right', 'left'] as FaceName[]) {
    const [, , w] = body[k];
    drawFace(t, body[k], Array.from({ length: 12 }, (_, y) => (y >= 8 ? Array.from({ length: w }, (_, x) => (y === 9 && x % 3 === 1 ? 'g' : 'H')).join('') : '.'.repeat(w))), { H: hide, g: GOLD[1] }, r);
  }
  // arms: the hands a shade darker
  for (const arm of [armR, armL]) {
    for (const k of SIDES) paintFace(t, arm[k], (_x, y) => (y >= 11 ? pick(r, BRISTLE) : undefined));
    noiseFace(t, arm.bottom, r, BRISTLE);
  }
  // legs: the loincloth's flaps over the thighs, hooves at the bottom
  for (const leg of [legR, legL]) {
    for (const k of SIDES) paintFace(t, leg[k], (x, y) => (y < 4 && (k === 'front' || k === 'back' || y < 2) ? (y === 3 && x % 2 === 0 ? HIDE[0] : hide()) : y >= 10 ? pick(r, HOOF) : undefined));
    noiseFace(t, leg.bottom, r, HOOF);
  }
  return t;
}

/** (bastions) the brute's black clothes over the piglin's skin (see piglinBrute) */
function bruteOutfit(
  t: TexImage, r: Rand, p: { head: ReturnType<typeof boxFaces>; body: ReturnType<typeof boxFaces>; armR: ReturnType<typeof boxFaces>; armL: ReturnType<typeof boxFaces>; legR: ReturnType<typeof boxFaces>; legL: ReturnType<typeof boxFaces> },
  GOLD: number[], HOOF: number[], HIDE: number[], BRISTLE: number[],
): void {
  const CLOTH = [0x15121a, 0x1c1822, 0x24202b, 0x2d2835];
  const cloth = () => pick(r, CLOTH, [1, 3, 3, 1]);
  // a scar across the brow
  paintFace(t, p.head.front, (x, y) => (y === 2 && x >= 5 && x <= 7 ? BRISTLE[0] : y === 1 && x === 7 ? BRISTLE[0] : undefined));
  // the tunic: black all round, gold at the collar and the hem, the belt with its buckle and studs
  for (const k of ['front', 'back', 'right', 'left'] as FaceName[]) {
    const [, , w] = p.body[k];
    paintFace(t, p.body[k], (x, y) => {
      if (y === 0) return x % 2 === 0 ? GOLD[1] : GOLD[0];
      if (y === 8) return k === 'front' && (x === 3 || x === 4) ? GOLD[2] : pick(r, HIDE, [2, 3, 2, 1]);
      if (y === 9) return k === 'front' && (x === 3 || x === 4) ? GOLD[1] : x % 3 === 1 ? GOLD[1] : pick(r, HIDE, [2, 3, 2, 1]);
      if (y === 11) return x % 2 ? GOLD[0] : cloth();
      return cloth();
    });
    void w;
  }
  noiseFace(t, p.body.top, r, CLOTH);
  // sleeves to the elbow; a gold band round the right arm
  for (const [arm, band] of [[p.armR, true], [p.armL, false]] as const) {
    for (const k of SIDES) paintFace(t, arm[k], (_x, y) => (y < 5 ? (band && y === 4 ? GOLD[1] : cloth()) : y >= 11 ? pick(r, BRISTLE) : undefined));
    noiseFace(t, arm.top, r, CLOTH);
    noiseFace(t, arm.bottom, r, BRISTLE);
  }
  // breeches to the shin, the hooves under them
  for (const leg of [p.legR, p.legL]) {
    for (const k of SIDES) paintFace(t, leg[k], (x, y) => (y < 9 ? (y === 8 && x % 2 === 0 ? CLOTH[0] : cloth()) : y >= 10 ? pick(r, HOOF) : undefined));
    noiseFace(t, leg.bottom, r, HOOF);
  }
}

// ---------------------------------------------------------------------------
// Hoglin and zoglin (128x64, vanilla HoglinModel). The body is not turned: its "top" is the spine (front edge at
// the bottom row), its sides run rump → shoulders on the right face and shoulders → rump on the left. The head
// hangs at 50°, so its "top" is the face (forehead at row 0, the nose at the bottom) and its "front" the snout's
// tip. The mane is a flat sheet: only its two 19x10 sides show, the top 7 rows above the spine.

interface HoglinLook {
  seed: number;
  hide: Pal;
  hideW: Pal;
  belly: Pal;
  mane: Pal;
  face: Pal;
  snout: Pal;
  nostril: number;
  eye: number;
  tusk: Pal;
  tuskBase: number;
  hoof: Pal;
  ear: Pal;
  /** rotted: bare flesh and bone showing through */
  rot?: { flesh: Pal; bone: Pal };
}

const HOGLIN_LOOK: HoglinLook = {
  seed: 0x406117,
  hide: [0x8f5443, 0xa3624d, 0xb36f57, 0xc07c62, 0xcb8a6d, 0xd69a7c],
  hideW: [1, 2, 4, 5, 3, 1],
  belly: [0xb77a64, 0xc4876f, 0xcf957c],
  mane: [0x4f2716, 0x62311c, 0x773d22, 0x8a4a2a, 0x9c5733],
  face: [0x86472d, 0x965335, 0xa55f3d, 0xb36b46],
  snout: [0xc68576, 0xd39584, 0xdea592],
  nostril: 0x3a1a12,
  eye: 0x160d0a,
  tusk: [0xd8c79c, 0xe4d6ae, 0xeee3c2],
  tuskBase: 0xb49d72,
  hoof: [0x34241e, 0x413028, 0x4e3a30],
  ear: [0xa9654f, 0xb87259, 0xc47f65],
};

const ZOGLIN_LOOK: HoglinLook = {
  seed: 0x2091a,
  hide: [0x9d8580, 0xae9691, 0xbea6a1, 0xcab3ad, 0xd6c0ba, 0xe2cec8],
  hideW: [1, 2, 4, 5, 3, 1],
  belly: [0xc9b3ad, 0xd4bfb9, 0xdecbc5],
  mane: [0x9a918d, 0xb1a8a3, 0xc6beb8, 0xd9d2cc, 0xe8e2dc],
  face: [0x94807b, 0xa38e89, 0xb19c96, 0xbea9a3],
  snout: [0xc49c98, 0xd1aba6, 0xdcb8b3],
  nostril: 0x3b1f22,
  eye: 0x1c1212,
  tusk: [0xe4ddcc, 0xefe9dc, 0xf8f5ec],
  tuskBase: 0xc8bfa9,
  hoof: [0x463f3d, 0x544b48, 0x625855],
  ear: [0xb09a95, 0xbea8a3, 0xcab5af],
  rot: { flesh: [0x7c2c34, 0x923b45, 0xa64d55, 0xb8636a], bone: [0xcfc6b2, 0xded6c4, 0xebe5d8] },
};

function hoglinSkin(k: HoglinLook): TexImage {
  const t = img(128, 64);
  const r = new Rand(k.seed);
  const body = boxFaces(1, 1, 16, 14, 26);
  const head = boxFaces(61, 1, 14, 6, 19);
  const mane = boxFaces(90, 33, 0, 10, 19);
  const earR = boxFaces(1, 1, 6, 1, 4), earL = boxFaces(1, 6, 6, 1, 4);
  const hornR = boxFaces(10, 13, 2, 11, 2), hornL = boxFaces(1, 13, 2, 11, 2);
  const legs = [boxFaces(66, 42, 6, 14, 6), boxFaces(41, 42, 6, 14, 6), boxFaces(21, 45, 5, 11, 5), boxFaces(0, 45, 5, 11, 5)];
  const bristle = { w: k.hideW, cell: 1, white: 0.6 };
  noiseBox(t, body, r, k.hide, bristle);
  noiseBox(t, head, r, k.hide, bristle);
  for (const l of legs) noiseBox(t, l, r, k.hide, bristle);
  noiseFace(t, body.bottom, r, k.belly, { cell: 1 });
  const maneInk = () => pick(r, k.mane, [1, 2, 3, 2, 1]);
  // bristles: dark hairs streaking down the flanks, thickest over the shoulders and along the spine
  for (const side of ['right', 'left'] as FaceName[]) {
    paintFace(t, body[side], (x, y, c, w) => {
      const front = side === 'right' ? x / (w - 1) : 1 - x / (w - 1);
      const reach = 2 + front * 6 + (r.chance(0.5) ? 1 : 0);
      if (y < reach) return maneInk();
      if ((x * 5 + y * 3) % 7 === 0 && r.chance(0.5)) return mixC(c, k.mane[1], 0.45);
      return undefined;
    });
  }
  paintFace(t, body.top, (x, y, c, w, h) => {
    const mid = Math.abs(x - (w - 1) / 2);
    const front = y / (h - 1);
    if (mid < 2 + front * 3 + (r.chance(0.4) ? 1 : 0)) return maneInk();
    return r.chance(0.12) ? mixC(c, k.mane[2], 0.5) : undefined;
  });
  paintFace(t, body.front, (x, y) => (y < 4 + (r.chance(0.5) ? 1 : 0) ? maneInk() : undefined));
  // the mane: a ragged crest of long bristles, tallest over the neck
  for (const side of ['right', 'left'] as FaceName[]) {
    paintFace(t, mane[side], (x, y, _c, w) => {
      const front = side === 'right' ? x / (w - 1) : 1 - x / (w - 1);
      const top = Math.round(3 - front * 3) + (x % 2 === 0 ? 1 : 0) + (r.chance(0.3) ? 1 : 0);
      return y < top ? null : maneInk();
    });
  }
  // the face: darker, with small deep-set eyes, and a paler nose at the end of the snout
  noiseBox(t, head, r, k.face, { cell: 1, white: 0.6 }, ['top', 'right', 'left']);
  paintFace(t, head.top, (x, y, c, w, h) => (y >= h - 4 ? pick(r, k.snout) : y < 2 && r.chance(0.6) ? maneInk() : undefined));
  drawFace(t, head.top, ['..............', '..............', '..............', '.bKb......bKb.', '..............'], { K: k.eye, b: mixC(k.face[0], k.eye, 0.4) }, r);
  noiseFace(t, head.front, r, k.snout, { cell: 1 });
  drawFace(t, head.front, ['..............', '....KK..KK....', '....KK..KK....', '..............'], { K: k.nostril }, r);
  // the mouth runs along each side of the snout
  for (const side of ['right', 'left'] as FaceName[]) {
    paintFace(t, head[side], (x, y, c, w, h) => {
      const front = side === 'right' ? x / (w - 1) : 1 - x / (w - 1);
      if (y === h - 2 && front > 0.35) return mixC(c, k.nostril, 0.55);
      return front > 0.8 && y >= h - 3 ? pick(r, k.snout) : undefined;
    });
  }
  noiseFace(t, head.bottom, r, k.belly, { cell: 1 });
  // tusks: ivory, darker where they leave the jaw
  for (const hb of [hornR, hornL]) {
    noiseBox(t, hb, r, k.tusk, { cell: 1 });
    for (const s of SIDES) paintFace(t, hb[s], (_x, y, c, _w, h) => (y >= h - 3 ? mixC(c, k.tuskBase, (y - (h - 4)) / 3) : undefined));
  }
  // ears: the hide outside, pinker within
  for (const eb of [earR, earL]) {
    noiseBox(t, eb, r, k.ear, { cell: 1 });
    noiseFace(t, eb.bottom, r, k.snout, { cell: 1 });
  }
  // hooves
  for (const l of legs) {
    for (const s of SIDES) paintFace(t, l[s], (_x, y, _c, _w, h) => (y >= h - 2 ? pick(r, k.hoof) : y === h - 3 && r.chance(0.5) ? pick(r, k.mane) : undefined));
    noiseFace(t, l.bottom, r, k.hoof);
  }
  if (k.rot) {
    // rotted through: raw patches with bone at their hearts, on the flanks, the face and the legs
    const rot = k.rot;
    const sore = (f: Face, cx: number, cy: number, rad: number) =>
      paintFace(t, f, (x, y) => {
        const d = Math.hypot(x - cx, (y - cy) * 1.2) + r.next() * 1.4;
        if (d >= rad) return undefined;
        if (d < rad * 0.45 && r.chance(0.55)) return pick(r, rot.bone);
        return pick(r, rot.flesh, d < rad * 0.6 ? [3, 3, 1, 0] : [0, 1, 3, 3]);
      });
    sore(body.right, 7, 8, 4.6);
    sore(body.right, 20, 4, 3);
    sore(body.left, 16, 8, 5);
    sore(body.left, 4, 3, 2.8);
    sore(body.top, 4, 8, 3.4);
    sore(body.top, 11, 18, 2.6);
    sore(body.back, 10, 6, 3.4);
    sore(body.bottom, 8, 14, 3.6);
    // half the face has rotted down to the skull
    sore(head.top, 10, 9, 4);
    sore(head.right, 11, 3, 3);
    sore(legs[0].front, 2, 6, 2.6);
    sore(legs[3].left, 2, 4, 2.4);
    for (const k2 of FACES) fleck(t, body[k2], r, 0.04, rot.flesh);
  }
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
// Blaze (64x32, vanilla BlazeModel): the 8-cube head, and at (0,16) the 2x8x2 strip all twelve rods share.
// Hot yellow metal mottled with orange and scorched orange-brown; black eyes in darker sockets and a dark mouth.
// The blaze is drawn full bright, so the colours carry no shading of their own.

function blaze(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0xb1a2e);
  const HOT = [0x7c3606, 0xa8500a, 0xd67a12, 0xf3a01c, 0xfcc72c, 0xffe046, 0xfff498];
  const head = boxFaces(0, 0, 8, 8, 8);
  noiseBox(t, head, r, HOT, { w: [1, 2, 3, 4, 5, 4, 1], cell: 3, white: 0.35 });
  // the face: brighter round its features so they stand out
  noiseFace(t, head.front, r, HOT, { w: [0, 1, 2, 4, 5, 4, 1], cell: 3, white: 0.35 });
  drawFace(t, head.front, [
    '........',
    '........',
    '........',
    '.SS..SS.',
    '.KK..KK.',
    '.ss..ss.',
    '.mMMMMm.',
    '........',
  ], { S: [0x5e2604, 0x6a2c06], K: 0x0c0603, s: 0xa8500a, M: 0x4e1e04, m: 0x8a3e08 }, r);
  // the rods: yellow-orange flecked with orange and brown, going darker at their ends
  const rod = boxFaces(0, 16, 2, 8, 2);
  noiseBox(t, rod, r, [0x8a420a, 0xc0620e, 0xe68a16, 0xf6b026, 0xffd23e, 0xffea7a], { w: [1, 2, 3, 5, 4, 1], cell: 1 });
  for (const k of SIDES) paintFace(t, rod[k], (_x, y, c) => (y === 0 || y === 7 ? mixC(c, 0xa04a06, 0.4) : undefined));
  for (const k of ['top', 'bottom'] as FaceName[]) noiseFace(t, rod[k], r, [0x7c3606, 0x9a4c0a, 0xb8620e]);
  return t;
}

// ---------------------------------------------------------------------------
// Strider (64x128, vanilla StriderModel): body (0,0) 16x14x16 with the face on its front, legs (0,32) and
// (0,55) 4x16x4, and three flat 12x16 bristle planes (16,33) / (16,49) / (16,65) whose top and bottom rects
// run from the root at the body (column 0) out to the tips. strider_cold is the same creature gone purple.

interface StriderLook {
  seed: number;
  body: Pal;
  fold: number;
  belly: Pal;
  leg: Pal;
  foot: number;
  hair: Pal;
  eye: number;
  eyeLit: number;
  mouth: number;
  lip: number;
}

const STRIDER_LOOK: StriderLook = {
  seed: 0x57d1,
  body: [0x731c1c, 0x872424, 0x9b2d2c, 0xa93634, 0xb6403d, 0xc34d49],
  fold: 0x581414,
  belly: [0x611a1a, 0x701f1f, 0x7e2525],
  leg: [0x3b3137, 0x463a42, 0x52454d, 0x5d4f58, 0x695a63],
  foot: 0x261e23,
  hair: [0x4e161b, 0x611c22, 0x74242a, 0x86303a],
  eye: 0x140a0c,
  eyeLit: 0x3a2a2e,
  mouth: 0x33090d,
  lip: 0xc05a5c,
};

const STRIDER_COLD_LOOK: StriderLook = {
  seed: 0x57d2,
  body: [0x4d2e57, 0x5b3667, 0x6a3f77, 0x784986, 0x855393, 0x925fa0],
  fold: 0x3a2142,
  belly: [0x40264a, 0x4a2c55, 0x553261],
  leg: [0x352d3b, 0x3f3646, 0x4a4051, 0x554a5c, 0x605567],
  foot: 0x221c28,
  hair: [0x331d3b, 0x40254a, 0x4d2e59, 0x5a3868],
  eye: 0x120a16,
  eyeLit: 0x3a2a44,
  mouth: 0x221028,
  lip: 0xa47cb0,
};

function striderSkin(k: StriderLook): TexImage {
  const t = img(64, 128);
  const r = new Rand(k.seed);
  const body = boxFaces(0, 0, 16, 14, 16);
  noiseBox(t, body, r, k.body, { w: [1, 2, 4, 6, 4, 1], cell: 2, white: 0.4 });
  noiseFace(t, body.bottom, r, k.belly, { w: [1, 2, 2] });
  // skin folds: broken darker rings round the barrel, every four rows
  const jag = valueNoise(r, 64, 14, 3);
  let off = 0;
  for (const f of SIDES) {
    const o = off;
    paintFace(t, body[f], (x, y, c) => {
      const band = (y + Math.round((jag[y * 64 + o + x] - 0.5) * 2)) % 4 === 3;
      return band && y > 0 && y < 13 && r.chance(0.8) ? mixC(c, k.fold, 0.5) : undefined;
    });
    off += body[f][2];
  }
  fleck(t, body.top, r, 0.08, [k.fold, k.body[1]]);
  // the face: two small dark eyes set wide, and a long mouth with a paler lip under it
  drawFace(t, body.front, [
    '................',
    '................',
    '................',
    '..EE........EE..',
    '..Ee........eE..',
    '................',
    '................',
    '.MMMMMMMMMMMMMM.',
    '..mmmmmmmmmmmm..',
    '...LLLLLLLLLL...',
  ], { E: k.eye, e: k.eyeLit, M: k.mouth, m: mixC(k.mouth, k.body[1], 0.4), L: k.lip }, r);
  // legs: ringed like the body, going dark at the feet
  for (const v of [32, 55]) {
    const leg = boxFaces(0, v, 4, 16, 4);
    noiseBox(t, leg, r, k.leg, { w: [1, 2, 4, 4, 1], cell: 1 });
    for (const f of SIDES)
      paintFace(t, leg[f], (_x, y, c, _w, h) => (y >= h - 2 ? mixC(c, k.foot, y === h - 1 ? 0.7 : 0.4) : y % 4 === 2 ? mixC(c, k.foot, 0.25) : undefined));
    noiseFace(t, leg.bottom, r, [k.foot, mixC(k.foot, k.leg[1], 0.5)]);
  }
  // bristles: sparse hairs from the root outwards, darker towards the tips, both faces alike
  for (const v of [33, 49, 65]) {
    const rows: number[][] = [];
    for (let y = 0; y < 16; y++) rows.push(y % 3 === 1 || (y % 3 === 2 && r.chance(0.25)) ? [8 + r.nextInt(5)] : []);
    for (const x0 of [32, 44])
      paintFace(t, [x0, v, 12, 16], (x, y) => {
        const len = rows[y][0];
        if (!len || x >= len) return null;
        const c = pick(r, k.hair, [1, 2, 3, 2]);
        return x >= len - 3 ? mixC(c, k.fold, 0.35) : c;
      });
  }
  return t;
}

/** vanilla strider_saddle: a leather seat on the body's top with a strap and buckle down each side */
function striderSaddle(): TexImage {
  const t = img(64, 128);
  const r = new Rand(0x5add1e);
  const LEATHER = [0x4f311c, 0x5c3a21, 0x6b4427, 0x7a4e2d, 0x885833];
  const body = boxFaces(0, 0, 16, 14, 16);
  // the seat: rows run back (0) to front (15); a raised cantle behind, the pommel in front
  paintFace(t, body.top, (x, y) => {
    if (x < 3 || x > 12 || y < 2 || y > 13) return undefined;
    const rim = x === 3 || x === 12 || y === 2 || y === 13;
    if (rim) return pick(r, [0x3e2616, 0x472c19]);
    if (y === 3 || y === 12) return pick(r, [0x92603a, 0x9e6a40]);
    return pick(r, LEATHER, [1, 2, 4, 3, 1]);
  });
  // flaps over the upper sides, then a strap down to a buckle
  for (const f of ['right', 'left'] as FaceName[])
    paintFace(t, body[f], (x, y) => {
      if (y <= 2 && x >= 3 && x <= 12) return y === 2 ? pick(r, [0x3e2616, 0x472c19]) : pick(r, LEATHER, [1, 2, 4, 3, 1]);
      if (x >= 7 && x <= 8 && y <= 8) {
        if (y >= 6 && y <= 7) return pick(r, [0x8e8e8e, 0xa8a8a8, 0x6e6e6e]);
        return pick(r, [0x2e1d11, 0x3a2516]);
      }
      return undefined;
    });
  for (const f of ['front', 'back'] as FaceName[]) paintFace(t, body[f], (x, y) => (y === 0 && x >= 3 && x <= 12 ? pick(r, [0x3e2616, 0x472c19]) : undefined));
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

function flameParticle(soul = false): TexImage {
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
  ], soul ? { r: 0x0f8a96, o: 0x2ab8c4, y: 0x72e4ea, W: 0xdcffff } : { r: 0xd8501a, o: 0xf08a1e, y: 0xffc836, W: 0xfff4a8 }, new Rand(1));
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

export function spawnEgg(base: number, spot: number): TexImage {
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
  pig_saddle: pigSaddle,
  cow,
  sheep,
  sheep_fur: sheepFur,
  chicken,
  zombie,
  skeleton: () => skeleton(),
  wither_skeleton: () => skeleton(WITHER_SKELETON_LOOK),
  creeper,
  creeper_armor: creeperArmor,
  spider: () => spider(),
  cave_spider: () => spider(CAVE_SPIDER_LOOK),
  spider_eyes: spiderEyes,
  enderman,
  enderman_eyes: endermanEyes,
  squid,
  slime,
  magma_cube: magmaCube,
  blaze,
  zombified_piglin: zombifiedPiglin,
  piglin,
  piglin_brute: piglinBrute,
  hoglin: () => hoglinSkin(HOGLIN_LOOK),
  zoglin: () => hoglinSkin(ZOGLIN_LOOK),
  strider: () => striderSkin(STRIDER_LOOK),
  strider_cold: () => striderSkin(STRIDER_COLD_LOOK),
  strider_saddle: striderSaddle,
  ghast: () => ghast(false),
  ghast_shooting: () => ghast(true),
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
// (powder snow) vanilla particle/snowflake_0..4: a white six-armed flake, smaller in each (as it ages)
{
  const flakes = [
    ['...W....', '.W.W.W..', '..WWW...', 'WWWlWWW.', '..WWW...', '.W.W.W..', '...W....', '........'],
    ['........', '..W.W...', '...W....', '.WWlWW..', '...W....', '..W.W...', '........', '........'],
    ['........', '........', '...W....', '..WlW...', '...W....', '........', '........', '........'],
    ['........', '........', '...W....', '..WWW...', '...W....', '........', '........', '........'],
    ['........', '........', '........', '...W....', '........', '........', '........', '........'],
  ];
  flakes.forEach((rows, i) => (MOB_PARTICLE_TEXTURES['snowflake_' + i] = () => pixelSprite(rows, { W: 0xffffff, l: 0xd6ecf7 })));
}
// (jukebox) vanilla particle/note: a pale eighth note with a darker rim, tinted by the particle's colour
MOB_PARTICLE_TEXTURES['note'] = () => pixelSprite([
  '...dWd..',
  '...dWWd.',
  '...dWdWd',
  '...dWd.d',
  '.ddWWd..',
  'dWWWWd..',
  'dWWWd...',
  '.ddd....',
], { d: 0x9a9a9a, W: 0xffffff });
// vanilla particle/angry: the dark cross of veins over a vexed villager
MOB_PARTICLE_TEXTURES['angry_villager'] = () => pixelSprite([
  '..d..d..',
  '.dL..Ld.',
  'dL....Ld',
  '........',
  '........',
  'dL....Ld',
  '.dL..Ld.',
  '..d..d..',
], { d: 0x303030, L: 0x6a6a6a });
for (let i = 0; i < 8; i++) MOB_PARTICLE_TEXTURES['sweep_' + i] = () => sweepFrame(i);
MOB_PARTICLE_TEXTURES['flame'] = () => flameParticle();
MOB_PARTICLE_TEXTURES['soul_fire_flame'] = () => flameParticle(true);
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
// instant effects' and witches' sparkles (vanilla spell_0..7): white, tinted; spell_7, the first, a wide
// four-pointed glint that draws in to a dot
const SPELL_SPARK = [
  ['........', '........', '........', '...W....', '........', '........', '........', '........'],
  ['........', '........', '...w....', '..wWw...', '...w....', '........', '........', '........'],
  ['........', '........', '...W....', '..WWW...', '...W....', '........', '........', '........'],
  ['........', '...w....', '...W....', '.wWWWw..', '...W....', '...w....', '........', '........'],
  ['........', '...W....', '..wWw...', '.WWWWW..', '..wWw...', '...W....', '........', '........'],
  ['...w....', '...W....', '.w.W.w..', 'wWWWWWw.', '.w.W.w..', '...W....', '...w....', '........'],
  ['...W....', '.w.W.w..', '..wWw...', 'WWW.WWW.', '..wWw...', '.w.W.w..', '...W....', '........'],
  ['W..W..W.', '.w.W.w..', '..w.w...', 'WW...WW.', '..w.w...', '.w.W.w..', 'W..W..W.', '........'],
];
SPELL_SPARK.forEach((rows, i) => (MOB_PARTICLE_TEXTURES['spell_' + i] = () => pixelSprite(rows, { W: 0xffffff, w: 0xbdbdbd })));
// the infested effect's specks (vanilla particle/infested): a grey mite
MOB_PARTICLE_TEXTURES['infested'] = () =>
  pixelSprite(['........', '........', '...ww...', '..wWWw..', '..WssW..', '...ww...', '........', '........'], { W: 0xc8d0c8, w: 0x8c9b8c, s: 0x5a645a });
// a gust of wind (vanilla gust_0..11, drawn from the wind charged effect): a curl of air opening out and thinning away
for (let i = 0; i < 12; i++)
  MOB_PARTICLE_TEXTURES['gust_' + i] = () => {
    const t = img(16, 16);
    const r0 = 2 + i * 0.45;
    for (let a = 0; a < Math.PI * 1.6; a += 0.05) {
      const r = r0 + a * 0.9;
      const x = Math.round(7.5 + r * Math.cos(a + i * 0.3)), y = Math.round(7.5 + r * Math.sin(a + i * 0.3) * 0.7);
      if (x >= 0 && y >= 0 && x < 16 && y < 16 && (i < 8 || (x + y + i) % 3)) plot(t, x, y, a < 2 ? 0xffffff : 0xdce4f4);
    }
    return t;
  };
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
  ['zombified_piglin', 0xea9393, 0x4c7129],
  ['ghast', 0xf9f9f9, 0xbcbcbc],
  ['blaze', 0xf6b201, 0xfff87e],
  ['shulker', 0x946794, 0x4d3852],
  ['wither_skeleton', 0x141414, 0x474d4d],
  ['hoglin', 0xc66e55, 0x5f6464],
  ['strider', 0x9c3436, 0x4d494d],
  ['zoglin', 0xc66e55, 0xe6e6e6],
  ['piglin', 0x995f40, 0xf9f3a4],
  ['villager', 0x563c33, 0xbd8b72],
  ['iron_golem', 0xdbcdc2, 0x74a332],
  ['zombie_villager', 0x563c33, 0x799c65],
  ['witch', 0x340000, 0x51a03e],
  ['husk', 0x797061, 0xe6cc94],
  ['stray', 0x617677, 0xddeaea],
  ['drowned', 0x8ff1d7, 0x799c65],
  ['silverfish', 0x6e6e6e, 0x303030],
  // (M8: goats)
  ['goat', 0xa5947c, 0x55493e],
  ['wolf', 0xd7d3d3, 0xceaf96], ['cat', 0xefc88e, 0x957256], ['ocelot', 0xefde7d, 0x564434],
  ['horse', 0xc09e7d, 0xeee500], ['donkey', 0x534539, 0x867566], ['mule', 0x1b0200, 0x51331d],
  ['llama', 0xc09e7d, 0x995f40], ['trader_llama', 0xeaa430, 0x456296], ['wandering_trader', 0x456296, 0xeaa430], ['snow_golem', 0xd9f2f2, 0x81a4a4], ['parrot', 0x0da70b, 0xff0000], ['polar_bear', 0xeeeede, 0xd5d6cd],
  ['rabbit', 0x995f40, 0x734831],
  ['fox', 0xd5b69f, 0xcc6920],
  // (M9: frogs)
  ['frog', 0xd07444, 0xffc77c], ['tadpole', 0x6d533d, 0x160a00],
  // (M4: the deep dark's warden)
  ['warden', 0x0f4649, 0x39d6e0],
  // (remaining mobs) vanilla SpawnEggItem colours
  ['bee', 0xedc343, 0x43241b], ['phantom', 0x43518a, 0x88ff00], ['panda', 0xe7e7e7, 0x1b1b22],
];

export const SPAWN_EGG_TEXTURES: Record<string, () => TexImage> = {};
for (const [name, base, spot] of EGGS) SPAWN_EGG_TEXTURES[name + '_spawn_egg'] = () => spawnEgg(base, spot);

export const FIRE_TEXTURES: Record<string, () => AnimTex> = {
  fire_0: () => fire(0xf14e2, { rate: 2.6, v: [0.7, 1.2], rx: [1.8, 3.6], life: [12, 22], stretch: 2.3 }),
  fire_1: () => fire(0xf14e4, { rate: 2.4, v: [0.8, 1.3], rx: [2.0, 3.4], life: [11, 20], stretch: 2.6 }),
  soul_fire_0: () => fire(0x50f14e2, { rate: 2.6, v: [0.7, 1.2], rx: [1.8, 3.6], life: [12, 22], stretch: 2.3 }, SOUL_FIRE_PAL),
  soul_fire_1: () => fire(0x50f14e4, { rate: 2.4, v: [0.8, 1.3], rx: [2.0, 3.4], life: [11, 20], stretch: 2.6 }, SOUL_FIRE_PAL),
};

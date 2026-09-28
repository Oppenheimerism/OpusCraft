// (remaining mobs: the phantom) The phantom's skin (vanilla textures/entity/phantom.png, 64x64 on PhantomModel's
// layout) and its eyes (phantom_eyes.png, drawn glowing over it): a lean, dark blue-grey flyer, paler underneath, a
// bony ridge down its back and tail; long wings of dusky membrane on pale finger bones, ragged at the trailing edge;
// a flat head with two green eyes at the corners of its face. Original pixel art.

import { Rand } from '../core/rng';
import { img, plot, clear, type TexImage } from './tex';
import { MOB_TEXTURES, boxFaces, noiseFace, paintFace, type Box, type Pal } from './mobs';

/** vanilla PhantomModel's boxes: the head (7x3x5), the body (5x3x9), the tail's two parts, a wing's base and tip */
const HEAD = boxFaces(0, 0, 7, 3, 5);
const BODY = boxFaces(0, 8, 5, 3, 9);
const TAIL_BASE = boxFaces(3, 20, 3, 2, 6);
const TAIL_TIP = boxFaces(4, 29, 1, 1, 6);
const WING_BASE = boxFaces(23, 12, 6, 2, 9);
const WING_TIP = boxFaces(16, 24, 13, 1, 9);

const DARK: Pal = [0x28325a, 0x2f3a66, 0x364371, 0x3d4b7c];
const BELLY: Pal = [0x4d5987, 0x566394, 0x606e9f];
const RIDGE: Pal = [0x7883ae, 0x8591bb, 0x939fc6];
const MEMBRANE: Pal = [0x3a4775, 0x425080, 0x4a598b, 0x536396];
const MEMBRANE_UNDER: Pal = [0x4b5886, 0x546292, 0x5d6b9c];
const BONE = 0x9aa6cc;
const BONE_DARK = 0x6f7aa6;
const EDGE = 0x222a4c;
const EYE = 0x6ff05a;
const EYE_LIT = 0xc8ffb6;

/** where the eyes are on the head's face: row 1, the two outer columns each side */
const EYES: [number, number][] = [[0, 1], [1, 1], [5, 1], [6, 1]];

function paintBox(t: TexImage, b: Box, r: Rand, top: Pal, sides: Pal, bottom: Pal): void {
  noiseFace(t, b.top, r, top, { cell: 1, white: 0.55 });
  noiseFace(t, b.bottom, r, bottom, { cell: 1, white: 0.55 });
  for (const k of ['right', 'front', 'left', 'back'] as const) noiseFace(t, b[k], r, sides, { cell: 1, white: 0.55 });
}

/** a wing's upper or lower face: membrane, a pale bone along the leading edge (its last row) and bones out along it, the trailing edge dark and ragged */
function paintWing(t: TexImage, f: [number, number, number, number], r: Rand, pal: Pal, fingers: number[], ragged: boolean): void {
  noiseFace(t, f, r, pal, { cell: 1, white: 0.6 });
  paintFace(t, f, (x, y, _c, w, h) => {
    if (y === h - 1) return x % 4 === 3 ? BONE_DARK : BONE;
    if (fingers.includes(x) && y >= 2) return y === 2 ? BONE_DARK : BONE;
    if (y === 0) return ragged && (x % 3 === 1 || x === w - 1) ? null : EDGE;
    return undefined;
  });
}

function paintPhantom(): TexImage {
  const t = img(64, 64);
  const r = new Rand(0x9a47);
  // the body: dark on top with the ridge of its spine down the middle, paler underneath
  paintBox(t, BODY, r, DARK, DARK, BELLY);
  paintFace(t, BODY.top, (x, y) => (x === 2 ? RIDGE[(y + 1) % 3] : undefined));
  // the head: flat and dark, a pale brow over the face
  paintBox(t, HEAD, r, DARK, DARK, BELLY);
  paintFace(t, HEAD.top, (x, y, _c, w, h) => (y === h - 1 && x > 0 && x < w - 1 ? RIDGE[0] : x === 3 && y < h - 1 ? RIDGE[1] : undefined));
  paintFace(t, HEAD.front, (x, y) => (y === 2 ? DARK[0] : undefined));
  const [fx, fy] = HEAD.front;
  for (const [x, y] of EYES) plot(t, fx + x, fy + y, x === 1 || x === 5 ? EYE_LIT : EYE);
  // the tail: its base as the body, its tip darker, the ridge running on down it
  paintBox(t, TAIL_BASE, r, DARK, DARK, BELLY);
  paintFace(t, TAIL_BASE.top, (x) => (x === 1 ? RIDGE[1] : undefined));
  paintBox(t, TAIL_TIP, r, [DARK[0], DARK[1]], [DARK[0], DARK[1]], [BELLY[0]]);
  paintFace(t, TAIL_TIP.top, (_x, y) => (y % 2 === 0 ? RIDGE[0] : undefined));
  // the wings: membrane on bones, the base a little thicker and darker at the shoulder
  paintBox(t, WING_BASE, r, MEMBRANE, DARK, MEMBRANE_UNDER);
  paintWing(t, WING_BASE.top, r, MEMBRANE, [2], false);
  paintWing(t, WING_BASE.bottom, r, MEMBRANE_UNDER, [2], false);
  noiseFace(t, WING_BASE.front, r, [BONE_DARK, BONE], { cell: 1 });
  paintBox(t, WING_TIP, r, MEMBRANE, MEMBRANE, MEMBRANE_UNDER);
  paintWing(t, WING_TIP.top, r, MEMBRANE, [3, 7, 11], true);
  paintWing(t, WING_TIP.bottom, r, MEMBRANE_UNDER, [3, 7, 11], true);
  noiseFace(t, WING_TIP.front, r, [BONE_DARK, BONE], { cell: 1 });
  // (the trailing edge's end face ragged too, where the faces above have gaps)
  paintFace(t, WING_TIP.back, (x) => (x % 3 === 1 || x === 12 ? null : EDGE));
  return t;
}

/** vanilla phantom_eyes.png: the eyes alone, the rest clear */
function paintPhantomEyes(): TexImage {
  const t = img(64, 64);
  const [fx, fy] = HEAD.front;
  for (const [x, y] of EYES) plot(t, fx + x, fy + y, x === 1 || x === 5 ? EYE_LIT : EYE);
  void clear;
  return t;
}

MOB_TEXTURES['phantom'] = paintPhantom;
MOB_TEXTURES['phantom_eyes'] = paintPhantomEyes;

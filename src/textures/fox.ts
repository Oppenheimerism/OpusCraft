// The foxes' skins (vanilla textures/entity/fox/fox.png, fox_sleep.png, snow_fox.png and snow_fox_sleep.png, 48x32 on
// FoxModel's layout): the red fox, russet with a darker streak down its back and crown, a cream muzzle, cheeks, throat
// and belly, black stockings, the backs and tips of its ears black and a white tip to its brush; and the snow fox,
// white all over, its fur shaded palest grey, soft grey-brown stockings and grey tips to its ears. Each has its
// sleeping skin, the same but with its eyes shut. Original pixel art.

import { Rand } from '../core/rng';
import { img, plot, getPx, mixC, type TexImage } from './tex';
import { MOB_TEXTURES, boxFaces, noiseBox, noiseFace, paintFace, type Face, type Pal } from './mobs';

const HEAD = boxFaces(1, 5, 8, 6, 6);
const RIGHT_EAR = boxFaces(8, 1, 2, 2, 1);
const LEFT_EAR = boxFaces(15, 1, 2, 2, 1);
const SNOUT = boxFaces(6, 18, 4, 2, 3);
const BODY = boxFaces(24, 15, 6, 11, 6);
const TAIL = boxFaces(30, 0, 4, 9, 5);
/** the left legs' skin and the right legs' */
const LEGS = [boxFaces(4, 24, 2, 6, 2), boxFaces(13, 24, 2, 6, 2)];

interface Coat {
  fur: Pal;
  furW?: Pal;
  /** a shade darker: down the spine, over the crown, along the top of the brush */
  dark: Pal;
  /** the muzzle, cheeks, throat and belly, and the tip of the brush */
  pale: Pal;
  /** the stockings */
  sock: Pal;
  /** the backs and tips of the ears */
  earTip: Pal;
  /** inside the ears */
  earIn: Pal;
  eye: number;
  /** the white of the eye, beside it toward the nose */
  eyeWhite: number;
  /** an eye shut */
  lid: number;
  nose: number;
}

/** paints `pal` over the face where `where` says (local x, y), speckled */
function mark(t: TexImage, f: Face, r: Rand, pal: Pal, where: (x: number, y: number, w: number, h: number) => boolean): void {
  noiseFace(t, f, r, pal, { cell: 1, white: 0.6, mask: where });
}

/** blends the face toward `c` by `k(x, y)` (0: untouched) */
function fade(t: TexImage, f: Face, c: number, k: (x: number, y: number, w: number, h: number) => number): void {
  paintFace(t, f, (x, y, px, w, h) => {
    const a = k(x, y, w, h);
    return a > 0 ? mixC(px, c, a) : undefined;
  });
}

function paintFox(c: Coat, seed: number, asleep: boolean): () => TexImage {
  return () => {
    const t = img(48, 32);
    // (the same seed awake and asleep: only the eyes differ)
    const r = new Rand(seed);
    const fur = { w: c.furW, cell: 2, white: 0.45 };
    // the head: a darker crown, the throat pale underneath; the face pale below the eyes, all but a stripe up the
    // bridge of the nose, and the cheeks pale along the jaw, further up toward the face (on the top face the front
    // row is the last; the right side's front edge is its last column, the left side's its first)
    noiseBox(t, HEAD, r, c.fur, fur);
    mark(t, HEAD.top, r, c.dark, (x, y, w) => x >= 2 && x < w - 2 && y <= 3);
    mark(t, HEAD.back, r, c.dark, (x, y, w) => x >= 2 && x < w - 2 && y <= 2);
    noiseFace(t, HEAD.bottom, r, c.pale, { cell: 1 });
    mark(t, HEAD.front, r, c.pale, (x, y, w) => y >= 4 || (y === 3 && (x === 0 || x === w - 1)));
    mark(t, HEAD.right, r, c.pale, (x, y, w) => y >= 4 || (y === 3 && x >= w - 2));
    mark(t, HEAD.left, r, c.pale, (x, y) => y >= 4 || (y === 3 && x <= 1));
    // the eyes, the pupil outermost; shut, a dark line
    const [fx, fy] = HEAD.front;
    for (const [pupil, white] of [[1, 2], [6, 5]]) {
      plot(t, fx + pupil, fy + 2, asleep ? c.lid : c.eye);
      plot(t, fx + white, fy + 2, asleep ? mixC(c.lid, getPx(t, fx + white, fy + 2), 0.35) : c.eyeWhite);
    }
    // the snout: fur over the bridge, the lips and chin pale, and the nose black at its tip
    noiseBox(t, SNOUT, r, c.fur, fur);
    noiseFace(t, SNOUT.bottom, r, c.pale, { cell: 1 });
    for (const k of ['right', 'left', 'front', 'back'] as const) mark(t, SNOUT[k], r, c.pale, (_x, y) => y === 1);
    const [nx, ny] = SNOUT.front, [tx, ty, , th] = SNOUT.top;
    for (const x of [1, 2]) {
      plot(t, nx + x, ny, c.nose);
      plot(t, tx + x, ty + th - 1, c.nose);
    }
    // the ears: black at the back and the tips, pale inside
    for (const ear of [RIGHT_EAR, LEFT_EAR]) {
      noiseBox(t, ear, r, c.fur, { ...fur, cell: 1 });
      noiseFace(t, ear.top, r, c.earTip, { cell: 1 });
      mark(t, ear.back, r, c.earTip, (_x, y) => y === 0 || r.nextInt(2) === 0);
      mark(t, ear.front, r, c.earIn, (_x, y) => y === 1);
      mark(t, ear.front, r, c.earTip, (_x, y) => y === 0);
      for (const k of ['right', 'left'] as const) mark(t, ear[k], r, c.earTip, (_x, y) => y === 0);
    }
    // the body, laid along its length: the chest in front (its top face, the belly side its last rows), the rump
    // behind, the belly underneath (its front face) pale, and paler toward it down the sides (the right side's belly
    // edge is its last column, the left side's its first); a darker streak down the spine
    noiseBox(t, BODY, r, c.fur, fur);
    noiseFace(t, BODY.front, r, c.pale, { cell: 1 });
    mark(t, BODY.back, r, c.dark, (x, y) => (x === 2 || x === 3) && y <= 8);
    fade(t, BODY.right, c.pale[0], (x, _y, w) => (x === w - 1 ? 0.85 : x === w - 2 ? 0.35 : 0));
    fade(t, BODY.left, c.pale[0], (x) => (x === 0 ? 0.85 : x === 1 ? 0.35 : 0));
    mark(t, BODY.top, r, c.pale, (x, y, w) => y >= 3 || (y === 2 && x >= 1 && x < w - 1));
    mark(t, BODY.bottom, r, c.pale, (_x, y) => y >= 5);
    // the brush, base (its top face) to tip (its bottom face): darker along the top, white at the tip
    noiseBox(t, TAIL, r, c.fur, fur);
    mark(t, TAIL.back, r, c.dark, (x, y) => (x === 1 || x === 2) && y <= 5);
    noiseFace(t, TAIL.bottom, r, c.pale, { cell: 1 });
    for (const k of ['right', 'front', 'left', 'back'] as const) {
      mark(t, TAIL[k], r, c.pale, (_x, y) => y >= 7);
      fade(t, TAIL[k], c.pale[0], (_x, y) => (y === 6 ? 0.5 : 0));
    }
    // the legs: fur at the top, then the stockings down to the paws, darker underneath
    for (const leg of LEGS) {
      noiseBox(t, leg, r, c.fur, fur);
      for (const k of ['right', 'front', 'left', 'back'] as const) {
        mark(t, leg[k], r, c.sock, (_x, y) => y >= 2);
        fade(t, leg[k], c.sock[0], (_x, y) => (y === 1 ? 0.4 : 0));
      }
      noiseFace(t, leg.bottom, r, c.sock.map((s) => mixC(s, 0x000000, 0.25)), { cell: 1 });
    }
    return t;
  };
}

const COATS: Record<string, Coat> = {
  fox: {
    fur: [0xb4531a, 0xc4601f, 0xd06c24, 0xdb792c, 0xe48836], furW: [1, 2, 4, 3, 1],
    dark: [0x96431a, 0xa44b1a, 0xb0541d],
    pale: [0xf1e8da, 0xe7dccb, 0xf8f3ea, 0xdccdb7],
    sock: [0x2a1c16, 0x33231b, 0x3e2b20],
    earTip: [0x261a15, 0x30211a],
    earIn: [0xe8d8c2, 0xdcc8ae],
    eye: 0x150e0a, eyeWhite: 0xf3eadb, lid: 0x4e2412, nose: 0x1a1310,
  },
  snow_fox: {
    fur: [0xd8d6d0, 0xe2e0da, 0xebeae5, 0xf3f2ee, 0xfaf9f6], furW: [1, 2, 4, 3, 1],
    dark: [0xcdcac3, 0xd4d1cb],
    pale: [0xfbfaf7, 0xf5f4f0, 0xfefefc],
    sock: [0xa69d94, 0xb2aaa1, 0x9b9289],
    earTip: [0x8d857d, 0x999189],
    earIn: [0xeadfdc, 0xe0d3cf],
    eye: 0x1b1918, eyeWhite: 0xb7c1ca, lid: 0x78726b, nose: 0x292422,
  },
};

let seed = 0xf0c5;
for (const [name, c] of Object.entries(COATS)) {
  MOB_TEXTURES[name] = paintFox(c, seed, false);
  MOB_TEXTURES[name + '_sleep'] = paintFox(c, seed, true);
  seed++;
}

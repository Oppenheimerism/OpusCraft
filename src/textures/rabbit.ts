// The rabbits' skins (vanilla textures/entity/rabbit/*.png, 64x32 on RabbitModel's layout): the brown one with its
// cream belly and white scut, the white one with pink eyes, the black one, the white one splotched black (ears, round
// the eyes and a saddle over its rump), the gold one of the desert, and the salt-and-pepper one flecked grey and
// brown; the killer bunny (caerbannog), white with blood-red eyes and blood about its mouth; and Toast, white with a
// black head and ears split by a white blaze, and black patches on its back. Pink noses and the insides of the
// ears, a pale scut, paler paws. Original pixel art.

import { Rand } from '../core/rng';
import { img, plot, getPx, mixC, valueNoise, type TexImage } from './tex';
import { MOB_TEXTURES, boxFaces, noiseBox, noiseFace, paintFace, type Face, type Pal } from './mobs';

const BODY = boxFaces(0, 0, 6, 5, 10);
const HEAD = boxFaces(32, 0, 5, 4, 5);
const RIGHT_EAR = boxFaces(52, 0, 2, 5, 1);
const LEFT_EAR = boxFaces(58, 0, 2, 5, 1);
const TAIL = boxFaces(52, 6, 3, 3, 2);
const NOSE = boxFaces(32, 9, 1, 1, 1);
const RIGHT_FRONT_LEG = boxFaces(0, 15, 2, 7, 2);
const LEFT_FRONT_LEG = boxFaces(8, 15, 2, 7, 2);
const RIGHT_HAUNCH = boxFaces(16, 15, 2, 4, 5);
const LEFT_HAUNCH = boxFaces(30, 15, 2, 4, 5);
const RIGHT_HIND_FOOT = boxFaces(8, 24, 2, 1, 7);
const LEFT_HIND_FOOT = boxFaces(26, 24, 2, 1, 7);
const EARS = [RIGHT_EAR, LEFT_EAR];
const FRONT_LEGS = [RIGHT_FRONT_LEG, LEFT_FRONT_LEG];
const HAUNCHES = [RIGHT_HAUNCH, LEFT_HAUNCH];
const HIND_FEET = [RIGHT_HIND_FOOT, LEFT_HIND_FOOT];

interface Coat {
  /** the back, the sides and the head */
  fur: Pal;
  furW?: Pal;
  furCell?: number;
  /** underneath: the belly, the chin, the muzzle */
  belly: Pal;
  tail: Pal;
  paw: Pal;
  sole: Pal;
  innerEar: Pal;
  eye: number;
  /** round the eye (the fur there, darker) */
  rim?: number;
  nose: number;
  /** its own markings, over the rest */
  marks?: (t: TexImage, r: Rand) => void;
}

/** a field of soft blobs over a face (0-1): markings that clump */
function blobs(r: Rand, f: Face, cell: number): (x: number, y: number) => number {
  const [, , w, h] = f;
  const v = valueNoise(r, w, h, cell);
  return (x, y) => v[y * w + x];
}

/** paints `pal` over the face where `where` says (local x, y) */
function mark(t: TexImage, f: Face, r: Rand, pal: Pal, where: (x: number, y: number, w: number, h: number) => boolean): void {
  noiseFace(t, f, r, pal, { cell: 1, white: 0.6, mask: where });
}

function paintRabbit(c: Coat, seed: number): () => TexImage {
  return () => {
    const t = img(64, 32);
    const r = new Rand(seed);
    const fur = { w: c.furW, cell: c.furCell ?? 2, white: 0.45 };
    // the body: its back (the top), the chest in front, the rump behind; the belly underneath, and paler toward it
    // down the sides
    noiseBox(t, BODY, r, c.fur, fur);
    noiseFace(t, BODY.bottom, r, c.belly, { cell: 1 });
    for (const k of ['right', 'left'] as const) paintFace(t, BODY[k], (_x, y, px, _w, h) => (y === h - 1 ? mixC(px, c.belly[0], 0.6) : undefined));
    paintFace(t, BODY.front, (_x, y, px, _w, h) => (y >= h - 2 ? mixC(px, c.belly[0], 0.5) : undefined));
    // the head: a paler muzzle round the nose and under the chin, an eye on each side toward the front
    noiseBox(t, HEAD, r, c.fur, fur);
    noiseFace(t, HEAD.bottom, r, c.belly, { cell: 1 });
    paintFace(t, HEAD.front, (x, y, px) => (y >= 2 && x >= 1 && x <= 3 ? mixC(px, c.belly[0], y === 3 ? 0.75 : 0.45) : undefined));
    for (const k of ['right', 'left'] as const) {
      const [x, y, w] = HEAD[k];
      const ex = k === 'right' ? x + w - 2 : x + 1;
      if (c.rim !== undefined) plot(t, k === 'right' ? ex - 1 : ex + 1, y + 1, c.rim);
      plot(t, ex, y + 1, c.eye);
    }
    // the nose, and the ears: pink inside, down from the tip
    noiseBox(t, NOSE, r, [c.nose]);
    for (const ear of EARS) {
      noiseBox(t, ear, r, c.fur, { ...fur, cell: 1 });
      noiseFace(t, ear.front, r, c.innerEar, { cell: 1, mask: (_x, y) => y >= 1 });
    }
    noiseBox(t, TAIL, r, c.tail, { cell: 1, white: 0.5 });
    // the legs: fur, then paler paws with the soles underneath
    for (const leg of FRONT_LEGS) {
      noiseBox(t, leg, r, c.fur, fur);
      for (const k of ['right', 'front', 'left', 'back'] as const) noiseFace(t, leg[k], r, c.paw, { cell: 1, mask: (_x, y, _w, h) => y >= h - 2 });
      noiseFace(t, leg.bottom, r, c.sole, { cell: 1 });
    }
    for (const h of HAUNCHES) {
      noiseBox(t, h, r, c.fur, fur);
      noiseFace(t, h.bottom, r, c.belly, { cell: 1 });
    }
    // the long hind feet: paler toward the toes (the front rows on top, the front end along the sides)
    for (const foot of HIND_FEET) {
      noiseBox(t, foot, r, c.fur, fur);
      noiseFace(t, foot.top, r, c.paw, { cell: 1, mask: (_x, y) => y >= 3 });
      noiseFace(t, foot.right, r, c.paw, { cell: 1, mask: (x) => x >= 4 });
      noiseFace(t, foot.left, r, c.paw, { cell: 1, mask: (x) => x <= 2 });
      noiseFace(t, foot.front, r, c.paw, { cell: 1 });
      noiseFace(t, foot.bottom, r, c.sole, { cell: 1 });
    }
    c.marks?.(t, r);
    return t;
  };
}

const BLACK: Pal = [0x151313, 0x1d1a1a, 0x262222, 0x2f2a29];
const WHITE: Pal = [0xe4e1da, 0xecebe5, 0xf4f3ee, 0xfbfaf6];
const WHITE_W: Pal = [1, 2, 3, 2];
const PINK_EAR: Pal = [0xecaaae, 0xe29ca2, 0xf4bcbc];

const COATS: Record<string, Coat> = {
  brown: {
    fur: [0x5b3e27, 0x6c4c30, 0x80603f, 0x94734f, 0xa78661], furW: [1, 3, 4, 3, 1],
    belly: [0xd6c6aa, 0xcab694, 0xe0d3bb], tail: [0xf0ebe1, 0xe4dccd, 0xf8f5ef], paw: [0xb49a78, 0xa68b68], sole: [0x6b5645, 0x5e4b3c],
    innerEar: [0xc98e84, 0xbd8076], eye: 0x120b07, rim: 0x4a3322, nose: 0xcf8585,
  },
  white: {
    fur: WHITE, furW: WHITE_W, belly: [0xdad6cd, 0xe2ded6], tail: [0xfdfcf9, 0xf3f1eb], paw: [0xe8e5dd, 0xdedad1], sole: [0xd6b4ab, 0xcaa59c],
    innerEar: PINK_EAR, eye: 0xc02a3a, rim: 0xe9b7ba, nose: 0xee9ca4,
  },
  black: {
    fur: [0x141212, 0x1c1919, 0x252121, 0x302b2a], furW: [2, 3, 3, 1],
    belly: [0x2c2726, 0x342e2c], tail: [0x3a3432, 0x302b2a], paw: [0x2a2524, 0x322c2b], sole: [0x4a3c3a, 0x413534],
    innerEar: [0x5e3e3e, 0x6b4747], eye: 0x7a4a1e, rim: 0x0a0808, nose: 0x6e4a4a,
  },
  white_splotched: {
    fur: WHITE, furW: WHITE_W, belly: [0xdad6cd, 0xe2ded6], tail: [0xfdfcf9, 0xf3f1eb], paw: [0xe8e5dd, 0xdedad1], sole: [0xc9aaa2, 0xbe9d95],
    innerEar: [0x4a3434, 0x553c3c], eye: 0x0e0a08, rim: 0x151313, nose: 0xd98f95,
    marks: (t, r) => {
      // black ears, black round the eyes, and a black saddle over the back half, splashing down the sides
      for (const ear of EARS) for (const k of ['top', 'right', 'left', 'back'] as const) mark(t, ear[k], r, BLACK, () => true);
      for (const k of ['right', 'left'] as const) mark(t, HEAD[k], r, BLACK, (x, y, w) => y <= 2 && (k === 'right' ? x >= w - 4 : x <= 3) && !(y === 1 && (k === 'right' ? x === w - 2 : x === 1)));
      mark(t, HEAD.top, r, BLACK, (x, y) => y <= 1 && x >= 1 && x <= 3);
      const top = blobs(r, BODY.top, 3);
      mark(t, BODY.top, r, BLACK, (x, y) => y <= 4 || (y <= 6 && top(x, y) > 0.5));
      for (const k of ['right', 'left'] as const) {
        const f = blobs(r, BODY[k], 3);
        // (the back end of the right side is its left, of the left side its right)
        mark(t, BODY[k], r, BLACK, (x, y, w) => { const back = k === 'right' ? w - 1 - x : x; return back >= 5 && y <= 2 + (f(x, y) > 0.55 ? 1 : 0); });
      }
      mark(t, BODY.back, r, BLACK, (_x, y) => y <= 2);
      for (const h of HAUNCHES) for (const k of ['top', 'right', 'left', 'back'] as const) mark(t, h[k], r, BLACK, (_x, y) => k === 'top' || y <= 1);
    },
  },
  gold: {
    fur: [0xc2944a, 0xd1a557, 0xdcb566, 0xe6c47a, 0xeed28e], furW: [1, 2, 4, 3, 1],
    belly: [0xf0e2bd, 0xe8d7ad, 0xf6ebcf], tail: [0xf6efdc, 0xece2c7], paw: [0xe9d3a2, 0xdfc38c], sole: [0x9c7a4c, 0x8e6e44],
    innerEar: [0xe0a58e, 0xd6977f], eye: 0x1a0f06, rim: 0x8a6430, nose: 0xd98f7e,
  },
  salt: {
    fur: [0x4e443b, 0x685b4e, 0x837463, 0x9f917e, 0xbfb3a1, 0xd8cebf], furW: [2, 3, 3, 3, 2, 1], furCell: 1,
    belly: [0xc8bdad, 0xbdb09e, 0xd4cabc], tail: [0xe6dfd4, 0xd8cfc2], paw: [0xb3a794, 0xa39784], sole: [0x5c5046, 0x51473e],
    innerEar: [0xb88a80, 0xab7c73], eye: 0x100b08, rim: 0x3a322b, nose: 0xc4847e,
  },
  caerbannog: {
    fur: WHITE, furW: WHITE_W, belly: [0xdad6cd, 0xe2ded6], tail: [0xfdfcf9, 0xf3f1eb], paw: [0xe8e5dd, 0xdedad1], sole: [0xd6b4ab, 0xcaa59c],
    innerEar: PINK_EAR, eye: 0xf01818, rim: 0x8e0c0c, nose: 0xd9707a,
    marks: (t, r) => {
      // blood about its mouth and down its chin and chest, spattered on its paws
      const BLOOD: Pal = [0x7c0a0a, 0x9c1010, 0xb81a1a];
      mark(t, HEAD.front, r, BLOOD, (x, y) => y === 3 || (y === 2 && (x === 1 || x === 3)));
      mark(t, HEAD.bottom, r, BLOOD, (x, y) => y >= 3 && x >= 1 && x <= 3);
      mark(t, NOSE.bottom, r, BLOOD, () => true);
      const chest = blobs(r, BODY.front, 2);
      mark(t, BODY.front, r, BLOOD, (x, y) => y >= 3 && chest(x, y) > 0.45);
      for (const leg of FRONT_LEGS) mark(t, leg.front, r, BLOOD, (x, y) => y === 6 || (y === 5 && x === 0));
      // (and a darker spot or two gone dry)
      const [fx, fy] = HEAD.front;
      plot(t, fx + 2, fy + 3, mixC(getPx(t, fx + 2, fy + 3), 0x4a0606, 0.5));
    },
  },
  toast: {
    fur: WHITE, furW: WHITE_W, belly: [0xdad6cd, 0xe2ded6], tail: [0xfdfcf9, 0xf3f1eb], paw: [0xe8e5dd, 0xdedad1], sole: [0xc9aaa2, 0xbe9d95],
    innerEar: [0x4a3434, 0x553c3c], eye: 0x6a3c18, rim: 0x151313, nose: 0xd98f95,
    marks: (t, r) => {
      // a black head (and ears) with a white blaze down the middle of its face and over its crown
      for (const ear of EARS) for (const k of ['top', 'right', 'left', 'back'] as const) mark(t, ear[k], r, BLACK, () => true);
      for (const k of ['right', 'left', 'back'] as const) mark(t, HEAD[k], r, BLACK, (x, y, w) => k === 'back' || !(y === 1 && (k === 'right' ? x === w - 2 : x === 1)));
      mark(t, HEAD.top, r, BLACK, (x) => x !== 2);
      mark(t, HEAD.front, r, BLACK, (x, y) => x !== 2 && y <= 2 && !(y === 2 && (x === 1 || x === 3)));
      // black patches over its back and hips
      const top = blobs(r, BODY.top, 4);
      mark(t, BODY.top, r, BLACK, (x, y) => top(x, y) > 0.55 || (y >= 1 && y <= 3 && x >= 1 && x <= 4));
      for (const k of ['right', 'left'] as const) {
        const f = blobs(r, BODY[k], 4);
        mark(t, BODY[k], r, BLACK, (x, y) => y <= 2 && f(x, y) > 0.5);
      }
      for (const h of HAUNCHES) {
        const f = blobs(r, h.right, 2);
        for (const k of ['right', 'left', 'top'] as const) mark(t, h[k], r, BLACK, (x, y) => k === 'top' || f(x % 5, y) > 0.45);
      }
    },
  },
};

let seed = 0x7ab1;
for (const [name, c] of Object.entries(COATS)) MOB_TEXTURES['rabbit_' + name] = paintRabbit(c, seed++);

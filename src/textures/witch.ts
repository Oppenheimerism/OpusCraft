// The witch (vanilla textures/entity/witch.png, on WitchModel's 64x128 layout: the villager's body above, the hat's
// four stacked boxes below): a sallow villager face with a unibrow over purple eyes and a green wart on the long
// nose, a deep purple robe tied with a dark green cord, and a tall crooked hat of charcoal black. Original pixel
// art in the style of vanilla 1.21.

import { TexImage, img, plot, mixC, mulC, Rand } from './tex';
import { MOB_TEXTURES, boxFaces, noiseBox, noiseFace, paintFace, drawFace, pick, SIDES, type FaceName, type Pal } from './mobs';
import { SKIN, SKIN_W, BROW, SHOE } from './villager';

const HEAD = boxFaces(0, 0, 8, 10, 8);
const NOSE = boxFaces(24, 0, 2, 4, 2);
const MOLE = boxFaces(0, 0, 1, 1, 1);
const BODY = boxFaces(16, 20, 8, 12, 6);
const JACKET = boxFaces(0, 38, 8, 20, 6);
const ARM = boxFaces(44, 22, 4, 8, 4);
const FOREARMS = boxFaces(40, 38, 8, 4, 4);
const LEG = boxFaces(0, 22, 4, 12, 4);
const HAT = boxFaces(0, 64, 10, 2, 10);
const HAT2 = boxFaces(0, 76, 7, 4, 7);
const HAT3 = boxFaces(0, 87, 4, 4, 4);
const HAT4 = boxFaces(0, 95, 1, 2, 1);

/** the villager's skin gone a little sallow */
const WSKIN: Pal = SKIN.map((c) => mixC(c, 0x9a9f6c, 0.14));
const ROBE: Pal = [0x2c1537, 0x361b44, 0x412251, 0x4c295e, 0x58316b];
const ROBE_W: Pal = [1, 3, 6, 3, 1];
const CORD = [0x24361a, 0x2f4721];
const HATC: Pal = [0x141217, 0x1a171e, 0x201c25, 0x27222c, 0x2e2833];
const HAT_W: Pal = [1, 3, 5, 3, 1];
const WART = [0x4f8a2a, 0x62a334, 0x3d6e22];

function witch(): TexImage {
  const t = img(64, 128);
  const r = new Rand(0x317c4);
  // the head: a villager's, with purple eyes under the brow and the wrinkles of age
  noiseBox(t, HEAD, r, WSKIN, { w: SKIN_W, cell: 2, white: 0.35 });
  paintFace(t, HEAD.top, (_x, _y, c) => mulC(c, 1.02));
  paintFace(t, HEAD.bottom, (_x, _y, c) => mulC(c, 0.82));
  paintFace(t, HEAD.back, (_x, y, c, _w, h) => mulC(c, y > h - 3 ? 0.9 : 0.97));
  drawFace(t, HEAD.front, [
    '........',
    '........',
    '........',
    '.w....w.',
    '.bBBBBb.',
    '.WP..PW.',
    '.s....s.',
    '........',
    '.lm..ml.',
    '.c....c.',
  ], {
    b: mixC(BROW, WSKIN[1], 0.35), B: BROW, W: 0xe4e2d8, P: 0x6b2f86, s: mulC(WSKIN[3], 0.88), m: mulC(WSKIN[2], 0.8), l: mulC(WSKIN[2], 0.9),
    c: mulC(WSKIN[3], 0.9), w: mulC(WSKIN[3], 0.92),
  }, r);
  for (const k of ['right', 'left'] as FaceName[]) drawFace(t, HEAD[k], ['........', '........', '........', '........', '........', '....ee..', '....e...'], { e: mulC(WSKIN[2], 0.86) }, r);
  noiseBox(t, NOSE, r, WSKIN, { w: [1, 2, 4, 6, 3], cell: 1 });
  paintFace(t, NOSE.front, (_x, y, c) => (y === 0 ? mulC(c, 1.04) : y === 3 ? mixC(c, 0xa05a48, 0.28) : undefined));
  paintFace(t, NOSE.bottom, (_x, _y, c) => mixC(mulC(c, 0.8), 0x7a3c30, 0.2));
  for (const k of ['right', 'left', 'back'] as FaceName[]) paintFace(t, NOSE[k], (_x, _y, c) => mulC(c, 0.9));
  // the wart (its own little box on the nose, in the corner the head leaves free)
  for (const k of ['top', 'bottom', 'right', 'front', 'left', 'back'] as FaceName[]) {
    const [x, y] = MOLE[k];
    plot(t, x, y, k === 'top' ? WART[1] : k === 'bottom' ? WART[2] : WART[r.nextInt(2)]);
  }

  // the robe: body, the long jacket over it, sleeves, the cord tied round the waist
  noiseBox(t, BODY, r, ROBE, { w: ROBE_W, cell: 1 });
  paintFace(t, BODY.front, (x, y) => (y < 2 && x >= 2 && x <= 5 ? pick(r, WSKIN, SKIN_W) : undefined));
  noiseBox(t, JACKET, r, ROBE, { w: ROBE_W, cell: 1, white: 0.55 });
  // (the collar's V of skin)
  for (const [x, y] of [[3, 0], [4, 0], [3, 1], [4, 1]]) t.data[((JACKET.front[1] + y) * t.w + JACKET.front[0] + x) * 4 + 3] = 0;
  for (const k of SIDES) {
    const [x0, y0, w] = JACKET[k];
    for (let x = 0; x < w; x++) plot(t, x0 + x, y0 + 7, CORD[(x + (k === 'front' ? 0 : 1)) % 2]);
  }
  // (the cord's knot and its two ends hanging at the front)
  const [fx, fy] = JACKET.front;
  plot(t, fx + 3, fy + 8, CORD[1]), plot(t, fx + 3, fy + 9, CORD[0]), plot(t, fx + 4, fy + 8, CORD[0]);
  for (const k of ['front', 'back'] as FaceName[]) paintFace(t, JACKET[k], (x, _y, c) => (x === 0 || x === 7 ? mulC(c, 0.88) : undefined));
  for (const k of SIDES) paintFace(t, JACKET[k], (_x, y, c, _w, h) => (y >= h - 2 ? mulC(c, 0.84) : undefined));
  paintFace(t, JACKET.bottom, (_x, _y, c) => mulC(c, 0.66));
  noiseBox(t, ARM, r, ROBE, { w: ROBE_W, cell: 1 });
  noiseBox(t, FOREARMS, r, ROBE, { w: ROBE_W, cell: 1 });
  paintFace(t, ARM.bottom, (_x, _y, c) => mulC(c, 0.6));
  paintFace(t, FOREARMS.top, (_x, _y, c) => mulC(c, 0.92));
  paintFace(t, FOREARMS.front, (x, _y, c) => (x === 3 || x === 4 ? mulC(c, 0.84) : undefined));
  // (the hands poking out of the folded sleeves)
  for (const k of ['right', 'left'] as FaceName[]) noiseFace(t, FOREARMS[k], r, WSKIN, { w: SKIN_W, cell: 1 });
  noiseBox(t, LEG, r, ROBE, { w: ROBE_W, cell: 1 });
  for (const k of SIDES) noiseFace(t, [LEG[k][0], LEG[k][1] + 8, LEG[k][2], 4], r, SHOE);
  noiseFace(t, LEG.bottom, r, SHOE);

  // the hat: the brim, then three boxes each smaller and more askew, the last a bent tip
  const hat = (b: typeof HAT, top: number) => {
    noiseBox(t, b, r, HATC, { w: HAT_W, cell: 1, white: 0.6 });
    paintFace(t, b.top, (_x, _y, c) => mulC(c, top));
    paintFace(t, b.bottom, (_x, _y, c) => mulC(c, 0.72));
  };
  hat(HAT, 1.12);
  hat(HAT2, 1.08);
  hat(HAT3, 1.08);
  hat(HAT4, 1.1);
  // (a worn band round the crown's foot, a shade of purple in the black)
  for (const k of SIDES) {
    const [x0, y0, w, h] = HAT2[k];
    for (let x = 0; x < w; x++) plot(t, x0 + x, y0 + h - 1, mixC(pick(r, HATC, HAT_W), ROBE[2], 0.45));
  }
  // (the brim's edge catching the light)
  for (const k of SIDES) paintFace(t, HAT[k], (_x, y, c) => (y === 0 ? mulC(c, 1.18) : undefined));
  return t;
}

MOB_TEXTURES.witch = witch;

// The goat's skin (M8; vanilla textures/entity/goat/goat.png, 64x64), in its model's box layout (render/goatRenderer.ts):
// creamy white fur, shaggier and paler over the chest's thick coat, greyer underneath; dark grey hooves; a long face
// with amber eyes set in the sides of the head (dark, slotted pupils), a grey-pink muzzle with nostrils and a mouth
// line at its tip; ears pink inside; a beard of pale strands ragged at the end; greyish horns, darker at the root and
// ridged in rings, paler to the tip; and a short tail. Original pixel art in the style of vanilla 1.21.

import { TexImage, img, plot, mixC, mulC } from './tex';
import { Rand } from '../core/rng';
import { MOB_TEXTURES, boxFaces, noiseFace, paintFace, pick, SIDES, type Face } from './mobs';

const FUR = [0xebe7dc, 0xe4dfd2, 0xf0ece2, 0xdfd9cb];
const COAT = [0xf2eee5, 0xebe7dc, 0xf6f3ec, 0xe2ddd0];
const BELLY = [0xd6cfbf, 0xcfc8b7, 0xdbd4c5];
const HOOF = [0x4f4a44, 0x57524b];
const EYE = 0xc79a3c;
const PUPIL = 0x2a2420;
const MUZZLE = [0xa3978b, 0x9b8f84];
const NOSTRIL = 0x4d4540;
const EAR_IN = 0xd9b4a9;

function goat(): TexImage {
  const t = img(64, 64);
  const r = new Rand(0x60a7);
  /** fur on a face, darker the lower down it is (`shade`) and streaked up and down */
  const fur = (f: Face, pal: readonly number[], shade = 0.08) => {
    noiseFace(t, f, r, pal, { cell: 1, white: 0.6 });
    paintFace(t, f, (x, y, c, _w, h) => {
      const k = 1 - shade * (y / Math.max(1, h - 1));
      return mulC(x % 3 === 1 && r.chance(0.35) ? mulC(c, 0.96) : c, k);
    });
  };

  // the body behind (9x11x16 at 1,1): fur, lit on top, grey beneath; a short tail at the top of its back
  const body = boxFaces(1, 1, 9, 11, 16);
  noiseFace(t, body.top, r, FUR, { cell: 1, white: 0.6 });
  noiseFace(t, body.bottom, r, BELLY, { cell: 1, white: 0.5 });
  for (const k of SIDES) fur(body[k], FUR, 0.12);
  const back = body.back;
  for (const [x, y] of [[4, 0], [3, 1], [4, 1], [5, 1], [4, 2]]) plot(t, back[0] + x, back[1] + y, mixC(0xd8d0bf, 0xbfb5a2, y * 0.3));

  // the chest's coat (11x14x11 at 0,28): paler and thicker, its lower edge ragged
  const coat = boxFaces(0, 28, 11, 14, 11);
  noiseFace(t, coat.top, r, COAT, { cell: 1, white: 0.6 });
  noiseFace(t, coat.bottom, r, BELLY, { cell: 1, white: 0.5 });
  for (const k of SIDES) {
    fur(coat[k], COAT, 0.1);
    paintFace(t, coat[k], (x, y, c, _w, h) => (y >= h - 2 && (x + (y === h - 1 ? 1 : 0)) % 2 === 0 ? mixC(c, BELLY[1], 0.6) : undefined));
  }

  // the legs (front 3x10x3 at 35,2 and 49,2; hind 3x6x3 at 36,29 and 49,29): fur down to grey hooves
  for (const [u, v, h] of [[35, 2, 10], [49, 2, 10], [36, 29, 6], [49, 29, 6]]) {
    const leg = boxFaces(u, v, 3, h, 3);
    noiseFace(t, leg.top, r, FUR, { cell: 1 });
    noiseFace(t, leg.bottom, r, HOOF, { cell: 1 });
    for (const k of SIDES) {
      fur(leg[k], FUR, 0.15);
      paintFace(t, leg[k], (_x, y, c, _w, hh) => (y >= hh - 2 ? pick(r, HOOF) : y === hh - 3 ? mixC(c, BELLY[0], 0.5) : undefined));
    }
  }

  // the face (the "nose", 5x7x10 at 34,46): its front (the top face, the forehead at its top row down to the muzzle),
  // the sides with the eyes near the top of the head, the muzzle's tip, the throat, the crown between the horns
  const head = boxFaces(34, 46, 5, 7, 10);
  for (const k of ['top', 'back', ...SIDES] as const) fur(head[k], FUR, 0.05);
  noiseFace(t, head.bottom, r, BELLY, { cell: 1 });
  // (the muzzle greys towards its tip, on the face and the sides)
  paintFace(t, head.top, (_x, y, c, _w, h) => (y >= h - 3 ? mixC(c, MUZZLE[0], (y - (h - 4)) * 0.22) : undefined));
  paintFace(t, head.right, (x, _y, c, w) => (x >= w - 3 ? mixC(c, MUZZLE[1], (x - (w - 4)) * 0.2) : undefined));
  paintFace(t, head.left, (x, _y, c) => (x <= 2 ? mixC(c, MUZZLE[1], (3 - x) * 0.2) : undefined));
  noiseFace(t, head.front, r, MUZZLE, { cell: 1 });
  const fr = head.front;
  for (const x of [1, 3]) plot(t, fr[0] + x, fr[1] + 1, NOSTRIL);
  for (let x = 1; x <= 3; x++) plot(t, fr[0] + x, fr[1] + 4, mulC(MUZZLE[1], 0.7));
  // the eyes: amber, a dark slot across the middle, a darker lid over them
  for (const [f, x] of [[head.right, 2], [head.left, 10 - 3]] as [Face, number][]) {
    plot(t, f[0] + x - 1, f[1] + 2, EYE);
    plot(t, f[0] + x, f[1] + 2, PUPIL);
    plot(t, f[0] + x + 1, f[1] + 2, EYE);
    for (let i = -1; i <= 1; i++) plot(t, f[0] + x + i, f[1] + 1, mulC(FUR[3], 0.86));
  }

  // the ears (3x2x1 at 2,61): pink inside, facing forward
  const ear = boxFaces(2, 61, 3, 2, 1);
  for (const k of ['top', 'bottom', ...SIDES] as const) noiseFace(t, ear[k], r, FUR, { cell: 1 });
  paintFace(t, ear.front, (x, y) => (y === 1 || x === 1 ? EAR_IN : undefined));

  // the beard (a flat 5x7 at 23,52): pale strands, ragged at the end
  const beard = boxFaces(23, 52, 0, 7, 5);
  for (const f of [beard.right, beard.left]) {
    noiseFace(t, f, r, COAT, { cell: 1 });
    paintFace(t, f, (x, y, c, w, h) => {
      if (y === h - 1 && x % 2 === 1) return null;
      if (y >= h - 3 && (x === 0 || x === w - 1)) return null;
      return x % 2 === 0 ? mulC(c, 0.94) : undefined;
    });
  }

  // the horns (2x7x2 at 12,55): darker at the root, ridged every other pixel, pale at the tip
  const horn = boxFaces(12, 55, 2, 7, 2);
  for (const k of SIDES) {
    const f = horn[k];
    for (let y = 0; y < f[3]; y++)
      for (let x = 0; x < f[2]; x++) {
        const along = y / (f[3] - 1);
        let c = mixC(0xc2bcae, 0x8c8577, along);
        if (y % 2 === 1) c = mulC(c, 0.9);
        plot(t, f[0] + x, f[1] + y, x === 0 ? mulC(c, 0.95) : c);
      }
  }
  noiseFace(t, horn.top, r, [0xcac5b8, 0xc2bcae], { cell: 1 });
  noiseFace(t, horn.bottom, r, [0x857e71], { cell: 1 });
  return t;
}

MOB_TEXTURES.goat = goat;

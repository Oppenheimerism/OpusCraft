// The bell (vanilla textures/entity/bell/bell_body.png, 32x32, laid out for BellRenderer's box UVs): the 6x7x6
// body at (0, 0) and the 8x2x8 rim at (0, 13), cast gold with a lit flank, and the dark mouth underneath.

import { TexImage, img, setPx, mixC } from './tex';
import { Rand, hashString } from '../core/rng';

/** cast gold, darkest to brightest */
export const BELL_GOLD = [0x5c3f07, 0x7a5709, 0x9a700f, 0xba8b16, 0xd5a51f, 0xebc22e, 0xf8dc52, 0xfff0a0];

function rect(t: TexImage, x0: number, y0: number, w: number, h: number, pick: (x: number, y: number) => number): void {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPx(t, x0 + x, y0 + y, pick(x, y));
}

/** the flank of a round casting on a square face: lit toward its left third, falling off to the right */
const FLANK6 = [3, 5, 6, 5, 4, 2];
const FLANK8 = [3, 4, 6, 6, 5, 4, 3, 2];

export function bellBodyTexture(): TexImage {
  const t = img(32, 32);
  const r = new Rand(hashString('bell_body'), 7);
  const tone = (k: number) => BELL_GOLD[Math.max(0, Math.min(BELL_GOLD.length - 1, k))];
  const speck = () => (r.chance(0.12) ? (r.chance(0.5) ? 1 : -1) : 0);
  // body (u 0, v 0; 6x7x6): top at (12..18, 0..6), bottom at (6..12, 0..6), sides W N E S on v 6..13
  rect(t, 12, 0, 6, 6, (x, y) => {
    const edge = x === 0 || y === 0 || x === 5 || y === 5;
    const hub = x >= 2 && x <= 3 && y >= 2 && y <= 3;
    return hub ? tone(1) : edge ? tone(3) : tone(5 + (x + y < 4 ? 1 : 0) + speck());
  });
  rect(t, 6, 0, 6, 6, () => tone(2));
  // (BellRenderer draws the model the right way up, without the usual entity flip: the top row of each side is the
  // bottom of the bell, next to the rim)
  for (let s = 0; s < 4; s++)
    rect(t, s * 6, 6, 6, 7, (x, y) => {
      // shoulder at the crown, a raised band two rows up from the rim
      const r = 6 - y;
      let k = FLANK6[x] + speck();
      if (r === 0) k -= 2;
      else if (r === 1) k -= 1;
      if (r === 4) k += 1;
      if (r === 5) k -= 1;
      return tone(k);
    });
  // rim (u 0, v 13; 8x2x8): its top at (16..24, 13..21), the mouth underneath at (8..16, 13..21), sides on v 21..23
  rect(t, 16, 13, 8, 8, (x, y) => {
    const d = Math.max(Math.abs(x - 3.5), Math.abs(y - 3.5));
    return d > 3 ? tone(6) : d > 2 ? tone(4) : tone(3);
  });
  rect(t, 8, 13, 8, 8, (x, y) => {
    const d = Math.max(Math.abs(x - 3.5), Math.abs(y - 3.5));
    if (d > 3) return tone(4);
    if (d > 2) return mixC(tone(1), 0x000000, 0.25);
    // the hollow, and the clapper hanging in it
    if (d < 1) return tone(2);
    return mixC(tone(0), 0x000000, 0.45);
  });
  for (let s = 0; s < 4; s++)
    rect(t, s * 8, 21, 8, 2, (x, y) => tone(FLANK8[x] + (y === 1 ? 1 : -1) + speck()));
  return t;
}

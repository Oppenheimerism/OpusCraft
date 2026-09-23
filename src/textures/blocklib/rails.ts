// Rails (vanilla block/rail and block/rail_corner): two iron rails on wooden
// sleepers, on a transparent background. The corner curves from the south
// edge round to the east edge (the unrotated south_east shape).

import { TexImage, img, setPx } from '../tex';
import { N } from './core';

const IRON = [0x4a4a4a, 0x6e6e6e, 0x999999, 0xbdbdbd];
const WOOD = [0x3d2c17, 0x55401f, 0x6d5330, 0x846641];

/** sleeper pixel: darker underside row, ragged ends */
function sleeper(t: TexImage, x: number, y: number, lower: boolean, end: boolean): void {
  setPx(t, x, y, end ? WOOD[1] : lower ? WOOD[1] : (x * 7 + y * 3) % 5 === 0 ? WOOD[3] : WOOD[2]);
}

export function rail(): TexImage {
  const t = img();
  for (const y0 of [1, 5, 9, 13])
    for (let x = 1; x < N - 1; x++) {
      const end = x === 1 || x === N - 2;
      sleeper(t, x, y0, false, end);
      sleeper(t, x, y0 + 1, true, end);
    }
  for (let y = 0; y < N; y++) {
    // rails with a bright running surface on the inner edge
    setPx(t, 2, y, IRON[1]);
    setPx(t, 3, y, IRON[3]);
    setPx(t, 12, y, IRON[3]);
    setPx(t, 13, y, IRON[1]);
    if (y % 4 === 2) {
      setPx(t, 2, y, IRON[0]);
      setPx(t, 13, y, IRON[0]);
    }
  }
  return t;
}

export function railCorner(): TexImage {
  const t = img();
  const r = (x: number, y: number) => Math.hypot(N - (x + 0.5), N - (y + 0.5));
  const ang = (x: number, y: number) => Math.atan2(N - (y + 0.5), N - (x + 0.5)); // 0 = along the east edge, pi/2 = along the south edge
  // sleepers across the curve, spread evenly round the quarter turn
  const sleepers = [0.14, 0.52, 0.9, 1.28];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = r(x, y);
      if (d < 2 || d > 15.2) continue;
      const a = ang(x, y);
      for (const s of sleepers) {
        const off = (a - s) * d;
        if (off >= -1 && off < 1) sleeper(t, x, y, off >= 0, d < 2.8 || d > 14.2);
      }
    }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = r(x, y);
      // outer rail (radius 12.5-14.5) and inner rail (2.5-4.5), bright on the side facing the track
      if (d >= 12 && d < 13) setPx(t, x, y, IRON[3]);
      else if (d >= 13 && d < 14) setPx(t, x, y, IRON[1]);
      else if (d >= 3 && d < 4) setPx(t, x, y, IRON[3]);
      else if (d >= 2 && d < 3) setPx(t, x, y, IRON[1]);
    }
  return t;
}

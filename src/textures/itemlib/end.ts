// Items of the End: the end crystal (a magenta crystal cube inside its pale
// glass cage, seen corner-on). The eye of ender is in extras.ts.

import { TexImage, img, plot } from '../tex';
import type { Gen } from './common';

export const END_ITEMS: Record<string, Gen> = {};

/** which part of a pointy-topped isometric cube of radius s the offset (dx,dy) falls on: 0 outside, 1 top, 2 left, 3 right */
function cubeFace(dx: number, dy: number, s: number): number {
  const w = s * Math.cos(Math.PI / 6);
  const ax = Math.abs(dx);
  if (ax > w || Math.abs(dy) > s - (ax / w) * (s / 2)) return 0;
  if (dy < (-ax * s) / (2 * w)) return 1;
  return dx < 0 ? 2 : 3;
}

END_ITEMS['end_crystal'] = (): TexImage => {
  const t = img(16, 16);
  const glassLit = 0xf4eefa, glass = 0xd8cce4, glassDark = 0xa898b8;
  const top = 0xf2a6e6, left = 0xc65cbc, right = 0x8e2c86, edge = 0x5c1458;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - 8, dy = y + 0.5 - 8;
      const inner = cubeFace(dx, dy, 4.3);
      if (inner) {
        // the crystal: a darker rim where its faces meet the gap
        const rim = !cubeFace(dx, dy, 3.3);
        plot(t, x, y, rim && inner !== 1 ? edge : inner === 1 ? top : inner === 2 ? left : right);
        continue;
      }
      if (cubeFace(dx, dy, 7.6) && !cubeFace(dx, dy, 6.5)) plot(t, x, y, dy < 0 && dx <= 0 ? glassLit : dy > 0 && dx > 0 ? glassDark : glass);
    }
  // the glint on the crystal's top
  plot(t, 7, 5, 0xffe4fa);
  return t;
};

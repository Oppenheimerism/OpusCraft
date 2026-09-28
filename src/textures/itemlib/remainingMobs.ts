// (remaining mobs) Item sprites for what comes with the mobs added on the remaining-mobs branch. The panda's: bamboo
// (vanilla item/bamboo), a length of stalk lying corner to corner, its joints pale rings, a leaf off its top and another
// off its side. Original pixel art.

import { TexImage, img, setPx, outline } from '../tex';
import type { Gen } from './common';
import { BAMBOO_GREENS as G, leafInto } from '../blocklib/bamboo';

export const REMAINING_MOB_ITEMS: Record<string, Gen> = {};

/** vanilla item/bamboo */
function bambooItem(): TexImage {
  const t = img();
  // (two pixels thick, stepping up and right from the bottom left corner: its shaded underside, its lit top)
  for (let k = 0; k <= 9; k++) {
    const x = 2 + k, y = 13 - k, joint = k === 3 || k === 7;
    setPx(t, x, y, joint ? 0xb9d468 : G[4]);
    setPx(t, x + 1, y, joint ? G[3] : G[2]);
    if (k < 9) setPx(t, x + 1, y + 1, k === 2 || k === 6 ? G[0] : G[1]);
  }
  leafInto(t, 12, 4, 13.5, 2.5, 15, 0.5, 2.4);
  leafInto(t, 10, 6, 8.5, 4.5, 7, 2.5, 2.2);
  outline(t, 0x16300a);
  return t;
}

REMAINING_MOB_ITEMS['bamboo'] = bambooItem;

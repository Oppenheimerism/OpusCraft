// (remaining mobs) Item sprites for what comes with the mobs added on the remaining-mobs branch. The panda's: bamboo
// (vanilla item/bamboo), a length of stalk lying corner to corner, its joints pale rings, a leaf off its top and another
// off its side. The armadillo's: its scute (item/armadillo_scute), a dusty rose plate, rounded at the top and narrowing
// below, lit from the upper left, two dark grooves down it; and wolf armour (item/wolf_armor), a coat of scute plates
// seen from the side, banded, rimmed pale, a guard hanging over each leg, with its dye layer (item/wolf_armor_dyed:
// the plates alone, in greys). Original pixel art.

import { TexImage, img, setPx, outline, plot } from '../tex';
import { spr, type Gen } from './common';
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

/** vanilla item/armadillo_scute */
function armadilloScute(): TexImage {
  const t = img();
  const SHADES = [0x7e4a47, 0x8e5652, 0xa0635e, 0xb2746d, 0xc4877f, 0xd49b92];
  for (let y = 2; y <= 13; y++)
    for (let x = 1; x <= 14; x++) {
      // (an egg: round above, narrowing below)
      const rx = y < 7 ? 6.6 : 6.6 - (y - 7) * 0.62, ry = 5.9;
      const u = (x + 0.5 - 8) / rx, v = (y + 0.5 - 7.6) / ry;
      if (u * u + v * v >= 1) continue;
      // (the grooves bend in towards the tip)
      const g1 = y > 9 ? 6 : 5, g2 = y > 9 ? 9 : 10;
      let k = 3 - Math.round(v * 1.6) - (x > 8 ? 1 : 0) + (x < 5 ? 1 : 0);
      if (x === g1 || x === g2) k = 0;
      else if (x === g1 + 1 || x === g2 + 1) k += 1;
      plot(t, x, y, SHADES[Math.max(0, Math.min(5, k))]);
    }
  outline(t, 0x3e2322);
  return t;
}

// prettier-ignore
const WOLF_ARMOR = [
  '................',
  '................',
  '................',
  '....########....',
  '..##RRRRRRRR##..',
  '.#RLPGLPGLPGLR#.',
  '.#LPpGPpGPpGPp#.',
  '.#PpPGpPGpPGpP#.',
  '.#pPpGPpGPpGPp#.',
  '.#RRRRRRRRRRRR#.',
  '.#PP#......#PP#.',
  '.#Pp#......#Pp#.',
  '.#RR#......#RR#.',
  '..##........##..',
  '................',
  '................',
];

/** vanilla item/wolf_armor: the scutes in their own colours */
const wolfArmor = () =>
  spr(WOLF_ARMOR, { '#': 0x3a2220, R: 0xd29e95, L: 0xbe837b, P: 0xa66b65, p: 0x8a5450, G: 0x6c3b3a }, 'wolf_armor');

/** vanilla item/wolf_armor_dyed: the plates in greys, for the dye (undyed, it isn't drawn) */
const wolfArmorDyed = () =>
  spr(WOLF_ARMOR, { '#': null, R: null, G: null, L: 0xf6f6f6, P: 0xd0d0d0, p: 0xa8a8a8 }, 'wolf_armor_dyed');

REMAINING_MOB_ITEMS['armadillo_scute'] = armadilloScute;
REMAINING_MOB_ITEMS['wolf_armor'] = wolfArmor;
REMAINING_MOB_ITEMS['wolf_armor_dyed'] = wolfArmorDyed;

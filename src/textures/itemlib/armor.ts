// Armor items: helmet, chestplate, leggings, boots for each material.

import { TexImage, img, plot, getA, getPx } from '../tex';
import { Gen, autoShade, paint } from './common';

export const ARMOR_ITEMS: Record<string, Gen> = {};

interface ArmorMat { o: number; s: number[] }
/**
 * leather is drawn in greys that the dye multiplies (vanilla DyedItemColor; undyed 0xa06540 brings back the browns
 * of ARMOR_MATS.leather, the brightest grey being the dye itself)
 */
export const LEATHER_ICON: ArmorMat = { o: 0x5c5c5c, s: [0x787878, 0x949494, 0xaeaeae, 0xc8c8c8, 0xe2e2e2, 0xfafafa] };
export const ARMOR_MATS: Record<string, ArmorMat> = {
  leather: { o: 0x3a2414, s: [0x5a3620, 0x74462a, 0x8c5836, 0xa06540, 0xb67c56, 0xc99470] },
  chainmail: { o: 0x262626, s: [0x3e3e3e, 0x5a5a5a, 0x787878, 0x969696, 0xb4b4b4, 0xd0d0d0] },
  iron: { o: 0x363636, s: [0x686868, 0x8a8a8a, 0xacacac, 0xc8c8c8, 0xe2e2e2, 0xffffff] },
  golden: { o: 0x5c3a06, s: [0x9c640a, 0xc28a12, 0xe0b022, 0xf6d238, 0xfdea5c, 0xfffbb0] },
  diamond: { o: 0x0c3a32, s: [0x14705f, 0x1c937f, 0x2cbba2, 0x44dcc6, 0x78f2e0, 0xc8fdf4] },
  netherite: { o: 0x131011, s: [0x2a2325, 0x362f31, 0x443c3e, 0x544b4d, 0x6a6163, 0x877d7f] },
};

// prettier-ignore
const HELMET = [
  '................',
  '................',
  '................',
  '....XXXXXXXX....',
  '...XXXXXXXXXX...',
  '...XXXXXXXXXX...',
  '...XXXXXXXXXX...',
  '...XXX....XXX...',
  '...XX......XX...',
  '...XX......XX...',
  '...XX......XX...',
  '................',
  '................',
  '................',
  '................',
  '................',
];
// prettier-ignore
const CHESTPLATE = [
  '................',
  '................',
  '.XXXX......XXXX.',
  '.XXXXX....XXXXX.',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '.XX.XXXXXXXX.XX.',
  '....XXXXXXXX....',
  '....XXXXXXXX....',
  '....XXXXXXXX....',
  '....XXXXXXXX....',
  '....XXXXXXXX....',
  '....XXXXXXXX....',
  '................',
  '................',
];
// prettier-ignore
const LEGGINGS = [
  '................',
  '................',
  '...XXXXXXXXXX...',
  '...XXXXXXXXXX...',
  '...XXXXXXXXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '...XXXX..XXXX...',
  '................',
  '................',
];
// prettier-ignore
const BOOTS = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '..XXXX....XXXX..',
  '..XXXX....XXXX..',
  '..XXXX....XXXX..',
  '..XXXX....XXXX..',
  '.XXXXX....XXXXX.',
  '.XXXXX....XXXXX.',
  '.XXXXX....XXXXX.',
  '................',
  '................',
  '................',
];

const SHAPES: Record<string, string[]> = { helmet: HELMET, chestplate: CHESTPLATE, leggings: LEGGINGS, boots: BOOTS };

function armor(piece: string, mat: string): TexImage {
  const m = mat === 'leather' ? LEATHER_ICON : ARMOR_MATS[mat];
  const t = autoShade(SHAPES[piece], m.s, m.o, { seed: `${mat}_${piece}`, edge: 1.25, relief: 2, bias: 0.04 });
  const shade = (x: number, y: number, k: number) => {
    if (getA(t, x, y) && getPx(t, x, y) !== m.o) plot(t, x, y, m.s[k]);
  };
  if (piece === 'helmet') {
    for (let x = 4; x <= 11; x++) shade(x, 6, 1); // brow band over the face opening
    shade(5, 3, 5);
    shade(6, 3, 5);
    shade(4, 4, 5);
  } else if (piece === 'chestplate') {
    for (let y = 8; y <= 12; y++) shade(7, y, 2), shade(8, y, 1); // centre seam
    for (let x = 4; x <= 11; x++) shade(x, 13, 1); // hem
    shade(2, 3, 5);
    shade(3, 3, 5);
    shade(2, 4, 5);
  } else if (piece === 'leggings') {
    for (let x = 3; x <= 12; x++) shade(x, 4, 1); // belt
    shade(4, 2, 5);
    shade(5, 2, 5);
    shade(4, 7, 4);
    shade(10, 7, 4);
  } else if (piece === 'boots') {
    for (const x of [2, 3, 4, 5, 10, 11, 12, 13]) shade(x, 6, 4); // cuff
    shade(2, 7, 5);
    shade(10, 7, 5);
  }
  if (mat === 'chainmail') {
    // chain links: see-through dark dots in a checker pattern
    paint(t, (x, y, c) => (c !== m.o && (x + y) % 2 === 0 && x % 2 === 0 && y > 2 ? m.s[0] : undefined));
  }
  return t;
}

/**
 * vanilla leather_<piece>_overlay (the item model's untinted layer1): what keeps its own colour however the leather
 * is dyed; the tunic's lacing, the leggings' drawstring, the boots' soles (the cap has none)
 */
function leatherOverlay(piece: string): TexImage {
  const t = img(16, 16);
  const [lace, knot, sole] = [ARMOR_MATS.leather.s[1], ARMOR_MATS.leather.s[3], ARMOR_MATS.leather.o];
  if (piece === 'chestplate') {
    plot(t, 7, 4, lace);
    plot(t, 8, 4, lace);
    plot(t, 7, 5, knot);
    plot(t, 8, 6, lace);
  } else if (piece === 'leggings') {
    plot(t, 7, 3, knot);
    plot(t, 8, 3, knot);
    plot(t, 7, 4, lace);
  } else if (piece === 'boots') {
    for (const x of [1, 2, 3, 4, 5, 10, 11, 12, 13, 14]) plot(t, x, 12, sole);
  }
  return t;
}

for (const mat of Object.keys(ARMOR_MATS))
  for (const piece of Object.keys(SHAPES)) ARMOR_ITEMS[`${mat}_${piece}`] = () => armor(piece, mat);
for (const piece of Object.keys(SHAPES)) ARMOR_ITEMS[`leather_${piece}_overlay`] = () => leatherOverlay(piece);

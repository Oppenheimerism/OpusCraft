// Ingots, nuggets, gems, raw ores and other crafting materials.

import { Gen, Pal, Ramp, spr, rampPal, autoShade, rng } from './common';
import { TexImage, plot, getA, getPx, mixC } from '../tex';

export const INGOT_MATS: Record<string, Ramp> = {
  iron: { o: 0x3a3a3a, s: [0x5f5f5f, 0x8c8c8c, 0xbdbdbd, 0xdedede, 0xffffff] },
  gold: { o: 0x5c3a06, s: [0x9c6208, 0xd09514, 0xf1c62e, 0xfcee4b, 0xfffcb4] },
  copper: { o: 0x4a2418, s: [0x7a3825, 0x9c4a2e, 0xc15a36, 0xe77c56, 0xfcb49a] },
  netherite: { o: 0x151112, s: [0x2a2325, 0x3a3234, 0x4b4244, 0x625a5c, 0x857a7c] },
};

// prettier-ignore
const INGOT = [
  '................',
  '................',
  '................',
  '...........###..',
  '.........##554#.',
  '.......##55444#.',
  '.....##5544443#.',
  '...##554444322#.',
  '.##55444433211#.',
  '#3444443322111#.',
  '#33443322111##..',
  '#3332221111#....',
  '.#222111###.....',
  '..#1111#........',
  '...####.........',
  '................',
];

export const MATERIAL_ITEMS: Record<string, Gen> = {};
for (const [m, r] of Object.entries(INGOT_MATS)) {
  const pal: Pal = rampPal(r);
  MATERIAL_ITEMS[`${m}_ingot`] = () => spr(INGOT, pal, `${m}_ingot`);
}

// ---------------------------------------------------------------------------
// Nuggets

// prettier-ignore
const NUGGET = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '........###.....',
  '.......#554#....',
  '......#54432#...',
  '.....##43321#...',
  '....#54#3211#...',
  '...#5443#11#....',
  '...#4332####....',
  '...#3221#.......',
  '....####........',
  '................',
  '................',
];

MATERIAL_ITEMS['iron_nugget'] = () => spr(NUGGET, rampPal({ o: 0x3a3a3a, s: [0x6a6a6a, 0x8f8f8f, 0xb9b9b9, 0xdcdcdc, 0xffffff] }), 'iron_nugget');
MATERIAL_ITEMS['gold_nugget'] = () => spr(NUGGET, rampPal({ o: 0x6b3d05, s: [0xb0700c, 0xdca11a, 0xf5d136, 0xfcee4b, 0xfffcb4] }), 'gold_nugget');

// ---------------------------------------------------------------------------
// Gems

// prettier-ignore
const GEM = [
  '................',
  '................',
  '....########....',
  '...#66555544#...',
  '..#6655555443#..',
  '.#665555554443#.',
  '.#444333333222#.',
  '..#4433333222#..',
  '...#43333222#...',
  '....#433322#....',
  '.....#4332#.....',
  '......#32#......',
  '.......##.......',
  '................',
  '................',
  '................',
];

MATERIAL_ITEMS['diamond'] = () => {
  const t = spr(GEM, rampPal({ o: 0x0c3a32, s: [0x12685c, 0x1b8c7c, 0x2bc7ac, 0x4aedd9, 0xa1fbe8], hi: 0xe6fffa }), 'diamond');
  return t;
};

// prettier-ignore
const EMERALD = [
  '................',
  '......####......',
  '.....#6655#.....',
  '....#665554#....',
  '...#66444443#...',
  '...#65444433#...',
  '...#65444432#...',
  '...#55444332#...',
  '...#54443332#...',
  '...#54433322#...',
  '...#44333222#...',
  '...#43322221#...',
  '....#322211#....',
  '.....#2211#.....',
  '......####......',
  '................',
];

MATERIAL_ITEMS['emerald'] = () =>
  spr(EMERALD, rampPal({ o: 0x003d18, s: [0x00742b, 0x009c3d, 0x17c95b, 0x41f384, 0xa2fcc4], hi: 0xe2fff0 }), 'emerald');

// ---------------------------------------------------------------------------
// Lumps: coal, charcoal, raw ores, lapis

// prettier-ignore
const COAL_MASK = [
  '................',
  '................',
  '.....XXX........',
  '....XXXXX.XX....',
  '...XXXXXcXXXX...',
  '..XXXXXcXXXXX...',
  '..XXXXcXXXXXXX..',
  '.XXXXcXXXXXXXX..',
  '.XXXXXccccXXXX..',
  '..XXXXXXXXcXXXX.',
  '..XXXXXXXXXcXX..',
  '...XXXXXXXXXcX..',
  '...XXXXXXXXXX...',
  '....XX.XXXXX....',
  '.........XX.....',
  '................',
];

// prettier-ignore
const RAW_MASK = [
  '................',
  '................',
  '....XXXX........',
  '...XXXXXX.XXX...',
  '..XXXXXXXcXXXX..',
  '..XXXXXXcXXXXX..',
  '..XXXXXXcXXXXXX.',
  '.XXXXXXcXXXXXXX.',
  '.XXXXcccccXXXXX.',
  '.XXXcXXXXXcXXXX.',
  '..XcXXXXXXXcXX..',
  '...XXXXXXXXXXX..',
  '....XXXXXXXXX...',
  '.....XXX..XX....',
  '................',
  '................',
];

// prettier-ignore
const LAPIS_MASK = [
  '................',
  '................',
  '.......XXXX.....',
  '.....XXXXXXXX...',
  '....XXXXcXXXXX..',
  '...XXXXcXXXXXX..',
  '..XXXXcXXXXXXX..',
  '..XXXcXXXXXXXXX.',
  '.XXXXXcccXXXXXX.',
  '.XXXXXXXXcXXXX..',
  '..XXXXXXXXcXX...',
  '..XXXXXXXXXX....',
  '...XXXXXXXX.....',
  '.....XXXX.......',
  '................',
  '................',
];

function lump(mask: string[], ramp: number[], o: number, seed: string, noise = 0.35, speck?: { c: number[]; n: number }): TexImage {
  const t = autoShade(mask, ramp, o, { noise: noise * 0.3, cluster: noise * 0.8, cell: 4, seed, edge: 1.3, relief: 2, low: 'c', extra: { c: ramp[0] } });
  if (speck) {
    const r = rng(seed, 11);
    let placed = 0, guard = 0;
    while (placed < speck.n && guard++ < 400) {
      const x = 2 + r.nextInt(12), y = 2 + r.nextInt(12);
      if (!getA(t, x, y) || getPx(t, x, y) === o) continue;
      // keep specks off the outline ring
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => getPx(t, x + dx, y + dy) === o || !getA(t, x + dx, y + dy))) continue;
      plot(t, x, y, speck.c[r.nextInt(speck.c.length)]);
      placed++;
    }
  }
  return t;
}

MATERIAL_ITEMS['coal'] = () => lump(COAL_MASK, [0x161616, 0x222222, 0x2f2f2f, 0x3e3e3e, 0x515151, 0x6e6e6e], 0x0b0b0b, 'coal', 0.3);
MATERIAL_ITEMS['charcoal'] = () => lump(COAL_MASK, [0x1c1612, 0x2b221b, 0x3a2e25, 0x4b3d31, 0x604e3f, 0x7c6754], 0x100c09, 'charcoal', 0.3);
MATERIAL_ITEMS['raw_iron'] = () =>
  lump(RAW_MASK, [0x6a4d3d, 0x87654f, 0xa88068, 0xc49c80, 0xd8b69b, 0xeed6c1], 0x3f2d23, 'raw_iron', 0.35, { c: [0x6a4d3d, 0x87654f], n: 7 });
MATERIAL_ITEMS['raw_gold'] = () =>
  lump(RAW_MASK, [0x9a620c, 0xc1850f, 0xdea91c, 0xf3cb34, 0xfbe35a, 0xfff6a6], 0x5c3906, 'raw_gold', 0.35, { c: [0xa86c0d, 0xc1850f], n: 7 });
MATERIAL_ITEMS['raw_copper'] = () =>
  lump(RAW_MASK, [0x70331f, 0x93452c, 0xb45b3a, 0xd3774d, 0xe99870, 0xf8c2a2], 0x46200f, 'raw_copper', 0.35, { c: [0x7d3a24, 0x93452c], n: 7 });
MATERIAL_ITEMS['lapis_lazuli'] = () =>
  lump(LAPIS_MASK, [0x102c75, 0x183d99, 0x2350bd, 0x2e64d8, 0x4a84ec], 0x0a1b4c, 'lapis', 0.45, { c: [0x7aa7f7, 0x9dc0fb, 0x0d2566], n: 8 });

// ---------------------------------------------------------------------------
// Redstone dust and nether quartz

// prettier-ignore
const REDSTONE = [
  '................',
  '................',
  '................',
  '........#.......',
  '.......#5#..#...',
  '....#.#554##3#..',
  '...#4#54443##...',
  '....#5444332#...',
  '..##54433332#.#.',
  '.#5443333222##3#',
  '.#43332222211#..',
  '..#322221111#...',
  '.#3#211111##.#..',
  '..#.######..#2#.',
  '.............#..',
  '................',
];

MATERIAL_ITEMS['redstone'] = () =>
  spr(REDSTONE, rampPal({ o: 0x3f0000, s: [0x7a0000, 0xa10000, 0xca0000, 0xf01010, 0xff5a4a] }), 'redstone');

// prettier-ignore
const QUARTZ = [
  '................',
  '.........###....',
  '.......##666##..',
  '......#6666666#.',
  '......#4466622#.',
  '...####4442222#.',
  '..#55554442222#.',
  '.#555555542222#.',
  '.#445553342222#.',
  '.#444433342222#.',
  '.#4444333422##..',
  '.#4444333#2#....',
  '.#4444333##.....',
  '..##443##.......',
  '....###.........',
  '................',
];

MATERIAL_ITEMS['quartz'] = () =>
  spr(QUARTZ, rampPal({ o: 0x76675a, s: [0xb09f8d, 0xc9bbab, 0xdcd2c5, 0xebe5dc, 0xf7f4ee], hi: 0xffffff }), 'quartz');


// ---------------------------------------------------------------------------
// Brick (clay brick in the same three-quarter bar pose as the ingots)

MATERIAL_ITEMS['brick'] = () => {
  const o = 0x3a1a10;
  const t = spr(INGOT, rampPal({ o, s: [0x6a2c1c, 0x8a3a26, 0xa84a30, 0xc2603e, 0xd67c56] }), 'brick');
  const r = rng('brick');
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!getA(t, x, y) || getPx(t, x, y) === o) continue;
      if (r.chance(0.16)) plot(t, x, y, mixC(getPx(t, x, y), 0x3a1a10, 0.25));
      else if (r.chance(0.06)) plot(t, x, y, mixC(getPx(t, x, y), 0xf0b090, 0.3));
    }
  return t;
};

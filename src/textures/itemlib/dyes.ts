// Dye items (one consistent powder-clump sprite per colour), ink sac, cocoa beans.

import { TexImage, mixC } from '../tex';
import { DYE } from '../dyes';
import { Gen, spr } from './common';

export const DYE_ITEMS: Record<string, Gen> = {};

// prettier-ignore
const DYE_PILE = [
  '................',
  '................',
  '................',
  '................',
  '......###.......',
  '.....#554#......',
  '....#54443#..#..',
  '...#5444433#.#6.',
  '..#544443332#.#.',
  '..#444433322#...',
  '.#44443333221#..',
  '.#43333322211#..',
  '..#332222211#.#.',
  '...##111111#.#6#',
  '.....######...#.',
  '................',
];

function lumC(c: number): number {
  return ((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114;
}

function dyeSprite(base: number): TexImage {
  const L = lumC(base);
  const dark = 0x000000, light = 0xffffff;
  let s: number[];
  if (L > 225) s = [mixC(base, 0x8a9098, 0.55), mixC(base, 0x9aa0a8, 0.35), mixC(base, 0xb8bec4, 0.18), base, 0xffffff];
  else if (L < 60) s = [mixC(base, dark, 0.35), base, mixC(base, light, 0.08), mixC(base, light, 0.16), mixC(base, light, 0.3)];
  else s = [mixC(base, dark, 0.45), mixC(base, dark, 0.26), mixC(base, dark, 0.08), mixC(base, light, 0.18), mixC(base, light, 0.45)];
  const o = L > 225 ? 0x6e747c : L < 60 ? 0x050506 : mixC(base, dark, 0.72);
  return spr(DYE_PILE, { '#': o, 1: s[0], 2: s[1], 3: s[2], 4: s[3], 5: s[4], 6: s[3] }, 'dye');
}

for (const [name, d] of Object.entries(DYE)) DYE_ITEMS[`${name}_dye`] = () => dyeSprite(d.dye);

// prettier-ignore
const INK_SAC = [
  '................',
  '................',
  '.......###......',
  '......#545#.....',
  '.......#4#......',
  '.....##434##....',
  '....#5443332#...',
  '...#544433322#..',
  '...#544333222#..',
  '..#5443332221 1#',
  '..#443333221 1#.',
  '..#433322211 1#.',
  '...#3222111 1#..',
  '....##111111#...',
  '......######....',
  '................',
];
DYE_ITEMS['ink_sac'] = () =>
  spr(INK_SAC.map((r) => r.replace(/ /g, '').padEnd(16, '.').slice(0, 16)), {
    '#': 0x060608, 1: 0x14141a, 2: 0x1f1f28, 3: 0x2c2c38, 4: 0x3e3e4e, 5: 0x60607a,
  }, 'ink_sac');

// prettier-ignore
const COCOA = [
  '................',
  '................',
  '................',
  '........###.....',
  '.......#544#....',
  '......#54l43#...',
  '......#4l432#...',
  '..###.#l4321#...',
  '.#544##4321#....',
  '#54l432#11#.....',
  '#4l4321###......',
  '#l43321#........',
  '.#43211#........',
  '..#211#.........',
  '...###..........',
  '................',
];
DYE_ITEMS['cocoa_beans'] = () =>
  spr(COCOA, { '#': 0x241408, 1: 0x3e2410, 2: 0x5a3418, 3: 0x74461f, 4: 0x8e5a2a, 5: 0xa87040, l: 0xc0894e }, 'cocoa_beans');

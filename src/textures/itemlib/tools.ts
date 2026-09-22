// Tools and swords: shared silhouettes per tool type, recolored per material.
// Template chars: '#' head outline, '1'..'5' head shades (dark->light),
// 'o' handle outline, 'a' handle light, 'b' handle dark.

import { TexImage, getA, getPx, plot } from '../tex';
import { Gen, Pal, Ramp, spr, rampPal, rng } from './common';

export const HANDLE: Pal = { o: 0x28190a, a: 0x896727, b: 0x684e1e, c: 0x4a3614 };

export const TOOL_MATS: Record<string, Ramp> = {
  wooden: { o: 0x28190a, s: [0x5a4424, 0x6f5431, 0x8b6c3f, 0xa7844e, 0xbe9a60] },
  stone: { o: 0x2a2a2a, s: [0x484848, 0x5c5c5c, 0x747474, 0x8e8e8e, 0xa6a6a6] },
  iron: { o: 0x363636, s: [0x5f5f5f, 0x858585, 0xb3b3b3, 0xd8d8d8, 0xffffff] },
  golden: { o: 0x5c3a06, s: [0x9c6208, 0xc88f12, 0xe8bf2a, 0xfcee4b, 0xfffcb4] },
  diamond: { o: 0x0e3d35, s: [0x12685c, 0x1b8c7c, 0x2bc7ac, 0x4aedd9, 0xd1faf3] },
  netherite: { o: 0x161213, s: [0x2c2527, 0x3b3335, 0x4b4244, 0x625a5c, 0x817778] },
};

// prettier-ignore
const SWORD = [
  '.............##.',
  '............#55#',
  '...........#543#',
  '..........#542#.',
  '.........#442#..',
  '........#442#...',
  '.......#442#....',
  '...#..#432#.....',
  '..#4##432#......',
  '..#43432#.......',
  '...#322#........',
  '...oa21#........',
  '..oab#11#.......',
  '.oabo.##........',
  'oabo............',
  '.oo.............',
];

// prettier-ignore
const PICKAXE = [
  '................',
  '.....#######....',
  '...##5444444#...',
  '..#5433333324#..',
  '.#421######a33#.',
  '.#2##....oab32#.',
  '..#.....oab#32#.',
  '.......oabo#32#.',
  '......oabo.#32#.',
  '.....oabo..#32#.',
  '....oabo...#32#.',
  '...oabo...#32#..',
  '..oabo....#21#..',
  '.oabo....#21#...',
  'oabo......##....',
  '.oo.............',
];

// prettier-ignore
const AXE = [
  '....#####.......',
  '...#55444##.....',
  '..#54433332#oo..',
  '..#543333222abo.',
  '..#54333222abo..',
  '..#533221#abo...',
  '..#4321##abo....',
  '...#21#oabo.....',
  '....##oabo......',
  '.....oabo.......',
  '....oabo........',
  '...oabo.........',
  '..oabo..........',
  '.oabo...........',
  'oabo............',
  '.oo.............',
];

// prettier-ignore
const SHOVEL = [
  '................',
  '................',
  '..........##....',
  '........##54#...',
  '.......#54443#..',
  '......#544332#..',
  '.....#444332#...',
  '......#33321#...',
  '......oa221#....',
  '.....oab#1#.....',
  '....oabo.#......',
  '...oabo.........',
  '..oabo..........',
  '.oabo...........',
  'oabo............',
  '.oo.............',
];

// prettier-ignore
const HOE = [
  '................',
  '.....#######....',
  '....#5444444#o..',
  '....#4333332abo.',
  '....#32####abo..',
  '.....##..oabo...',
  '........oabo....',
  '.......oabo.....',
  '......oabo......',
  '.....oabo.......',
  '....oabo........',
  '...oabo.........',
  '..oabo..........',
  '.oabo...........',
  'oabo............',
  '.oo.............',
];

const TEMPLATES: Record<string, string[]> = { sword: SWORD, pickaxe: PICKAXE, axe: AXE, shovel: SHOVEL, hoe: HOE };

function toolSprite(kind: string, mat: string): TexImage {
  const r = TOOL_MATS[mat];
  const pal: Pal = { ...HANDLE, ...rampPal(r) };
  const t = spr(TEMPLATES[kind], pal, `${mat}_${kind}`);
  if (mat === 'stone') speckle(t, r, `${mat}_${kind}`);
  return t;
}

/** Cobblestone-like speckle on head pixels (stone tools). */
function speckle(t: TexImage, r: Ramp, name: string): void {
  const rand = rng(name, 7);
  const idx = new Map<number, number>();
  r.s.forEach((c, i) => idx.set(c, i));
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!getA(t, x, y)) continue;
      const i = idx.get(getPx(t, x, y));
      if (i === undefined) continue;
      const v = rand.next();
      if (v < 0.22 && i > 0) plot(t, x, y, r.s[i - 1]);
      else if (v > 0.86 && i < 4) plot(t, x, y, r.s[i + 1]);
    }
}

export const TOOL_ITEMS: Record<string, Gen> = {};
for (const mat of Object.keys(TOOL_MATS))
  for (const kind of Object.keys(TEMPLATES)) TOOL_ITEMS[`${mat}_${kind}`] = () => toolSprite(kind, mat);

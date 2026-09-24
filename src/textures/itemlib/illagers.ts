// Stage 4's item sprites: the raiders' spawn eggs (vanilla 1.21 egg colours) and the ominous bottle — a squat flask
// of dark, smoky glass with a pale green brew inside, stoppered, the ominous banner's grey-and-black charge on its
// face. Original pixel art in the style of vanilla 1.21.

import { Gen, spr } from './common';
import { spawnEgg } from '../mobs';

export const ILLAGER_ITEMS: Record<string, Gen> = {};
const I = ILLAGER_ITEMS;

// vanilla SpawnEggItem colours: [background, highlight]
const EGGS: [string, number, number][] = [
  ['evoker', 0x959b9b, 0x1e1c1a],
  ['pillager', 0x532f36, 0x959b9b],
  ['ravager', 0x757470, 0x5b5049],
  ['vex', 0x7a90a4, 0xe8edf1],
  ['vindicator', 0x959b9b, 0x275e61],
];
for (const [m, base, spot] of EGGS) I[`${m}_spawn_egg`] = () => spawnEgg(base, spot);

// prettier-ignore
const OMINOUS_BOTTLE = [
  '................',
  '......####......',
  '......#cC#......',
  '......#cc#......',
  '.....##ww##.....',
  '.....#gwwg#.....',
  '....#gGllGg#....',
  '...#gGlLLlGg#...',
  '...#GlbBBblG#...',
  '...#GlBkkBlG#...',
  '...#GlbBBblG#...',
  '...#gGlkklGg#...',
  '...#ggGllGgg#...',
  '....#gggggg#....',
  '.....######.....',
  '................',
];
I['ominous_bottle'] = () =>
  spr(OMINOUS_BOTTLE, {
    '#': 0x14161a,
    c: 0x7a5a38,
    C: 0x9c7a50,
    w: 0x3a4148,
    g: 0x262c33,
    G: 0x3a4a4c,
    l: 0x6e9a7a,
    L: 0x9cc8a2,
    b: 0x8a9090,
    B: 0xc2c6c6,
    k: 0x0e0e10,
  }, 'ominous_bottle');

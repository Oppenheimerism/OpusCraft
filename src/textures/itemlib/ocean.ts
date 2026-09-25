// Stage 5's item sprites (ocean): the guardians', fish's, dolphin's, glow squid's and turtle's spawn eggs, in vanilla
// 1.21's egg colours (the fish, their buckets and the glow ink sac are drawn with the other items); and the turtle egg.

import { Gen, spr } from './common';
import { spawnEgg } from '../mobs';

export const OCEAN_ITEMS: Record<string, Gen> = {};
const I = OCEAN_ITEMS;

// vanilla SpawnEggItem colours: [background, highlight]
const EGGS: [string, number, number][] = [
  ['elder_guardian', 0xceccba, 0x747693],
  ['guardian', 0x5a8272, 0xf17d30],
  ['cod', 0xc1a76a, 0xe5c48b],
  ['dolphin', 0x223b4d, 0xf9f9f9],
  ['glow_squid', 0x095656, 0x85f1bc],
  ['pufferfish', 0xf6b201, 0x37c3f2],
  ['salmon', 0xa00f10, 0x0e8474],
  ['tropical_fish', 0xef6915, 0xfff9ef],
  ['turtle', 0xe7e7e7, 0x00afaf],
  ['axolotl', 0xfbc1e3, 0xa62d74],
];
for (const [m, base, spot] of EGGS) I[`${m}_spawn_egg`] = () => spawnEgg(base, spot);

/** vanilla item/turtle_egg: one egg, off-white with sea-green flecks, lit from the upper left */
I['turtle_egg'] = () =>
  spr([
    '................',
    '................',
    '................',
    '................',
    '......####......',
    '.....#LLll#.....',
    '....#LLlglb#....',
    '....#Llllgb#....',
    '...#Lllgllbb#...',
    '...#llllllbb#...',
    '...#lglllbbb#...',
    '...#lllllbbd#...',
    '....#llbbbd#....',
    '.....#bbdd#.....',
    '......####......',
    '................',
  ], { '#': 0x5b5647, L: 0xfbf9f1, l: 0xeae6d6, b: 0xd2ccb5, d: 0xb9b39b, g: 0x6fa98c }, 'turtle_egg');

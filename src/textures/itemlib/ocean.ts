// Stage 5's item sprites (ocean): the guardians', fish's, dolphin's and glow squid's spawn eggs, in vanilla 1.21's
// egg colours (the fish, their buckets and the glow ink sac are drawn with the other items).

import { Gen } from './common';
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
];
for (const [m, base, spot] of EGGS) I[`${m}_spawn_egg`] = () => spawnEgg(base, spot);

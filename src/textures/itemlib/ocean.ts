// Stage 5's item sprites (ocean): the guardians' spawn eggs, in vanilla 1.21's egg colours.

import { Gen } from './common';
import { spawnEgg } from '../mobs';

export const OCEAN_ITEMS: Record<string, Gen> = {};
const I = OCEAN_ITEMS;

// vanilla SpawnEggItem colours: [background, highlight]
const EGGS: [string, number, number][] = [
  ['elder_guardian', 0xceccba, 0x747693],
  ['guardian', 0x5a8272, 0xf17d30],
];
for (const [m, base, spot] of EGGS) I[`${m}_spawn_egg`] = () => spawnEgg(base, spot);

// (bastions) Item sprites for the bastion remnants' items that don't have one yet: the snout armour trim's smithing
// template (vanilla item/snout_armor_trim_smithing_template: a blackstone tablet with a piglin's snout cut into it in
// gold) and (M3) the piglin brute's spawn egg. Original pixel art.

import { Gen } from './common';
import { tablet } from './smithing';
import { spawnEgg } from '../mobs';

export const BASTION_ITEMS: Record<string, Gen> = {};
const X = BASTION_ITEMS;

/** the snout armour trim's template: a blackstone tablet, a golden snout with its two nostrils cut into it */
// prettier-ignore
X['snout_armor_trim_smithing_template'] = () =>
  tablet({ o: 0x0e0b0f, l: 0x4a414c, f: 0x2a242b, d: 0x1b171c }, [
    '................',
    '................',
    '................',
    '................',
    '.....GGGGGg.....',
    '....GggggggG....',
    '....Gg.gg.gG....',
    '....Gg.gg.gG....',
    '....GggggggG....',
    '.....gGGGGg.....',
    '............x...',
    '...s............',
    '..........s.....',
  ], { G: 0xf2c64a, g: 0xb8862a, s: 0x3d353f, x: 0x4a414c }, 'snout_armor_trim_smithing_template');

// (M3) vanilla SpawnEggItem for the piglin brute: its base and spots colours (0x592A10, 0xF9F3A4)
X.piglin_brute_spawn_egg = () => spawnEgg(0x592a10, 0xf9f3a4);

// The pottery sherds (vanilla item/<name>_pottery_sherd): a broken piece of fired clay, each with its pattern's
// motif (textures/decoratedPot.ts), the fragment's edge lit along its top left.

import type { TexImage } from '../tex';
import { img, plot, getA, getPx } from '../tex';
import { autoShade, type Gen } from './common';
import { POT_CLAY, MOTIFS, drawMotif } from '../decoratedPot';

// prettier-ignore
const SHARDS: Record<string, string[]> = {
  miner: [
    '................',
    '....XXXXX.......',
    '...XXXXXXXXX....',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXXX.',
    '..XXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '...XXXXXXXXXX...',
    '.....XXX.XXX....',
    '................',
  ],
  archer: [
    '................',
    '......XXXXX.....',
    '..XXXXXXXXXXX...',
    '.XXXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXXX.',
    '..XXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXXX.',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXX....',
    '...XXXX.........',
    '................',
  ],
  skull: [
    '................',
    '..XXX...XXXX....',
    '.XXXXXXXXXXXXX..',
    '.XXXXXXXXXXXXX..',
    '..XXXXXXXXXXXXX.',
    '..XXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXXX.',
    '..XXXXXXXXXXXXX.',
    '...XXXXXXXXXXX..',
    '.....XXXXXX.....',
    '................',
  ],
  prize: [
    '................',
    '....XXXXXXX.....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXXX.',
    '..XXXXXXXXXXXXX.',
    '..XXXXXXXXXXXX..',
    '...XXXXXXXXX....',
    '.....XXX........',
    '................',
  ],
};

/** (Stage 5: ocean) the ocean ruins' sherds are broken the ways the desert pyramid's are */
const SHARD_LIKE: Record<string, string> = { angler: 'miner', shelter: 'archer', snort: 'skull', blade: 'prize', explorer: 'miner', mourner: 'skull', plenty: 'prize' };

function sherd(name: string): TexImage {
  const mask = SHARDS[name] ?? SHARDS[SHARD_LIKE[name]];
  const t = autoShade(mask, POT_CLAY.slice(2, 7), POT_CLAY[0], { seed: `${name}_pottery_sherd`, noise: 0.18, edge: 1.2 });
  // (the motif as far as the fragment goes)
  const ink = img();
  drawMotif(ink, name, 3, 3);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) if (getA(ink, x, y) && mask[y][x] === 'X') plot(t, x, y, getPx(ink, x, y));
  return t;
}

export const ARCHAEOLOGY_ITEMS: Record<string, Gen> = {};
for (const name of Object.keys(MOTIFS)) ARCHAEOLOGY_ITEMS[`${name}_pottery_sherd`] = () => sherd(name);

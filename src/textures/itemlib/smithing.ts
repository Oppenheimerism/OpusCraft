// Smithing templates (vanilla item/netherite_upgrade_smithing_template and the armour trims' templates): a stone
// tablet with the design cut into it. Original pixel art in the manner of vanilla's, not a copy.

import type { TexImage } from '../tex';
import { Gen, spr, over } from './common';

export const SMITHING_ITEMS: Record<string, Gen> = {};

interface TabletPal {
  /** the outline */
  o: number;
  /** the lit top and left rim */
  l: number;
  /** the face */
  f: number;
  /** the shaded bottom and right rim */
  d: number;
}

/** the tablet: a chipped slab with a raised rim */
// prettier-ignore
const TABLET = [
  '................',
  '...oooooooooo...',
  '..ollllllllllo..',
  '..olffffffffdo..',
  '..olffffffffdo..',
  '..olffffffffdo..',
  '..olffffffffdo..',
  '..olffffffffdo..',
  '..olffffffffdo..',
  '..olffffffffdo..',
  '..olffffffffdo..',
  '..olffffffffdo..',
  '..olffffffffdo..',
  '..oddddddddddo..',
  '...oooooooooo...',
  '................',
];

// (trial chambers) exported: the bolt and flow armour trims' templates (itemlib/trialChambers.ts)
export function tablet(p: TabletPal, design: string[], pal: Record<string, number>, name: string): TexImage {
  const t = spr(TABLET, { o: p.o, l: p.l, f: p.f, d: p.d }, name);
  return over(t, design, pal);
}

// prettier-ignore
SMITHING_ITEMS['netherite_upgrade_smithing_template'] = () =>
  tablet({ o: 0x0f0c0d, l: 0x5a5054, f: 0x3a3336, d: 0x221d1f }, [
    '................',
    '................',
    '...........x....',
    '....s...........',
    '.....eeeeee.....',
    '....eHhhhhhe....',
    '....ehrrrrhe....',
    '....ehrRRrhe....',
    '....ehrRRrhe....',
    '....ehrrrrhe....',
    '....eHhhhhhe....',
    '.....eeeeee..x..',
    '....x.....s.....',
  ], { e: 0x1a1517, h: 0x6d6266, H: 0x8a7e82, r: 0x5e2626, R: 0x8c3a33, s: 0x4a4245, x: 0x2a2427 }, 'netherite_upgrade_smithing_template');

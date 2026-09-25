// (trial chambers) Item sprites for the 1.21 items that don't have one yet: the copper doors at each age (vanilla
// item/<age>copper_door, the waxed doors sharing them), the breeze rod (vanilla item/breeze_rod), and what the vaults
// give that the game didn't have: the honey bottle (vanilla item/honey_bottle) and the bolt and flow armour trims'
// smithing templates (vanilla item/bolt_armor_trim_smithing_template and flow_...); and (M4) the breeze's and the
// bogged's spawn eggs. Original pixel art.

import { TexImage, plot } from '../tex';
import { Gen, spr, outline4 } from './common';
import { blank, liquidBottle } from './misc';
import { tablet } from './smithing';
import { spawnEgg } from '../mobs';

export const TRIAL_CHAMBER_ITEMS: Record<string, Gen> = {};
const X = TRIAL_CHAMBER_ITEMS;

// (M4) the breeze's and the bogged's spawn eggs, in their vanilla colours (SpawnEggItem's base and spots)
X.breeze_spawn_egg = () => spawnEgg(0xaf94df, 0x9166df);
X.bogged_spawn_egg = () => spawnEgg(0x8a9c72, 0x314d1b);

// a copper door: two tall windows over a ribbed panel, the handle on the right; 'g' the odd fleck of the other colour
// (patina on the exposed door, bare copper on the weathered)
// prettier-ignore
const COPPER_DOOR = [
  '...##########...',
  '...#hhhhhhhh#...',
  '...#h..hh..P#...',
  '...#h..hp..P#...',
  '...#h..hp..P#...',
  '...#h..hp..P#...',
  '...#hpppgppP#...',
  '...#PPPPPPPP#...',
  '...#hhhhhhhP#...',
  '...#hqqqqqgP#...',
  '...#hqllllqP#...',
  '...#hqqqqqqk#...',
  '...#hgllllqP#...',
  '...#hqqqqqqP#...',
  '...#pPPPPPPP#...',
  '...##########...',
];

/** each age's door: outline, dark, base, mid, light, highlight, fleck (as the blocks' textures, blocklib/copper.ts) */
const DOORS: [string, number[]][] = [
  ['copper_door', [0x5a2a1c, 0x9e4f38, 0xc57052, 0xbb6749, 0xd98a68, 0xeda98c, 0xc57052]],
  ['exposed_copper_door', [0x4a352c, 0x7c5d4c, 0xa17d67, 0x93705c, 0xb48f78, 0xcca993, 0x6a9e84]],
  ['weathered_copper_door', [0x2c4a37, 0x4f7c58, 0x68996f, 0x5a8a64, 0x7aac80, 0x98c69b, 0x98765b]],
  ['oxidized_copper_door', [0x1f4538, 0x3a7a62, 0x52a284, 0x44896f, 0x62b394, 0x86d4b6, 0x5eb191]],
];
for (const [id, [o, dark, base, mid, light, hi, fleck]] of DOORS) {
  const gen = () => spr(COPPER_DOOR, { '#': o, P: dark, p: base, q: mid, l: light, h: hi, g: fleck, k: o }, id);
  X[id] = gen;
  X[`waxed_${id}`] = gen;
}

/**
 * the breeze rod: a blaze rod's shape (itemlib/misc.ts) in the breeze's pale blues, twisted: its highlight and shade
 * swap every few pixels along it, outlined in deep blue
 */
X['breeze_rod'] = (): TexImage => {
  const t = blank();
  const UPPER = 'hWhdhWhdhW', LOWER = 'dmDhdmDhdm';
  const ink: Record<string, number> = { W: 0xffffff, h: 0xdce8ff, m: 0xa9bdf0, d: 0x8298dc, D: 0x6477bf };
  for (let i = 0; i < 10; i++) {
    plot(t, 3 + i, 12 - i, ink[UPPER[i]]);
    plot(t, 4 + i, 12 - i, ink[LOWER[i]]);
  }
  outline4(t, 0x2b376d);
  return t;
};

/** the honey bottle: the glass bottle full of honey, amber at its edge to gold, a glint or two of pale gold */
X['honey_bottle'] = () => liquidBottle([0xb8650c, 0xe8981c, 0xf8c23a], 'honey_bottle', 0xffe28a);

/** the bolt armour trim's template: a tuff-grey tablet with a copper bolt of lightning cut into it */
// prettier-ignore
X['bolt_armor_trim_smithing_template'] = () =>
  tablet({ o: 0x16171a, l: 0x6c6f68, f: 0x494b45, d: 0x2e302b }, [
    '................',
    '................',
    '................',
    '........Cc......',
    '.......Cc.......',
    '......Cc........',
    '.....CCCCc......',
    '.......Cc.......',
    '......Cc........',
    '.....Cc.....x...',
    '....Cc..........',
    '...s............',
    '..........s.....',
  ], { C: 0xdb8f5e, c: 0x9c5436, s: 0x3a3c36, x: 0x5a5c55 }, 'bolt_armor_trim_smithing_template');

/** the flow armour trim's template: a pale tablet with the breeze's swirl of wind cut into it */
// prettier-ignore
X['flow_armor_trim_smithing_template'] = () =>
  tablet({ o: 0x1a1d24, l: 0x9aa2ac, f: 0x737b86, d: 0x4c535c }, [
    '................',
    '................',
    '................',
    '.....wWWWw......',
    '....W.....W.....',
    '....W..ww..W....',
    '....W.W..W.W....',
    '....W.W.Wb.W....',
    '....W..W..W.....',
    '.....W...W......',
    '......WWW...x...',
    '...s............',
    '..........s.....',
  ], { W: 0xd8f0f8, w: 0x9cc8dc, b: 0x6aa6c4, s: 0x5a616b, x: 0x8c949e }, 'flow_armor_trim_smithing_template');

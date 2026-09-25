// The copper blocks' textures (1.21): the block of copper's family at each of its four ages (vanilla
// block/<age>copper, <age>cut_copper, <age>chiseled_copper, <age>copper_grate, <age>copper_bulb[_lit][_powered],
// <age>copper_door_top/_bottom, <age>copper_trapdoor), the waxed blocks sharing them, and the lightning rod's
// (block/lightning_rod and its white-hot lightning_rod_on). Each kind is laid out once as tones of brushed metal
// (edge-dark to highlight) and painted per age: bare copper, then exposed (a dull pinkish brown, a few specks of
// patina), weathered (mostly green, brown showing through) and oxidized (all teal). The block of copper itself is
// the metals' (blocks.ts); the patina grows in the same places from one age to the next. Original pixel art.

import { TexImage, type TexDef, img, setPx } from '../tex';
import { N, rng, idx, fbm, quantize, equalize } from './core';

type Gen = () => TexImage;

/** each age's bare metal, edge-dark to highlight (the unaffected one is the block of copper's, blocks.ts) */
const METAL = [
  [0x8f4631, 0xbb6749, 0xc57052, 0xd3825f, 0xeda98c],
  [0x6f4f40, 0x93705c, 0xa17d67, 0xae8a73, 0xcca993],
  [0x6a4f3c, 0x8a6a51, 0x98765b, 0xa88467, 0xc2a07f],
  [0x2e5e4e, 0x44896f, 0x52a284, 0x5eb191, 0x86d4b6],
];
/** each age's patina, edge-dark to highlight */
const PATINA = [
  METAL[0],
  [0x3f6e5a, 0x5a8f76, 0x6a9e84, 0x7aae92, 0x9ccab0],
  [0x3e6a4d, 0x5a8a64, 0x68996f, 0x76a87c, 0x98c69b],
  METAL[3],
];
/** how much of the surface the patina has taken at each age */
const COVER = [0, 0.14, 0.64, 1];

/** the prefix of each age's texture names */
const AGES = ['', 'exposed_', 'weathered_', 'oxidized_'];

/** a copper bulb's window: its dark glass and unlit bulb, darkest to lightest */
const GLASS = [0x171512, 0x1f1c18, 0x29241f, 0x352f28, 0x433a31, 0x5a4e41, 0x6f6150];
/** a lit bulb's glow, dimmest to white-hot */
const GLOW = [0x7a4a18, 0xb8742a, 0xe0a040, 0xf6cc60, 0xffe890, 0xfff6c8, 0xfffff4];
/** a powered bulb's filament */
const RED = [0x5c0a04, 0x9a1408, 0xd8240e, 0xff5230];

const TRANSPARENT = -1;
/** a tone meaning "the bulb's window": drawn over the metal afterwards */
const WINDOW = -2;

const clampT = (k: number) => Math.max(0, Math.min(4, k));

/** brushed metal: faint horizontal streaks in tones 1-3 (as the metals' blocks, blocklib/building.ts metalBlock) */
function brushed(seed: string): Int32Array {
  return quantize(fbm(rng(seed), [[16, 4, 0.5], [8, 2, 0.3]], 0.15), [0.8, 5, 1.2]).map((k) => k + 1);
}

/** a raised square (x0,y0)-(x1,y1): lit along its top and left, shadowed along its bottom and right, softened inside */
function raise(t: Int32Array, x0: number, y0: number, x1: number, y1: number, hi = 4, lo = 0): void {
  for (let i = x0; i <= x1; i++) {
    t[idx(i, y0)] = hi;
    t[idx(i, y1)] = lo;
  }
  for (let j = y0; j <= y1; j++) {
    t[idx(x0, j)] = hi;
    t[idx(x1, j)] = lo;
  }
  t[idx(x1, y0)] = 2;
  t[idx(x0, y1)] = 2;
  const d = hi > lo ? 1 : -1;
  for (let i = x0 + 1; i < x1; i++) {
    t[idx(i, y0 + 1)] = clampT(t[idx(i, y0 + 1)] + d);
    t[idx(i, y1 - 1)] = clampT(t[idx(i, y1 - 1)] - d);
  }
  for (let j = y0 + 2; j < y1 - 1; j++) {
    t[idx(x0 + 1, j)] = clampT(t[idx(x0 + 1, j)] + d);
    t[idx(x1 - 1, j)] = clampT(t[idx(x1 - 1, j)] - d);
  }
}

/** a one-pixel groove round (x0,y0)-(x1,y1): its top and left in shadow, its bottom and right catching the light */
function groove(t: Int32Array, x0: number, y0: number, x1: number, y1: number): void {
  for (let i = x0; i <= x1; i++) {
    t[idx(i, y0)] = 0;
    t[idx(i, y1)] = 3;
  }
  for (let j = y0; j <= y1; j++) {
    t[idx(x0, j)] = 0;
    t[idx(x1, j)] = 3;
  }
  t[idx(x1, y0)] = 1;
  t[idx(x0, y1)] = 1;
}

/** holes cut through: every pixel of (x0,y0)-(x1,y1) see-through, the metal round them bevelled into the opening */
function cut(t: Int32Array, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) t[idx(x, y)] = TRANSPARENT;
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    if (t[idx(x, y0 - 1)] >= 0) t[idx(x, y0 - 1)] = 1;
    if (t[idx(x, y1 + 1)] >= 0) t[idx(x, y1 + 1)] = 3;
  }
  for (let y = y0; y <= y1; y++) {
    if (t[idx(x0 - 1, y)] >= 0) t[idx(x0 - 1, y)] = 1;
    if (t[idx(x1 + 1, y)] >= 0) t[idx(x1 + 1, y)] = 3;
  }
}

/**
 * paints a kind's tones at an age: bare metal where the patina hasn't reached (its rim a shade darker), the patina
 * mottled; `layout` names the kind, so each kind's patina grows in the same places from age to age
 */
function paintCopper(tones: Int32Array, age: number, layout: string): TexImage {
  const t = img();
  // (patches, and specks between them: the specks come first, the patches spread over them)
  const r = rng(`${layout}_patina`);
  const patches = fbm(r, [[8, 8, 0.6], [4, 4, 0.4]]), specks = fbm(r, [[2, 2, 0.5]], 0.5);
  const blot = equalize(patches.map((v, i) => v * 0.6 + specks[i] * (age === 1 ? 0.7 : 0.35)));
  const mottle = fbm(rng(`${layout}_mottle`, age), [[4, 4, 0.5], [2, 2, 0.5]], 0.4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x, k = tones[i];
      if (k < 0) continue;
      const m = mottle[i];
      if (blot[i] < COVER[age]) setPx(t, x, y, PATINA[age][clampT(k + (m > 0.86 ? 1 : m < 0.14 ? -1 : 0))]);
      else setPx(t, x, y, METAL[age][k]);
    }
  return t;
}

// ---------------------------------------------------------------------------
// The kinds' layouts

/** vanilla block/<age>copper: one brushed plate, bevelled round its edge (the block of copper's own look) */
function fullLayout(): Int32Array {
  const t = brushed('copper_block');
  raise(t, 0, 0, 15, 15);
  return t;
}

/** vanilla block/<age>cut_copper: four bevelled tiles */
function cutLayout(): Int32Array {
  const t = brushed('cut_copper');
  for (const y0 of [0, 8]) for (const x0 of [0, 8]) raise(t, x0, y0, x0 + 7, y0 + 7);
  return t;
}

/** vanilla block/<age>chiseled_copper: a bevelled plate with a groove round a raised square, and a sunk square in that */
function chiseledLayout(): Int32Array {
  const t = brushed('chiseled_copper');
  raise(t, 0, 0, 15, 15);
  groove(t, 3, 3, 12, 12);
  raise(t, 4, 4, 11, 11, 3, 1);
  groove(t, 6, 6, 9, 9);
  for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) t[idx(x, y)] = 2;
  // the notches that key the plate to the frame, at the middle of each side
  for (const [x, y, k] of [[7, 3, 3], [8, 3, 3], [3, 7, 3], [3, 8, 3], [7, 12, 1], [8, 12, 1], [12, 7, 1], [12, 8, 1]]) t[idx(x, y)] = k;
  return t;
}

/**
 * vanilla block/<age>copper_grate: a lattice of two-pixel bars round four rows of four square openings, each bar lit
 * along its upper and left edge (the lattice runs on across neighbouring grates)
 */
function grateLayout(): Int32Array {
  const t = new Int32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const a = x % 4, b = y % 4;
      const barX = a === 3 || a === 0, barY = b === 3 || b === 0;
      let k: number;
      if (!barX && !barY) k = TRANSPARENT;
      else if (barX && barY) k = a === 3 && b === 3 ? 4 : a === 0 && b === 0 ? 1 : 2;
      else if (barY) k = b === 3 ? 3 : 1;
      else k = a === 3 ? 3 : 1;
      t[y * N + x] = k;
    }
  return t;
}

/** vanilla block/<age>copper_door_top: the frame, and two tall windows either side of a mullion */
function doorTopLayout(): Int32Array {
  const t = brushed('copper_door_top');
  for (let y = 0; y < N; y++) {
    t[idx(0, y)] = 4;
    t[idx(15, y)] = 0;
    t[idx(1, y)] = clampT(t[idx(1, y)] + 1);
    t[idx(14, y)] = clampT(t[idx(14, y)] - 1);
  }
  for (let x = 0; x < N; x++) t[idx(x, 0)] = x === 15 ? 2 : 4;
  cut(t, 3, 3, 6, 12);
  cut(t, 9, 3, 12, 12);
  // a rib across the foot of the windows, where the top half meets the bottom
  for (let x = 1; x < 15; x++) {
    t[idx(x, 14)] = 3;
    t[idx(x, 15)] = 1;
  }
  return t;
}

/** vanilla block/<age>copper_door_bottom: the frame, a raised panel ribbed across, and the handle */
function doorBottomLayout(): Int32Array {
  const t = brushed('copper_door_bottom');
  for (let y = 0; y < N; y++) {
    t[idx(0, y)] = 4;
    t[idx(15, y)] = 0;
    t[idx(1, y)] = clampT(t[idx(1, y)] + 1);
    t[idx(14, y)] = clampT(t[idx(14, y)] - 1);
  }
  for (let x = 0; x < N; x++) t[idx(x, 15)] = x === 0 ? 2 : 0;
  raise(t, 3, 2, 12, 13);
  for (const y of [5, 9]) for (let x = 4; x < 12; x++) {
    t[idx(x, y)] = 1;
    t[idx(x, y + 1)] = 3;
  }
  for (const [x, y, k] of [[13, 1, 4], [13, 2, 0], [12, 1, 1]]) t[idx(x, y)] = k;
  return t;
}

/** vanilla block/<age>copper_trapdoor: a bevelled frame with a cross through it and four square windows */
function trapdoorLayout(): Int32Array {
  const t = brushed('copper_trapdoor');
  raise(t, 0, 0, 15, 15);
  for (const y0 of [3, 9]) for (const x0 of [3, 9]) cut(t, x0, y0, x0 + 3, y0 + 3);
  // the cross's rivet
  for (const [x, y, k] of [[7, 7, 4], [8, 7, 3], [7, 8, 3], [8, 8, 1]]) t[idx(x, y)] = k;
  return t;
}

/** vanilla block/<age>copper_bulb: a bevelled frame round a grooved window (the window drawn by bulbWindow) */
function bulbLayout(): Int32Array {
  const t = brushed('copper_bulb');
  raise(t, 0, 0, 15, 15);
  groove(t, 2, 2, 13, 13);
  for (let y = 3; y <= 12; y++) for (let x = 3; x <= 12; x++) t[idx(x, y)] = WINDOW;
  return t;
}

/** the bulb in its window: dark glass round an unlit bulb, or all aglow; a powered bulb's filament shows red */
function bulbWindow(t: TexImage, lit: boolean, powered: boolean): void {
  for (let y = 3; y <= 12; y++)
    for (let x = 3; x <= 12; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      let k = x === 3 || y === 3 ? 0 : 1;
      if (d < 3.2) k = d > 2.5 ? (x + y < 15 ? 4 : 2) : 3;
      setPx(t, x, y, lit ? GLOW[Math.min(6, k + (d < 3.2 ? 2 : 1))] : GLASS[k]);
    }
  for (const [x, y, k] of [[6, 6, 6], [7, 6, 5], [6, 7, 5], [8, 8, 4], [9, 8, 2], [8, 9, 2]]) setPx(t, x, y, lit ? GLOW[Math.min(6, k + 1)] : GLASS[k]);
  if (powered) for (const [x, y, k] of [[7, 7, 3], [8, 7, 2], [7, 8, 2], [8, 8, 1]]) setPx(t, x, y, RED[lit ? Math.min(3, k + 1) : k]);
}

// ---------------------------------------------------------------------------
// The lightning rod

/**
 * vanilla block/lightning_rod: the knob (u 0-4, v 0-4), bevelled, and the rod (u 0-2, v 4-16), lit down its left
 * side, banded where it's joined; the rest of the sheet is empty
 */
function lightningRod(pal: number[]): TexImage {
  const t = img();
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const k = x === 0 || y === 0 ? (x === 3 || y === 3 ? 2 : 4) : x === 3 || y === 3 ? 0 : x + y === 2 ? 3 : 2;
      setPx(t, x, y, pal[k]);
    }
  for (let y = 4; y < 16; y++) {
    const band = y % 4 === 3;
    setPx(t, 0, y, pal[band ? 2 : 3]);
    setPx(t, 1, y, pal[band ? 0 : 1]);
  }
  return t;
}

export function registerCopperTextures(T: Record<string, () => TexDef>): void {
  const layouts: [string, () => Int32Array][] = [
    ['cut_copper', cutLayout], ['chiseled_copper', chiseledLayout], ['copper_grate', grateLayout], ['copper_door_top', doorTopLayout],
    ['copper_door_bottom', doorBottomLayout], ['copper_trapdoor', trapdoorLayout],
  ];
  for (let age = 0; age < 4; age++) {
    const a = AGES[age];
    if (age > 0) T[`${a}copper`] = () => paintCopper(fullLayout(), age, 'copper_block');
    for (const [kind, layout] of layouts) T[`${a}${kind}`] = () => paintCopper(layout(), age, kind);
    for (const lit of [false, true])
      for (const powered of [false, true])
        T[`${a}copper_bulb${lit ? '_lit' : ''}${powered ? '_powered' : ''}`] = () => {
          const t = paintCopper(bulbLayout(), age, 'copper_bulb');
          bulbWindow(t, lit, powered);
          return t;
        };
  }
  T['lightning_rod'] = () => lightningRod(METAL[0]);
  T['lightning_rod_on'] = () => lightningRod([0xc9dcea, 0xe1edf6, 0xf1f7fc, 0xfbfdff, 0xffffff]);
}

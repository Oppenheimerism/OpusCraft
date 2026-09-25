// The trial chambers' own blocks' textures (1.21): the heavy core (vanilla block/heavy_core: its top, bottom and side
// in three quarters of the sheet, as models/block/heavy_core.json maps them); the trial spawner (vanilla
// block/trial_spawner_*: its bottom, and its sides and top idle, active and throwing out its reward, each in an
// ominous set too) and the vault (vanilla block/vault_*: its front, sides, top and bottom off, on and ejecting, and the
// ominous vault's set). Both are cages of dark tuff-grey metal trimmed in copper that glows while they're awake (the
// ominous ones dark steel lit soul blue), with see-through windows between the bars (they're drawn cutout, with
// their inner faces). Original pixel art.

import { TexImage, type TexDef, img, setPx } from '../tex';
import { rng, fbm, quantize, noise } from './core';
import { registerCrafterTextures } from './crafter';

type Gen = () => TexImage;

/** the heavy core's dense dark metal, darkest to its steely sheen */
const HEAVY = [0x17191d, 0x22252a, 0x2e3137, 0x3b3f46, 0x4d525a, 0x676e77, 0x8e969f];

/**
 * vanilla block/heavy_core: an 8x8 face in each of three quarters, the top (u 0-8, v 0-8) and the sides (u 0-8,
 * v 8-16) cast metal lit from the upper left with a sheen off its top edge, the bottom (u 8-16, v 0-8) darker
 */
function heavyCore(): TexImage {
  const t = img();
  const grain = quantize(fbm(rng('heavy_core'), [[4, 4, 0.5], [2, 2, 0.4]], 0.3, 16, 16), [1, 3, 5, 3, 1]);
  const face = (ox: number, oy: number, base: number, sheen: boolean) => {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        let k = base + grain[(oy + y) * 16 + ox + x] - 2;
        if (x === 0 || y === 0) k += 2;
        else if (x === 7 || y === 7) k -= 2;
        else if (x === 1 || y === 1) k += 1;
        if (sheen && y >= 1 && y <= 2 && x >= 2 && x <= 4) k += 2;
        setPx(t, ox + x, oy + y, HEAVY[Math.max(0, Math.min(6, k))]);
      }
  };
  face(0, 0, 3, true);
  face(8, 0, 1, false);
  face(0, 8, 2, true);
  // the sides' band where the core was cast in two halves
  for (let x = 0; x < 8; x++) {
    setPx(t, x, 12, HEAVY[x === 0 ? 2 : 1]);
    setPx(t, x, 13, HEAVY[x === 7 ? 3 : 4]);
  }
  return t;
}

// ---------------------------------------------------------------------------
// the trial spawner and the vault

/** a cage's colours: its frame (darkest to lightest), its trim, its glow (dim to white-hot), the dark behind a keyhole */
interface Look {
  frame: number[];
  trim: number[];
  glow: number[];
  dark: number;
}
const NORMAL: Look = {
  frame: [0x222320, 0x2c2e2a, 0x363833, 0x42443e, 0x4e5049, 0x5c5e56, 0x6c6e65],
  trim: [0x5e3322, 0x7c442d, 0x9c5a3c, 0xb96f4c, 0xd48c64, 0xe6aa84],
  glow: [0x7a4a18, 0xc07a2c, 0xeaa640, 0xfbd068, 0xfff0b4],
  dark: 0x121210,
};
const OMINOUS: Look = {
  frame: [0x191b1f, 0x212428, 0x2a2e33, 0x343940, 0x3f454d, 0x4b525b, 0x5a626c],
  trim: [0x1a2632, 0x223244, 0x2c4157, 0x38516b, 0x486682, 0x5e7f9c],
  glow: [0x0d4658, 0x1b7a96, 0x36b0d0, 0x70d8ee, 0xc8f6ff],
  dark: 0x0a0e12,
};

/**
 * what each pixel is: F frame (f its lit edge, d its shadowed one), C trim (c its corners), B a bar (b in shadow, R
 * where bars cross), P a plate (p its seams), L / l a glowing accent (bright / dim; unlit: trim), W white-hot (unlit:
 * trim), K a keyhole's dark, and '.' see-through
 */
type Grid = string[][];

function grid(): Grid {
  return Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => '.'));
}

/** the outer frame, lit along its top and left, and the copper trim just inside it with a glowing stretch mid-side */
function frameAndTrim(g: Grid): void {
  for (let i = 0; i < 16; i++)
    for (const [x, y] of [[i, 0], [0, i], [i, 15], [15, i]]) g[y][x] = y === 0 || x === 0 ? 'f' : 'd';
  g[0][15] = g[15][0] = 'F';
  for (let i = 1; i < 15; i++)
    for (const [x, y] of [[i, 1], [1, i], [i, 14], [14, i]]) g[y][x] = i === 1 || i === 14 ? 'c' : i >= 6 && i <= 9 ? (i === 6 || i === 9 ? 'l' : 'L') : 'C';
}

/** bars along these columns and rows between the trim, crossing at rivets */
function bars(g: Grid, xs: number[], ys: number[], x0 = 2, y0 = 2, x1 = 13, y1 = 13): void {
  for (const x of xs) for (let y = y0; y <= y1; y++) g[y][x] = x === x1 ? 'b' : 'B';
  for (const y of ys) for (let x = x0; x <= x1; x++) g[y][x] = xs.includes(x) ? 'R' : y === y1 ? 'b' : 'B';
}

/** a plate over (x0,y0)-(x1,y1), its edge lit top and left */
function plate(g: Grid, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) g[y][x] = y === y0 || x === x0 ? 'f' : y === y1 || x === x1 ? 'd' : 'P';
}

function paintGrid(g: Grid, look: Look, lit: boolean, seed: string): TexImage {
  const t = img();
  const n = noise(rng(seed), 4);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const ch = g[y][x];
      if (ch === '.') continue;
      const v = n[y * 16 + x];
      const j = v > 0.68 ? 1 : v < 0.32 ? -1 : 0;
      const fr = (k: number) => look.frame[Math.max(0, Math.min(6, k + j))];
      const tr = (k: number) => look.trim[Math.max(0, Math.min(5, k + j))];
      let c: number;
      switch (ch) {
        case 'F': c = fr(3); break;
        case 'f': c = fr(5); break;
        case 'd': c = fr(1); break;
        case 'B': c = fr(5); break;
        case 'b': c = fr(3); break;
        case 'R': c = look.frame[6]; break;
        case 'P': c = fr(2); break;
        case 'p': c = look.frame[0]; break;
        case 'C': c = tr(3); break;
        case 'c': c = tr(1); break;
        case 'L': c = lit ? look.glow[3] : tr(2); break;
        case 'l': c = lit ? look.glow[1] : tr(1); break;
        case 'W': c = lit ? look.glow[4] : tr(3); break;
        case 'K': c = look.dark; break;
        default: c = fr(3);
      }
      setPx(t, x, y, c);
    }
  return t;
}

/** the trial spawner's side: a cage of three by three windows (the middle one smaller); awake, its rivets glow */
function trialSpawnerSide(look: Look, lit: boolean, seed: string): TexImage {
  const g = grid();
  frameAndTrim(g);
  bars(g, [2, 6, 9, 13], [2, 6, 9, 13]);
  if (lit) for (const x of [6, 9]) for (const y of [6, 9]) g[y][x] = 'W';
  return paintGrid(g, look, lit, seed);
}

/**
 * the trial spawner's top: the cage round a shutter in the middle, shut (its seam glowing while awake) or open, the
 * reward coming up through it
 */
function trialSpawnerTop(look: Look, state: 'inactive' | 'active' | 'ejecting', seed: string): TexImage {
  const g = grid();
  frameAndTrim(g);
  bars(g, [2, 13], [2, 13]);
  for (let i = 3; i <= 12; i++) {
    g[4][i] = g[11][i] = i === 3 || i === 12 ? 'R' : 'B';
    g[i][4] = g[i][11] = i === 4 || i === 11 ? 'R' : 'B';
  }
  plate(g, 5, 5, 10, 10);
  if (state === 'ejecting') {
    for (let y = 6; y <= 9; y++) for (let x = 6; x <= 9; x++) g[y][x] = '.';
    for (let i = 6; i <= 9; i++) g[5][i] = g[10][i] = g[i][5] = g[i][10] = 'L';
  } else for (let i = 6; i <= 9; i++) g[i][7] = g[i][8] = state === 'active' ? (i === 6 || i === 9 ? 'l' : 'L') : 'p';
  return paintGrid(g, look, state !== 'inactive', seed);
}

/** the trial spawner's bottom: a solid plate crossed by seams */
function trialSpawnerBottom(): TexImage {
  const g = grid();
  frameAndTrim(g);
  plate(g, 2, 2, 13, 13);
  for (let i = 3; i <= 12; i++) g[i][7] = g[7][i] = 'p';
  return paintGrid(g, NORMAL, false, 'trial_spawner_bottom');
}

/** the vault's side: a wide window, two bars down and one across, its trim glowing while it's awake */
function vaultSide(look: Look, lit: boolean, seed: string): TexImage {
  const g = grid();
  frameAndTrim(g);
  bars(g, [2, 6, 9, 13], [2, 8, 13]);
  return paintGrid(g, look, lit, seed);
}

/**
 * the vault's front: a barred window over a plate, and on the plate a copper escutcheon with the keyhole (a round
 * head over a slot): dark when it's off, glowing while it's waiting on someone, white-hot while it's opening
 */
function vaultFront(look: Look, state: 'off' | 'on' | 'ejecting', seed: string): TexImage {
  const g = grid();
  frameAndTrim(g);
  bars(g, [2, 6, 9, 13], [2], 2, 2, 13, 6);
  plate(g, 2, 6, 13, 13);
  for (let y = 7; y <= 12; y++) for (let x = 5; x <= 10; x++) g[y][x] = y === 7 || x === 5 ? 'C' : y === 12 || x === 10 ? 'c' : 'C';
  const key: [number, number][] = [[7, 8], [8, 8], [6, 9], [7, 9], [8, 9], [9, 9], [7, 10], [8, 10], [7, 11], [8, 11]];
  // (its head rounded: the corners of the widest row a shade off the keyhole)
  for (const [x, y] of key) g[y][x] = state === 'off' ? 'K' : state === 'on' ? 'L' : 'W';
  if (state !== 'off') for (const [x, y] of [[6, 9], [9, 9]] as [number, number][]) g[y][x] = 'l';
  return paintGrid(g, look, state !== 'off', seed);
}

/** the vault's top: a hatch in the middle, shut or (ejecting) open */
function vaultTop(look: Look, open: boolean, seed: string): TexImage {
  const g = grid();
  frameAndTrim(g);
  plate(g, 2, 2, 13, 13);
  plate(g, 5, 5, 10, 10);
  if (open) for (let y = 6; y <= 9; y++) for (let x = 6; x <= 9; x++) g[y][x] = '.';
  else for (let i = 6; i <= 9; i++) g[i][7] = 'p';
  return paintGrid(g, look, open, seed);
}

/** the vault's bottom: a plate */
function vaultBottom(look: Look, seed: string): TexImage {
  const g = grid();
  frameAndTrim(g);
  plate(g, 2, 2, 13, 13);
  return paintGrid(g, look, false, seed);
}

export function registerTrialChamberTextures(T: Record<string, () => TexDef>): void {
  T['heavy_core'] = heavyCore;
  // the crafter's (M5), drawn from its advancement icon's
  registerCrafterTextures(T);
  // the trial spawner: vanilla block/trial_spawner_bottom, _side_inactive, _side_active, _top_inactive, _top_active and
  // _top_ejecting_reward, and the ominous ones of all but the bottom
  T['trial_spawner_bottom'] = trialSpawnerBottom;
  for (const [o, look] of [['', NORMAL], ['_ominous', OMINOUS]] as const) {
    T[`trial_spawner_side_inactive${o}`] = () => trialSpawnerSide(look, false, `trial_spawner_side${o}`);
    T[`trial_spawner_side_active${o}`] = () => trialSpawnerSide(look, true, `trial_spawner_side${o}`);
    T[`trial_spawner_top_inactive${o}`] = () => trialSpawnerTop(look, 'inactive', `trial_spawner_top${o}`);
    T[`trial_spawner_top_active${o}`] = () => trialSpawnerTop(look, 'active', `trial_spawner_top${o}`);
    T[`trial_spawner_top_ejecting_reward${o}`] = () => trialSpawnerTop(look, 'ejecting', `trial_spawner_top${o}`);
    // the vault: vanilla block/vault_front_off, _front_on, _front_ejecting, _side_off, _side_on, _top, _top_ejecting and
    // _bottom, and the ominous vault's
    T[`vault_front_off${o}`] = () => vaultFront(look, 'off', `vault_front${o}`);
    T[`vault_front_on${o}`] = () => vaultFront(look, 'on', `vault_front${o}`);
    T[`vault_front_ejecting${o}`] = () => vaultFront(look, 'ejecting', `vault_front${o}`);
    T[`vault_side_off${o}`] = () => vaultSide(look, false, `vault_side${o}`);
    T[`vault_side_on${o}`] = () => vaultSide(look, true, `vault_side${o}`);
    T[`vault_top${o}`] = () => vaultTop(look, false, `vault_top${o}`);
    T[`vault_top_ejecting${o}`] = () => vaultTop(look, true, `vault_top${o}`);
    T[`vault_bottom${o}`] = () => vaultBottom(look, `vault_bottom${o}`);
  }
}

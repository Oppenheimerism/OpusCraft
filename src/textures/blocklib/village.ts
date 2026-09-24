// The blocks of villages (vanilla block/*.png for the job sites and village furniture): the bell's particle face,
// barrel, composter, smoker, blast furnace, cauldron, lectern, the cartography / fletching / smithing tables,
// loom, stonecutter, brewing stand, flower pot and campfire.

import { TexImage, TexDef, AnimTex, img, setPx, getPx, mixC, mulC, anim, clear, Rand } from '../tex';
import { N, rng, fbm, quantize, paint, white } from './core';
import { planks, WOOD, WoodDef } from './wood';
import { speckled, stone } from './terrain';
import { smoothStone } from './building';
import { sprite } from './plants';
import { BELL_GOLD } from '../bellBody';
import { pottedAzaleaTop, pottedAzaleaSide, pottedAzaleaPlant } from './lush';
import { roots } from './netherFlora';

type Reg = Record<string, () => TexDef>;

/** vertical boards (staves, slats) `w` wide: grain running down, a dark seam on each board's right edge */
function staves(seed: string, pal: number[], w: number, first = 0): TexImage {
  const r = rng(seed);
  const tones = quantize(fbm(r, [[1, 8, 0.5], [2, 16, 0.3], [1, 4, 0.2]], 0.25), [0.6, 2, 5, 2.4, 0.6]);
  const t = paint(tones.map((k) => k + 1), pal);
  for (let y = 0; y < N; y++)
    for (let x = first; x < N; x += w) {
      const sx = (x + w - 1) % N;
      setPx(t, sx, y, pal[0]);
      // the next board's edge catches the light
      setPx(t, (sx + 1) % N, y, mixC(getPx(t, (sx + 1) % N, y), pal[5], 0.35));
    }
  return t;
}

/** a darkened hollow: `k` 0 at the rim to 1 deep inside */
function shade(c: number, k: number): number {
  return mixC(c, 0x000000, Math.max(0, Math.min(1, k)));
}

// ---------------------------------------------------------------------------
// Bell (the body is the block entity's; this is only its particle face, vanilla block/bell_bottom)

export function bellBottom(): TexImage {
  const r: Rand = rng('bell_bottom');
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      let k = d > 6.5 ? 3 : d > 5.5 ? 5 : d > 4.5 ? 2 : 1;
      if (r.chance(0.15)) k += r.chance(0.5) ? 1 : -1;
      setPx(t, x, y, d < 1 ? BELL_GOLD[3] : BELL_GOLD[Math.max(0, Math.min(7, k))]);
    }
  return t;
}

// ---------------------------------------------------------------------------
// Barrel: spruce-brown staves bound by two dark iron hoops; the lid, or the dark inside when open

const BARREL_WOOD: WoodDef = { ...WOOD.spruce, wood: WOOD.spruce.wood.map((c) => mulC(c, 1.12)) };
const HOOP = [0x1f1f1f, 0x2e2e2e, 0x3d3d3d, 0x4f4f4f];

export function barrelSide(): TexImage {
  const pal = BARREL_WOOD.wood;
  const t = staves('barrel_side', pal, 4, 1);
  // the hoops (two rows each: a lit upper edge), and the stave ends at the rims
  for (let x = 0; x < N; x++) {
    for (const y of [2, 12]) {
      setPx(t, x, y, x % 4 === 0 ? HOOP[3] : HOOP[2]);
      setPx(t, x, y + 1, HOOP[x % 5 === 2 ? 0 : 1]);
    }
    setPx(t, x, 0, mixC(getPx(t, x, 0), pal[5], 0.3));
    setPx(t, x, 15, mixC(getPx(t, x, 15), pal[0], 0.5));
  }
  return t;
}

/** the rim of the barrel seen from above: the stave ends, a ring two pixels wide */
function barrelRim(t: TexImage, seed: string): void {
  const r = rng(seed + '_rim');
  const pal = BARREL_WOOD.wood;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.min(x, y, 15 - x, 15 - y);
      if (d > 1) continue;
      // (the end grain of each stave, a joint every four pixels along the rim)
      const along = d === Math.min(x, 15 - x) ? y : x;
      let c = pal[d === 0 ? 2 : 4];
      if (along % 4 === 3) c = pal[1];
      if (r.chance(0.2)) c = mixC(c, pal[3], 0.5);
      setPx(t, x, y, c);
    }
  // the hoop's edge just inside the rim
  for (let i = 2; i < 14; i++)
    for (const [x, y] of [[i, 2], [2, i], [i, 13], [13, i]]) setPx(t, x, y, mixC(getPx(t, x, y), pal[0], 0.55));
}

export function barrelTop(open: boolean): TexImage {
  const seed = open ? 'barrel_top_open' : 'barrel_top';
  const pal = BARREL_WOOD.wood;
  let t: TexImage;
  if (open) {
    // the dark inside, deepening toward the middle, the far walls catching a little light
    const r = rng(seed);
    t = img();
    const noiseF = white(r);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const d = Math.min(x, y, 15 - x, 15 - y);
        const k = 0.72 + Math.min(0.2, (d - 2) * 0.045) + noiseF[y * N + x] * 0.05;
        setPx(t, x, y, shade(pal[2], y < 5 ? k - 0.08 : k));
      }
  } else {
    // the lid: boards across, and a pair of iron bands holding them
    t = planks(seed, BARREL_WOOD);
    for (let x = 3; x < 13; x++) {
      setPx(t, x, 5, HOOP[2]);
      setPx(t, x, 10, HOOP[2]);
    }
    for (const y of [5, 10]) {
      setPx(t, 4, y, HOOP[3]);
      setPx(t, 11, y, HOOP[3]);
    }
  }
  barrelRim(t, seed);
  return t;
}

export function barrelBottom(): TexImage {
  const t = planks('barrel_bottom', BARREL_WOOD);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) setPx(t, x, y, mulC(getPx(t, x, y), 0.9));
  barrelRim(t, 'barrel_bottom');
  return t;
}

// ---------------------------------------------------------------------------
// Composter: an open oak crate of slats on four corner posts, and what rots inside it

const OAK = WOOD.oak;

export function composterSide(): TexImage {
  const pal = OAK.wood;
  const r = rng('composter_side');
  const tones = quantize(fbm(r, [[8, 1, 0.5], [16, 2, 0.3], [4, 1, 0.2]], 0.25), [0.6, 2, 5, 2.4, 0.6]);
  const t = paint(tones.map((k) => k + 1), pal);
  // three slats across with a dark gap under each (the lit top edge of the next below it), on two corner posts
  for (let x = 0; x < N; x++) {
    setPx(t, x, 0, pal[5]);
    for (const y of [5, 10]) {
      setPx(t, x, y, pal[0]);
      setPx(t, x, y + 1, mixC(getPx(t, x, y + 1), pal[5], 0.35));
    }
    setPx(t, x, 15, pal[1]);
  }
  for (let y = 0; y < N; y++) {
    setPx(t, 0, y, pal[1]);
    setPx(t, 1, y, pal[3]);
    setPx(t, 14, y, pal[2]);
    setPx(t, 15, y, pal[1]);
  }
  return t;
}

export function composterTop(): TexImage {
  const pal = OAK.wood;
  const r = rng('composter_top');
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.min(x, y, 15 - x, 15 - y);
      // the tops of the walls two pixels wide (the middle is never seen)
      if (d > 1) setPx(t, x, y, pal[1]);
      else setPx(t, x, y, r.chance(0.25) ? pal[3] : d === 0 ? pal[4] : pal[5]);
    }
  for (const [x, y] of [[0, 0], [15, 0], [0, 15], [15, 15], [1, 1], [14, 1], [1, 14], [14, 14]]) setPx(t, x, y, pal[2]);
  return t;
}

export function composterBottom(): TexImage {
  return planks('composter_bottom', OAK);
}

/** vanilla block/composter_compost and composter_ready: dark rotting stuff with green bits, or white with bone meal */
export function composterContents(ready: boolean): TexImage {
  const r = rng(ready ? 'composter_ready' : 'composter_compost');
  const soil = [0x2a1d0e, 0x36260f, 0x423014, 0x4f3a19, 0x5c4420];
  const tones = quantize(fbm(r, [[4, 4, 0.5], [2, 2, 0.3]], 0.35), [1, 2, 3, 2, 1]);
  const t = paint(tones, soil);
  const specks = ready ? [0xf2eee0, 0xd8d2c0, 0xbdb6a2] : [0x55702a, 0x6d8a34, 0x7a6a2a];
  const n = ready ? 34 : 18;
  for (let i = 0; i < n; i++) {
    const x = r.nextInt(N), y = r.nextInt(N);
    setPx(t, x, y, specks[r.nextInt(specks.length)]);
    if (r.chance(0.35)) setPx(t, (x + 1) % N, y, specks[r.nextInt(specks.length)]);
  }
  return t;
}

// ---------------------------------------------------------------------------
// Smoker and blast furnace: a furnace's stone wrapped in dark logs under a sooty iron lid, and a smooth stone and
// iron furnace; their fronts glow and flicker while lit

const FURN_STONE = [0x4f4f4f, 0x5d5d5d, 0x6b6b6b, 0x777777, 0x828282, 0x8e8e8e, 0x9b9b9b];
const IRON = [0x1b1b1b, 0x292929, 0x383838, 0x484848, 0x5a5a5a, 0x6e6e6e];
const EMBER = [0x3a0c02, 0x6e1a04, 0xa8320a, 0xd8601a, 0xf09a30, 0xfcd26a];

function furnaceStone(seed: string): TexImage {
  return speckled(seed, FURN_STONE, { oct: [[4, 4, 0.4], [2, 2, 0.4]], white: 0.4, weights: [0, 0.6, 2.5, 5, 2.5, 0.6, 0], mode: 1, dark: 7, darkSize: [1, 3], light: 5, lightSize: [1, 2] });
}

/** a dark oak log lying across rows y0 .. y0 + h - 1, its bark ridged along it, lit above and shadowed below */
function logBand(t: TexImage, seed: string, y0: number, h: number): void {
  const bark = WOOD.dark_oak.bark;
  const f = fbm(rng(seed), [[8, 1, 0.5], [4, 1, 0.3]], 0.3);
  for (let y = y0; y < y0 + h; y++)
    for (let x = 0; x < N; x++) {
      let k = 1 + Math.floor(f[y * N + x] * 3.99);
      if (y === y0) k++;
      if (y === y0 + h - 1) k = 0;
      setPx(t, x, y, bark[Math.max(0, Math.min(5, k))]);
    }
}

/** a riveted iron plate over (x0, y0)-(x1, y1) inclusive: lit top and left edges, dark bottom and right */
function ironPlate(t: TexImage, seed: string, x0: number, y0: number, x1: number, y1: number, pal = IRON, rivets = false): void {
  const r = rng(seed);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      let k = 3 + (r.chance(0.3) ? (r.chance(0.5) ? 1 : -1) : 0);
      if (y === y0 || x === x0) k = 5;
      else if (y === y1 || x === x1) k = 1;
      setPx(t, x, y, pal[k]);
    }
  if (rivets) for (const [x, y] of [[x0 + 1, y0 + 1], [x1 - 1, y0 + 1], [x0 + 1, y1 - 1], [x1 - 1, y1 - 1]]) setPx(t, x, y, pal[5]);
}

/** a glowing slot (or the dark of an unlit one) over (x0, y0)-(x1, y1): brightest low down, where the fire is */
function glowSlot(t: TexImage, x0: number, y0: number, x1: number, y1: number, lit: boolean, r: Rand, flicker: number): void {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!lit) {
        setPx(t, x, y, y === y0 ? IRON[0] : 0x121212);
        continue;
      }
      const depth = (y - y0 + 1) / (y1 - y0 + 1);
      const k = Math.round(1 + depth * 3 + flicker + (r.chance(0.3) ? r.chance(0.5) ? 1 : -1 : 0));
      setPx(t, x, y, EMBER[Math.max(0, Math.min(5, k))]);
    }
}

/** three frames of a glowing front, flickering (vanilla *_front_on is animated) */
function flickering(gen: (frame: number) => TexImage): AnimTex {
  return anim(N, N, 3, 3, gen);
}

export function smokerSide(): TexImage {
  const t = furnaceStone('smoker_side');
  logBand(t, 'smoker_side_log_top', 0, 4);
  logBand(t, 'smoker_side_log_bottom', 12, 4);
  return t;
}

export function smokerFront(lit: boolean, frame = 0): TexImage {
  const t = smokerSide();
  // the hatch: an iron frame, and a grate over the fire behind it
  ironPlate(t, 'smoker_front_hatch', 3, 4, 12, 11, IRON, true);
  const r = rng('smoker_front_glow', frame);
  glowSlot(t, 5, 6, 10, 9, lit, r, frame === 1 ? 0.6 : frame === 2 ? -0.4 : 0);
  for (const x of [6, 8]) for (let y = 6; y <= 9; y++) setPx(t, x + 1, y, lit ? mixC(IRON[2], EMBER[2], 0.3) : IRON[2]);
  return t;
}

export function smokerTop(): TexImage {
  const t = img();
  ironPlate(t, 'smoker_top', 0, 0, 15, 15, IRON, true);
  // the flue: a round vent in the middle, sooty all round
  for (let y = 4; y <= 11; y++)
    for (let x = 4; x <= 11; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d < 2.6) setPx(t, x, y, (x + y) % 2 === 0 ? IRON[2] : 0x0e0e0e);
      else if (d < 3.6) setPx(t, x, y, IRON[1]);
      else if (d < 4.3) setPx(t, x, y, mixC(getPx(t, x, y), 0x101010, 0.4));
    }
  return t;
}

export function smokerBottom(): TexImage {
  return furnaceStone('smoker_bottom');
}

const BLAST_IRON = [0x2e2e30, 0x3e3e42, 0x505054, 0x626266, 0x76767a, 0x8c8c90];

export function blastFurnaceSide(): TexImage {
  const t = smoothStone();
  // two riveted iron plates in the smooth stone frame
  ironPlate(t, 'blast_furnace_side_a', 2, 2, 13, 7, BLAST_IRON, true);
  ironPlate(t, 'blast_furnace_side_b', 2, 8, 13, 13, BLAST_IRON, true);
  return t;
}

export function blastFurnaceFront(lit: boolean, frame = 0): TexImage {
  const t = smoothStone();
  ironPlate(t, 'blast_furnace_front', 2, 2, 13, 13, BLAST_IRON, true);
  // three vents across the door
  const r = rng('blast_furnace_front_glow', frame);
  for (const y of [5, 8, 11]) {
    glowSlot(t, 4, y - 1, 11, y, lit, r, frame === 1 ? 0.6 : frame === 2 ? -0.4 : 0);
    for (let x = 4; x <= 11; x++) setPx(t, x, y + 1, mixC(getPx(t, x, y + 1), BLAST_IRON[5], 0.4));
  }
  return t;
}

export function blastFurnaceTop(): TexImage {
  const t = smoothStone();
  ironPlate(t, 'blast_furnace_top', 2, 2, 13, 13, BLAST_IRON);
  // the grate over the hearth
  for (let y = 4; y <= 11; y++)
    for (let x = 4; x <= 11; x++) setPx(t, x, y, (x % 2 === 0) !== (y % 2 === 0) ? BLAST_IRON[2] : 0x141414);
  return t;
}

// ---------------------------------------------------------------------------
// Cauldron: dark cast iron, a lighter lip round the rim, four stubby legs (the side's bottom corners)

const CAST = [0x1c1c1c, 0x282828, 0x333333, 0x3e3e3e, 0x4a4a4a, 0x595959, 0x6d6d6d];

function castIron(seed: string): TexImage {
  const tones = quantize(fbm(rng(seed), [[8, 8, 0.5], [4, 4, 0.3]], 0.2), [1, 3, 7, 3, 1]);
  return paint(tones.map((k) => k + 1), CAST);
}

export function cauldronSide(): TexImage {
  const t = castIron('cauldron_side');
  for (let x = 0; x < N; x++) {
    // the lip, and its shadow
    setPx(t, x, 0, CAST[6]);
    setPx(t, x, 1, CAST[5]);
    setPx(t, x, 2, CAST[1]);
    // the belly's band, low down
    setPx(t, x, 10, mixC(getPx(t, x, 10), CAST[5], 0.5));
    setPx(t, x, 11, mixC(getPx(t, x, 11), CAST[0], 0.4));
    setPx(t, x, 12, CAST[1]);
  }
  // the legs (the bottom three rows at each end; nothing between them)
  for (let y = 13; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (x >= 4 && x < 12) clear(t, x, y);
      else if (x === 0 || x === 12) setPx(t, x, y, CAST[5]);
      else if (x === 3 || x === 15) setPx(t, x, y, CAST[1]);
    }
  return t;
}

export function cauldronTop(): TexImage {
  const t = img();
  const r = rng('cauldron_top');
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.min(x, y, 15 - x, 15 - y);
      // the rim, two pixels wide (the middle is open)
      if (d > 1) continue;
      setPx(t, x, y, d === 0 ? CAST[5] : r.chance(0.3) ? CAST[5] : CAST[6]);
    }
  return t;
}

export function cauldronInner(): TexImage {
  const t = castIron('cauldron_inner');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) setPx(t, x, y, mulC(getPx(t, x, y), 0.85));
  return t;
}

export function cauldronBottom(): TexImage {
  const t = castIron('cauldron_bottom');
  // the soles of the legs at the corners catch a little light
  for (const [x0, y0] of [[0, 0], [12, 0], [0, 12], [12, 12]])
    for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + 4; x++) setPx(t, x, y, mixC(getPx(t, x, y), CAST[5], 0.35));
  return t;
}

// ---------------------------------------------------------------------------
// Workstations: lectern (oak), cartography table (dark oak and paper), fletching table (birch), smithing table
// (dark oak and iron), loom, stonecutter (stone, iron and a spinning saw), brewing stand

/** a table's side: the top's edge along rows 0-1, legs down both sides, boards between */
function tableSide(seed: string, w: WoodDef, rim: number, rimShade: number): TexImage {
  const pal = w.wood;
  const t = planks(seed, w);
  for (let x = 0; x < N; x++) {
    setPx(t, x, 0, rim);
    setPx(t, x, 1, rimShade);
    setPx(t, x, 2, pal[0]);
  }
  for (let y = 3; y < N; y++) {
    setPx(t, 0, y, pal[1]);
    setPx(t, 1, y, pal[4]);
    setPx(t, 14, y, pal[2]);
    setPx(t, 15, y, pal[1]);
  }
  for (let x = 0; x < N; x++) setPx(t, x, 15, pal[1]);
  return t;
}

/** a bevelled frame round the edge of `t` (lit top and left, shadowed bottom and right) */
function frame(t: TexImage, hi: number, lo: number, inset = 0): void {
  const a = inset, b = 15 - inset;
  for (let i = a; i <= b; i++) {
    setPx(t, i, a, hi);
    setPx(t, a, i, hi);
    setPx(t, i, b, lo);
    setPx(t, b, i, lo);
  }
}

const OAKW = WOOD.oak;
const DARK_OAK = WOOD.dark_oak;
const BIRCH = WOOD.birch;

export function lecternTop(): TexImage {
  const pal = OAKW.wood;
  const t = planks('lectern_top', OAKW);
  frame(t, pal[1], pal[0]);
  frame(t, pal[5], pal[2], 1);
  return t;
}

export function lecternSides(): TexImage {
  const pal = OAKW.wood;
  const t = planks('lectern_sides', OAKW);
  // rows 0-7: the reading board's edges (its front, then its sides and back); rows 8-15: the post's sides
  for (let x = 0; x < N; x++) {
    setPx(t, x, 0, pal[5]);
    setPx(t, x, 3, pal[1]);
    setPx(t, x, 4, pal[4]);
    setPx(t, x, 7, pal[0]);
    setPx(t, x, 8, pal[1]);
    setPx(t, x, 15, pal[1]);
  }
  for (let y = 8; y < N; y++) {
    setPx(t, 2, y, pal[1]);
    setPx(t, 14, y, pal[1]);
  }
  return t;
}

export function lecternFront(): TexImage {
  const pal = OAKW.wood;
  const t = staves('lectern_front', pal, 4);
  // the post's front (x 0-7, rows 0-12) and back (x 8-15, rows 3-15), a frame round each
  for (let y = 0; y < 13; y++) {
    setPx(t, 0, y, pal[4]);
    setPx(t, 7, y, pal[1]);
  }
  for (let x = 0; x < 8; x++) {
    setPx(t, x, 0, pal[5]);
    setPx(t, x, 12, pal[1]);
  }
  for (let y = 3; y < N; y++) {
    setPx(t, 8, y, pal[4]);
    setPx(t, 15, y, pal[1]);
  }
  for (let x = 8; x < N; x++) {
    setPx(t, x, 3, pal[5]);
    setPx(t, x, 15, pal[1]);
  }
  return t;
}

export function lecternBase(): TexImage {
  const pal = OAKW.wood;
  const t = planks('lectern_base', OAKW);
  frame(t, pal[4], pal[1]);
  // (rows 6-7 and 14-15 double as the base's edges)
  for (let x = 0; x < N; x++) {
    setPx(t, x, 6, pal[4]);
    setPx(t, x, 7, pal[1]);
    setPx(t, x, 14, pal[4]);
  }
  return t;
}

const PAPER = [0xb8a67c, 0xcdbd92, 0xdccda4, 0xe8dcb8, 0xf2e9ca];

export function cartographyTop(): TexImage {
  const pal = DARK_OAK.wood;
  const r = rng('cartography_table_top');
  const t = img();
  // a sheet of map on a dark oak frame
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.min(x, y, 15 - x, 15 - y);
      if (d < 2) setPx(t, x, y, d === 0 ? pal[1] : pal[3]);
      else setPx(t, x, y, PAPER[2 + (r.chance(0.25) ? 1 : 0)]);
    }
  sprite(
    [
      '..gggg.....',
      '.gGGGgg..b.',
      '.gGGggg.bb.',
      '..gg.l..bbb',
      '....ll..bb.',
      '.....llll..',
      '..s.....l..',
      '.sss....l.g',
      '..s....ggGg',
      '.......gGGg',
      '........gg.',
    ],
    { g: 0x7c9a4a, G: 0x5d7c34, b: 0x5d86b8, l: 0x8a6a3c, s: 0x9c8a6a },
    t, 2, 2,
  );
  // the paper's edge, lit where it lifts off the frame
  for (let i = 2; i < 14; i++) {
    setPx(t, i, 2, PAPER[4]);
    setPx(t, 2, i, PAPER[4]);
    setPx(t, i, 13, PAPER[0]);
    setPx(t, 13, i, PAPER[0]);
  }
  return t;
}

export function cartographySide(kind: 1 | 2 | 3): TexImage {
  const t = tableSide(`cartography_table_side${kind}`, DARK_OAK, PAPER[3], PAPER[1]);
  if (kind === 1) {
    // a rolled map tucked under the top
    sprite(['.pppppppp.', 'pPPPPPPPPp', 'pPPPPPPPPp', '.pppppppp.'], { p: PAPER[1], P: PAPER[3] }, t, 3, 4);
  } else if (kind === 2) {
    // an ink bottle and a quill
    sprite(['......w', '.....w.', '..kk.w.', '.kKKkw.', '.kKKk..', '.kkkk..'], { k: 0x1c1c28, K: 0x3a3a58, w: 0xf0f0f0 }, t, 5, 6);
  } else {
    // a compass hung on a nail
    sprite(['.ii.', 'iRwi', 'iwRi', '.ii.'], { i: 0x8a8a8a, R: 0xc02020, w: 0xdadada }, t, 6, 5);
  }
  return t;
}

export function fletchingTop(): TexImage {
  const pal = BIRCH.wood;
  const t = planks('fletching_table_top', BIRCH);
  frame(t, pal[5], pal[1]);
  // an arrow laid across the table, fletched and tipped with flint
  sprite(
    [
      '............ff',
      '...........fFf',
      '..........sff.',
      '.........s....',
      '........s.....',
      '.......s......',
      '......s.......',
      '.....s........',
      '....s.........',
      '...s..........',
      '.kk...........',
      'kKk...........',
      'kk............',
    ],
    { s: 0x7a5a30, f: 0xe8e8e8, F: 0xc0c0c0, k: 0x3a3a3a, K: 0x6a6a6a },
    t, 1, 1,
  );
  return t;
}

export function fletchingFront(): TexImage {
  const t = tableSide('fletching_table_front', BIRCH, BIRCH.wood[5], BIRCH.wood[3]);
  // feathered shafts and flint heads pinned up on the front
  sprite(
    ['.f..f..f.', 'fFffFffFf', '.s..s..s.', '.s..s..s.', '.s..s..s.', '.k..k..k.', 'kKk.kKk.k'],
    { f: 0xe8e8e8, F: 0xb0b0b0, s: 0x7a5a30, k: 0x3a3a3a, K: 0x6a6a6a },
    t, 3, 4,
  );
  return t;
}

export function fletchingSide(): TexImage {
  return tableSide('fletching_table_side', BIRCH, BIRCH.wood[5], BIRCH.wood[3]);
}

const SMITH_IRON = [0x202024, 0x2e2e33, 0x3c3c42, 0x4c4c53, 0x5e5e66, 0x74747c];

export function smithingTop(): TexImage {
  const t = img();
  ironPlate(t, 'smithing_table_top', 0, 0, 15, 15, SMITH_IRON, true);
  // the working face across the middle, with a hardy hole
  for (let y = 5; y <= 10; y++) for (let x = 2; x <= 13; x++) setPx(t, x, y, y === 5 ? SMITH_IRON[5] : y === 10 ? SMITH_IRON[1] : SMITH_IRON[3]);
  for (const [x, y] of [[11, 7], [12, 7], [11, 8], [12, 8]]) setPx(t, x, y, 0x101012);
  return t;
}

export function smithingFront(): TexImage {
  const t = tableSide('smithing_table_front', DARK_OAK, SMITH_IRON[5], SMITH_IRON[2]);
  // a hammer and tongs hung on the front
  sprite(
    ['.iiI...t..t.', '.iiI...t..t.', '..w.....tt..', '..w.....tt..', '..w....t..t.', '..w....t..t.'],
    { i: SMITH_IRON[4], I: SMITH_IRON[2], w: 0x6a4a2a, t: SMITH_IRON[5] },
    t, 2, 5,
  );
  return t;
}

export function smithingSide(): TexImage {
  const t = tableSide('smithing_table_side', DARK_OAK, SMITH_IRON[5], SMITH_IRON[2]);
  // an iron band round the middle
  for (let x = 0; x < N; x++) {
    setPx(t, x, 8, SMITH_IRON[4]);
    setPx(t, x, 9, SMITH_IRON[2]);
  }
  return t;
}

export function smithingBottom(): TexImage {
  return planks('smithing_table_bottom', DARK_OAK);
}

const LOOM_WOOD = WOOD.oak;
const YARN = [0xc8c0b0, 0xe8e2d4, 0xfaf6ec];

export function loomTop(): TexImage {
  const pal = LOOM_WOOD.wood;
  const t = planks('loom_top', LOOM_WOOD);
  frame(t, pal[4], pal[1]);
  // the warp threads running over the beam
  for (let y = 5; y <= 10; y++) for (let x = 1; x < 15; x++) if (x % 2 === 1) setPx(t, x, y, YARN[y === 5 ? 2 : 1]);
  for (let x = 1; x < 15; x++) {
    setPx(t, x, 4, pal[1]);
    setPx(t, x, 11, pal[1]);
  }
  return t;
}

export function loomFront(): TexImage {
  const pal = LOOM_WOOD.wood;
  const t = tableSide('loom_front', LOOM_WOOD, pal[5], pal[3]);
  // the heddles: threads strung top to bottom in the frame, a half-woven cloth low down
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) setPx(t, x, y, x % 2 === 1 ? YARN[1] : mixC(getPx(t, x, y), 0x000000, 0.35));
  for (let y = 10; y < 13; y++) for (let x = 3; x < 13; x++) setPx(t, x, y, (x + y) % 2 === 0 ? 0xb03030 : 0xd84848);
  for (let x = 2; x < 14; x++) {
    setPx(t, x, 3, pal[1]);
    setPx(t, x, 13, pal[1]);
  }
  return t;
}

export function loomSide(): TexImage {
  const pal = LOOM_WOOD.wood;
  const t = tableSide('loom_side', LOOM_WOOD, pal[5], pal[3]);
  // the frame's crossbar, and a spool of yarn on its peg
  for (let x = 2; x < 14; x++) setPx(t, x, 8, pal[1]);
  sprite(['.yyy.', 'yYYYy', 'yYYYy', '.yyy.'], { y: YARN[0], Y: YARN[2] }, t, 6, 4);
  return t;
}

export function loomBottom(): TexImage {
  return planks('loom_bottom', LOOM_WOOD);
}

export function stonecutterTop(): TexImage {
  const t = img();
  ironPlate(t, 'stonecutter_top', 0, 0, 15, 15, IRON.map((c) => mulC(c, 1.6)), true);
  // the slot the blade comes up through
  for (let x = 1; x < 15; x++) {
    setPx(t, x, 7, 0x0c0c0c);
    setPx(t, x, 8, 0x181818);
  }
  return t;
}

export function stonecutterSide(): TexImage {
  // (rows 7-15 are used: the iron top's edge, then stone)
  const t = stone('stonecutter_side');
  for (let x = 0; x < N; x++) {
    setPx(t, x, 7, 0x8c8c8c);
    setPx(t, x, 8, 0x5a5a5a);
    setPx(t, x, 9, 0x3e3e3e);
  }
  return t;
}

export function stonecutterBottom(): TexImage {
  return stone('stonecutter_bottom');
}

/** the saw blade: the top half of a spinning disc (rows 9-15 show), its teeth running round (vanilla's is animated) */
export function stonecutterSaw(): AnimTex {
  const STEEL = [0x5a5a5a, 0x7c7c7c, 0xa0a0a0, 0xc4c4c4, 0xe4e4e4];
  return anim(N, N, 4, 1, (fr) => {
    const t = img();
    for (let y = 9; y < N; y++)
      for (let x = 1; x < 15; x++) {
        const dx = x + 0.5 - 8, dy = y + 0.5 - 16.5;
        const d = Math.hypot(dx, dy);
        if (d > 7.2) continue;
        if (d > 6) {
          // teeth every other step round the rim, moving on a little each frame
          const a = Math.atan2(dy, dx);
          if (Math.floor(((a + Math.PI) / (2 * Math.PI)) * 24 + fr * 0.5) % 2) setPx(t, x, y, STEEL[4]);
          continue;
        }
        setPx(t, x, y, d < 1.5 ? STEEL[0] : STEEL[1 + ((Math.floor(d) + fr) % 3)]);
      }
    return t;
  });
}

/** the brewing stand: its blaze-rod post up the middle, an arm each side, a bottle hung from the left one */
export function brewingStand(): TexImage {
  const t = img();
  const ROD = [0x8c4a08, 0xc87c10, 0xf0a818, 0xffd84a, 0xfff0a0];
  for (let y = 2; y < N; y++) {
    setPx(t, 7, y, ROD[y % 4 === 0 ? 3 : 2]);
    setPx(t, 8, y, ROD[y % 4 === 2 ? 1 : 0]);
  }
  setPx(t, 7, 1, ROD[4]);
  setPx(t, 8, 1, ROD[3]);
  const ARM = [0x3c3c3c, 0x6a6a6a, 0x8a8a8a];
  for (let x = 2; x < 7; x++) setPx(t, x, 5, ARM[x === 2 ? 2 : 1]);
  for (let x = 9; x < 14; x++) setPx(t, x, 5, ARM[x === 13 ? 2 : 1]);
  // left: a glass bottle hung from its arm
  sprite(['.gg.', '.gg.', 'gGGg', 'gWGg', 'gGGg', '.gg.'], { g: 0xa8c0d4, G: 0xd0e4f0, W: 0xf8fcff }, t, 1, 7);
  setPx(t, 2, 6, ARM[0]);
  setPx(t, 3, 6, ARM[0]);
  // right: the empty holder, a little ring
  for (const [x, y] of [[12, 6], [14, 6], [12, 7], [14, 7], [13, 8]]) setPx(t, x, y, ARM[1]);
  return t;
}

export function brewingStandBase(): TexImage {
  return speckled('brewing_stand_base', FURN_STONE, { oct: [[4, 4, 0.4], [2, 2, 0.4]], white: 0.4, weights: [0, 0.6, 2.5, 5, 2.5, 0.6, 0], mode: 1, dark: 5, darkSize: [1, 2], light: 4, lightSize: [1, 2] });
}

// ---------------------------------------------------------------------------
// Flower pot (vanilla block/flower_pot: only the middle is drawn — the rim seen from above, a ring round the square
// from 5 to 10, and under it, rows 10 to 15, the pot's side; the rest is clear)

const POT = [0x4a2416, 0x62301e, 0x743a25, 0x86442c, 0x985034, 0xaa5c3d, 0xbc6c4b];

export function flowerPot(): TexImage {
  const r = rng('flower_pot');
  const t = img();
  // the rim from above, lit along its far and left edges; inside it, the dark of the pot
  for (let y = 5; y <= 10; y++)
    for (let x = 5; x <= 10; x++) {
      if (x > 5 && x < 10 && y > 5 && y < 10) {
        setPx(t, x, y, POT[0]);
        continue;
      }
      setPx(t, x, y, POT[(x === 5 || y === 5 ? 6 : 5) - (r.chance(0.2) ? 1 : 0)]);
    }
  // the side: the bright lip of the rim, a shadow under it, the body lit on the left and darkening to its foot
  for (let y = 10; y <= 15; y++)
    for (let x = 5; x <= 10; x++) {
      let k = y === 10 ? 6 : y === 11 || y === 15 ? 2 : 4;
      if (y > 11 && y < 15) k += x === 6 ? 1 : x === 10 ? -1 : 0;
      if (y > 11 && r.chance(0.15)) k += r.chance(0.5) ? 1 : -1;
      setPx(t, x, y, POT[Math.max(0, Math.min(6, k))]);
    }
  return t;
}

export function registerVillageTextures(T: Reg): void {
  T['bell_bottom'] = bellBottom;
  T['barrel_side'] = barrelSide;
  T['barrel_top'] = () => barrelTop(false);
  T['barrel_top_open'] = () => barrelTop(true);
  T['barrel_bottom'] = barrelBottom;
  T['composter_side'] = composterSide;
  T['composter_top'] = composterTop;
  T['composter_bottom'] = composterBottom;
  T['composter_compost'] = () => composterContents(false);
  T['composter_ready'] = () => composterContents(true);
  T['smoker_side'] = smokerSide;
  T['smoker_front'] = () => smokerFront(false);
  T['smoker_front_on'] = () => flickering((i) => smokerFront(true, i));
  T['smoker_top'] = smokerTop;
  T['smoker_bottom'] = smokerBottom;
  T['blast_furnace_side'] = blastFurnaceSide;
  T['blast_furnace_front'] = () => blastFurnaceFront(false);
  T['blast_furnace_front_on'] = () => flickering((i) => blastFurnaceFront(true, i));
  T['blast_furnace_top'] = blastFurnaceTop;
  T['cauldron_side'] = cauldronSide;
  T['cauldron_top'] = cauldronTop;
  T['cauldron_inner'] = cauldronInner;
  T['cauldron_bottom'] = cauldronBottom;
  T['lectern_top'] = lecternTop;
  T['lectern_sides'] = lecternSides;
  T['lectern_front'] = lecternFront;
  T['lectern_base'] = lecternBase;
  T['cartography_table_top'] = cartographyTop;
  T['cartography_table_side1'] = () => cartographySide(1);
  T['cartography_table_side2'] = () => cartographySide(2);
  T['cartography_table_side3'] = () => cartographySide(3);
  T['fletching_table_top'] = fletchingTop;
  T['fletching_table_front'] = fletchingFront;
  T['fletching_table_side'] = fletchingSide;
  T['smithing_table_top'] = smithingTop;
  T['smithing_table_front'] = smithingFront;
  T['smithing_table_side'] = smithingSide;
  T['smithing_table_bottom'] = smithingBottom;
  T['loom_top'] = loomTop;
  T['loom_front'] = loomFront;
  T['loom_side'] = loomSide;
  T['loom_bottom'] = loomBottom;
  T['stonecutter_top'] = stonecutterTop;
  T['stonecutter_side'] = stonecutterSide;
  T['stonecutter_bottom'] = stonecutterBottom;
  T['stonecutter_saw'] = stonecutterSaw;
  T['brewing_stand'] = brewingStand;
  T['brewing_stand_base'] = brewingStandBase;
  T['flower_pot'] = flowerPot;
  for (const fl of ['', 'flowering_']) {
    T[`potted_${fl}azalea_bush_top`] = () => pottedAzaleaTop(fl !== '');
    T[`potted_${fl}azalea_bush_side`] = () => pottedAzaleaSide(fl !== '');
    T[`potted_${fl}azalea_bush_plant`] = pottedAzaleaPlant;
  }
  // (vanilla draws the potted roots separately, crimson_roots_pot and warped_roots_pot; here they are the roots)
  T['crimson_roots_pot'] = () => roots('crimson');
  T['warped_roots_pot'] = () => roots('warped');
}

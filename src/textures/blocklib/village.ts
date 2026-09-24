// The blocks of villages (vanilla block/*.png for the job sites and village furniture): the bell's particle face,
// barrel, composter, smoker, blast furnace, cauldron, lectern, the cartography / fletching / smithing tables,
// loom, stonecutter, brewing stand, flower pot and campfire.

import { TexImage, TexDef, AnimTex, img, setPx, getPx, mixC, mulC, anim, clear, Rand } from '../tex';
import { N, rng, fbm, quantize, paint, white } from './core';
import { planks, WOOD, WoodDef } from './wood';
import { speckled } from './terrain';
import { smoothStone } from './building';
import { BELL_GOLD } from '../bellBody';

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
}

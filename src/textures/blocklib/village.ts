// The blocks of villages (vanilla block/*.png for the job sites and village furniture): the bell's particle face,
// barrel, composter, smoker, blast furnace, cauldron, lectern, the cartography / fletching / smithing tables,
// loom, stonecutter, brewing stand, flower pot and campfire.

import { TexImage, TexDef, img, setPx, getPx, mixC, mulC, Rand } from '../tex';
import { N, rng, fbm, quantize, paint, white } from './core';
import { planks, WOOD, WoodDef } from './wood';
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
}

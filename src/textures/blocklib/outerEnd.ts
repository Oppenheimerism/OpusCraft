// The outer End's block textures (vanilla block/purpur_block, purpur_pillar(_top), end_rod, chorus_plant,
// chorus_flower(_dead)) and the glitter an end rod gives off (vanilla particle/glitter_0..7).

import { TexImage, TexDef, img, setPx, getPx, mixC, mulC } from '../tex';
import { N, rng, fbm, quantize, paint, noise } from './core';

type Reg = Record<string, () => TexDef>;

// ---------------------------------------------------------------------------
// Purpur: pale magenta stone, cut into little square tiles

/** purpur, dark → light */
export const PURPUR_PAL = [0x6b4a6b, 0x7e5a7e, 0x936b93, 0xa77ea7, 0xb48cb4, 0xc29bc2, 0xd1acd1];

/** a 4x4 tile: lit along the top and left, shadowed along the bottom and right, a dark seam under it */
function purpurBlock(): TexImage {
  const r = rng('purpur_block');
  const t = img();
  const h = noise(r, 8, 8);
  for (let ty = 0; ty < 4; ty++)
    for (let tx = 0; tx < 4; tx++) {
      // some tiles a shade lighter or darker than the rest
      const lift = r.chance(0.25) ? 1 : r.chance(0.2) ? -1 : 0;
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const X = tx * 4 + x, Y = ty * 4 + y;
          let k: number;
          if (x === 3 && y === 3) k = 0;
          else if (x === 3 || y === 3) k = 1;
          else if (y === 0 || x === 0) k = x === 0 && y === 0 ? 6 : 5;
          else k = h[Y * N + X] > 0.55 ? 4 : 3;
          if (k > 1) k = Math.max(2, Math.min(6, k + lift));
          setPx(t, X, Y, PURPUR_PAL[k]);
        }
    }
  // a few worn flecks
  for (let i = 0; i < 6; i++) {
    const x = r.nextInt(N), y = r.nextInt(N);
    if ((x & 3) === 3 || (y & 3) === 3) continue;
    setPx(t, x, y, mixC(getPx(t, x, y), PURPUR_PAL[2], 0.6));
  }
  return t;
}

/** The pillar's side: fluted, a groove every 4 pixels running up it, a band across its top and bottom. */
function purpurPillar(): TexImage {
  const r = rng('purpur_pillar');
  const t = img();
  const h = noise(r, 2, 8);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const m = x & 3;
      let k = m === 0 ? 5 : m === 1 ? 4 : m === 2 ? 3 : 1;
      if (m === 2 && h[y * N + x] > 0.6) k = 4;
      if (y === 0) k = m === 3 ? 2 : 6;
      else if (y === 1 || y === 14) k = m === 3 ? 0 : 2;
      else if (y === 15) k = m === 3 ? 0 : 1;
      setPx(t, x, y, PURPUR_PAL[k]);
    }
  return t;
}

/** The pillar's end: square rings round a small square middle. */
function purpurPillarTop(): TexImage {
  const r = rng('purpur_pillar_top');
  const t = img();
  const ring = [1, 5, 3, 1, 5, 3, 4, 2];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      let k = ring[e];
      // the lit side of each ring (top and left) a touch brighter, the far side darker
      const near = x === e || y === e;
      if (k >= 3) k = near ? Math.min(6, k + 1) : k;
      else if (!near) k = Math.max(0, k - 1);
      if (r.chance(0.06)) k = Math.max(0, Math.min(6, k + (r.chance(0.5) ? 1 : -1)));
      setPx(t, x, y, PURPUR_PAL[k]);
    }
  return t;
}

// ---------------------------------------------------------------------------
// End rod: a glowing white rod (0..1 x 0..14, its end at 2..3 x 0..1), on a dark foot (top 2..5 x 2..5, side row 6)

function endRod(): TexImage {
  const t = img();
  const rod = [0xfdfbf6, 0xe9e2dc];
  for (let y = 0; y < 15; y++) {
    setPx(t, 0, y, y % 5 === 2 ? 0xffffff : rod[0]);
    setPx(t, 1, y, y % 6 === 4 ? 0xd9cfc8 : rod[1]);
  }
  setPx(t, 2, 0, 0xffffff);
  setPx(t, 3, 0, 0xf4efe9);
  setPx(t, 2, 1, 0xefe8e2);
  setPx(t, 3, 1, 0xe0d8d1);
  const foot = ['abba', 'bccb', 'bccb', 'abba'];
  const fc: Record<string, number> = { a: 0x3b2c3d, b: 0x4d3a50, c: 0x5e4862 };
  foot.forEach((row, y) => [...row].forEach((ch, x) => setPx(t, 2 + x, 2 + y, fc[ch])));
  for (let x = 0; x < 4; x++) setPx(t, 2 + x, 6, x === 0 || x === 3 ? 0x2e2230 : 0x3d2e40);
  return t;
}

// ---------------------------------------------------------------------------
// Chorus: the plant a dusky purple with paler veins, the flower's pads pale lilac round a darker heart

const CHORUS_PAL = [0x3f2640, 0x4f3150, 0x5f3d60, 0x6f4a70, 0x845b85, 0x9a6f9b, 0xb087b1];

function chorusPlant(): TexImage {
  const r = rng('chorus_plant');
  const tones = quantize(fbm(r, [[8, 8, 0.4], [4, 4, 0.35], [2, 2, 0.25]], 0.35), [0.5, 1.2, 2.5, 3, 2, 1, 0.4]);
  const t = paint(tones, CHORUS_PAL);
  // pale veins wandering across it
  for (let v = 0; v < 4; v++) {
    let x = r.nextInt(N), y = r.nextInt(N);
    const len = 4 + r.nextInt(5);
    for (let i = 0; i < len; i++) {
      setPx(t, x, y, CHORUS_PAL[r.chance(0.3) ? 6 : 5]);
      if (r.chance(0.5)) x = (x + (r.chance(0.5) ? 1 : N - 1)) % N;
      else y = (y + 1) % N;
    }
  }
  // and dark pits
  for (let i = 0; i < 7; i++) setPx(t, r.nextInt(N), r.nextInt(N), CHORUS_PAL[0]);
  return t;
}

function chorusFlower(dead: boolean): TexImage {
  const r = rng(dead ? 'chorus_flower_dead' : 'chorus_flower');
  const pal = dead
    ? [0x3a2c34, 0x4a3942, 0x5b4852, 0x6d5963, 0x7f6a74, 0x917d86, 0xa39098]
    : [0x5c3b5e, 0x7a5580, 0x9a74a0, 0xb893bd, 0xcfaed2, 0xe2c9e4, 0xf1e1f2];
  const t = img();
  const h = noise(r, 4, 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      const cx = x - 7.5, cy = y - 7.5;
      const d = Math.sqrt(cx * cx + cy * cy);
      // four petals toward the corners, a darker cross between them, a dark rim
      const a = Math.abs(Math.abs(cx) - Math.abs(cy));
      let k = e === 0 ? 1 : e === 1 ? 2 : d < 2.2 ? 2 : a < 1.5 && d < 6.5 ? 3 : d < 4.5 ? 5 : 4;
      if (k >= 3 && h[y * N + x] > 0.7) k = Math.min(6, k + 1);
      if (k >= 3 && r.chance(0.08)) k--;
      setPx(t, x, y, pal[k]);
    }
  // the heart
  for (const [x, y] of [[7, 7], [8, 8]]) setPx(t, x, y, pal[0]);
  if (dead) for (let i = 0; i < 8; i++) setPx(t, r.nextInt(N), r.nextInt(N), mulC(pal[2], 0.85));
  return t;
}

// ---------------------------------------------------------------------------
// Glitter (vanilla particle/glitter_0..7): a white sparkle, from a single point to a four-pointed star

const GLITTER: string[][] = [
  ['#'],
  ['.o.', 'o#o', '.o.'],
  ['.o.', 'o#o', '.o.'],
  ['..o..', '..#..', 'o###o', '..#..', '..o..'],
  ['..o..', '.o#o.', 'o###o', '.o#o.', '..o..'],
  ['...o...', '...#...', '..o#o..', 'o##W##o', '..o#o..', '...#...', '...o...'],
  ['...o...', '...#...', '..###..', 'o##W##o', '..###..', '...#...', '...o...'],
  ['....o....', '....#....', '...o#o...', '..o###o..', 'o###W###o', '..o###o..', '...o#o...', '....#....', '....o....'],
];

export function glitterTextures(): Record<string, () => TexImage> {
  const out: Record<string, () => TexImage> = {};
  GLITTER.forEach((rows, i) => {
    out[`glitter_${i}`] = () => {
      const t = img(9, 9);
      const o = Math.floor((9 - rows.length) / 2);
      rows.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (ch === '#') setPx(t, o + x, o + y, 0xffffff);
          else if (ch === 'W') setPx(t, o + x, o + y, 0xffffff);
          else if (ch === 'o') setPx(t, o + x, o + y, 0xbdbdbd);
        }),
      );
      return t;
    };
  });
  return out;
}

export function registerOuterEndTextures(T: Reg): void {
  T['purpur_block'] = purpurBlock;
  T['purpur_pillar'] = purpurPillar;
  T['purpur_pillar_top'] = purpurPillarTop;
  T['end_rod'] = endRod;
  T['chorus_plant'] = chorusPlant;
  T['chorus_flower'] = () => chorusFlower(false);
  T['chorus_flower_dead'] = () => chorusFlower(true);
}

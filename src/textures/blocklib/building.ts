// Crafted / building materials: bricks, sandstone, metal blocks, wool,
// terracotta, concrete...

import { TexImage, img, setPx, getPx, cloneImg, mixC, mulC, rect } from '../tex';
import { N, rng, wrap, noise, white, fbm, equalize, quantize, paint, lum, grayOf } from './core';
import { speckled, rockTex } from './terrain';

// ---------------------------------------------------------------------------
// Stone bricks

export const SBRICK_PAL = [0x4f4f4f, 0x5f5f5f, 0x6e6e6e, 0x7a7a7a, 0x858585, 0x919191, 0xa0a0a0];

/** Large stone bricks: 2 rows of 16x8 bricks in running bond. */
export function stoneBricks(seed = 'stone_bricks', pal = SBRICK_PAL): TexImage {
  const r = rng(seed);
  const t = speckled(seed, pal, { oct: [[4, 4, 0.4], [2, 2, 0.4]], white: 0.4, weights: [0, 0.5, 2.5, 5, 2.5, 0.4, 0], mode: 1, dark: 6, darkSize: [1, 3], light: 4, lightSize: [1, 2] });
  const mortar = pal[0], shadow = pal[1], hi = pal[6], hi2 = pal[5];
  for (let y = 0; y < N; y++) {
    const row = y >> 3, ly = y & 7;
    const jx = row === 0 ? 15 : 7; // vertical joint
    for (let x = 0; x < N; x++) {
      const lx = wrap(x - jx - 1); // 0 = first column after joint
      if (ly === 7 || x === jx) setPx(t, x, y, r.chance(0.2) ? shadow : mortar);
      else if (ly === 0 || lx === 0) setPx(t, x, y, r.chance(0.25) ? hi2 : hi);
      else if (ly === 6 || lx === 14) setPx(t, x, y, mixC(getPx(t, x, y), shadow, 0.5));
    }
  }
  return t;
}

export function mossOver(t: TexImage, seed: string, cover: number, o: { pal?: number[]; bottomBias?: number } = {}): TexImage {
  const pal = o.pal ?? [0x3f5a24, 0x4b6b2b, 0x587c33, 0x668c3c, 0x76a047];
  const r = rng(seed);
  const f = fbm(r, [[8, 8, 0.4], [4, 4, 0.4], [2, 2, 0.2]], 0.25);
  const out = cloneImg(t);
  const bb = o.bottomBias ?? 0;
  const g = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const y = (i / N) | 0;
    // mortar/dark pixels attract moss
    const c = getPx(t, i % N, y);
    g[i] = f[i] + (1 - lum(c)) * 0.35 + (bb * ((y & 7) - 3.5)) / 7;
  }
  const eq = equalize(g);
  const sh = noise(r, 2, 2);
  for (let i = 0; i < N * N; i++) {
    if (eq[i] < 1 - cover) continue;
    const x = i % N, y = (i / N) | 0;
    const depth = (eq[i] - (1 - cover)) / cover; // 0 edge .. 1 center
    let k = depth < 0.2 ? 1 : depth < 0.5 ? 2 : 3;
    if (sh[i] > 0.7) k++;
    if (sh[i] < 0.25) k--;
    setPx(out, x, y, pal[Math.max(0, Math.min(pal.length - 1, k))]);
  }
  // highlight moss pixels whose upper neighbour is not moss
  return out;
}

export function crackedStoneBricks(): TexImage {
  const t = stoneBricks('cracked_stone_bricks');
  const d = 0x444444, m = 0x5c5c5c;
  const cracks: [number, number][][] = [
    [[2, 1], [3, 2], [3, 3], [4, 4], [4, 5], [5, 6]],
    [[10, 2], [9, 3], [9, 4], [10, 5]],
    [[12, 9], [12, 10], [13, 11], [13, 12], [14, 13]],
    [[4, 10], [5, 11], [5, 12], [4, 13]],
  ];
  for (const c of cracks)
    c.forEach(([x, y], i) => {
      setPx(t, x, y, i % 3 === 1 ? m : d);
      setPx(t, x + 1, y, mixC(getPx(t, x + 1, y), 0xa8a8a8, 0.35));
    });
  return t;
}

export function chiseledStoneBricks(): TexImage {
  const pal = SBRICK_PAL;
  const t = speckled('chiseled_stone_bricks', pal, { oct: [[4, 4, 0.4], [2, 2, 0.4]], white: 0.35, weights: [0, 0.4, 2.5, 5, 2.5, 0.4, 0], mode: 1, dark: 3, light: 2 });
  const hi = pal[6], lo = pal[0], mid = pal[1];
  // outer frame
  for (let i = 0; i < N; i++) {
    setPx(t, i, 0, hi); setPx(t, 0, i, hi);
    setPx(t, i, 15, lo); setPx(t, 15, i, lo);
    setPx(t, i, 1, mixC(getPx(t, i, 1), hi, 0.3)); setPx(t, 1, i, mixC(getPx(t, 1, i), hi, 0.3));
    setPx(t, i, 14, mixC(getPx(t, i, 14), lo, 0.4)); setPx(t, 14, i, mixC(getPx(t, 14, i), lo, 0.4));
  }
  // carved ring (inset square with rounded corners)
  for (let i = 4; i < 12; i++) {
    setPx(t, i, 3, lo); setPx(t, 3, i, lo);
    setPx(t, i, 12, hi); setPx(t, 12, i, hi);
    setPx(t, i, 4, mid); setPx(t, 4, i, mid);
  }
  setPx(t, 3, 3, pal[3]); setPx(t, 12, 12, pal[3]); setPx(t, 12, 3, pal[3]); setPx(t, 3, 12, pal[3]);
  // centre boss
  rect(t, 6, 6, 4, 4, pal[4]);
  for (let i = 6; i < 10; i++) {
    setPx(t, i, 6, hi); setPx(t, 6, i, hi);
    setPx(t, i, 9, mid); setPx(t, 9, i, mid);
  }
  return t;
}

export function smoothStone(): TexImage {
  const pal = [0x8a8a8a, 0x939393, 0x9a9a9a, 0x9f9f9f, 0xa5a5a5, 0xababab, 0xb3b3b3];
  const t = speckled('smooth_stone', pal, { oct: [[8, 8, 0.5], [4, 4, 0.3]], white: 0.25, weights: [0, 0.3, 2, 6, 2, 0.3, 0], mode: 1, dark: 3, darkSize: [1, 2], light: 2, lightSize: [1, 2], darkTone: 2, lightTone: 4 });
  for (let i = 0; i < N; i++) {
    setPx(t, i, 0, 0xb9b9b9);
    setPx(t, i, 15, 0x747474);
    setPx(t, 0, i, i === 15 ? 0x747474 : 0xafafaf);
    setPx(t, 15, i, i === 0 ? 0xafafaf : 0x7c7c7c);
  }
  return t;
}

const CLAY_BRICKS = [
  [0x773428, 0x8a4031, 0x96493a, 0xa25243, 0xaf6050],
  [0x70302a, 0x833b31, 0x8f4439, 0x9a4d41, 0xa7594d],
  [0x7b3a2f, 0x8e473b, 0x995043, 0xa55b4d, 0xb46a5b],
];
const CLAY_MORTAR = [0x9a948c, 0xaaa49c, 0x86817a];

/** the Nether's fired netherrack bricks: dark maroon, set in near-black mortar */
export const NETHER_BRICKS = [
  [0x251014, 0x2f161b, 0x381b21, 0x422127, 0x502a30],
  [0x2a1318, 0x34191e, 0x3d1e24, 0x48252b, 0x562e35],
  [0x231013, 0x2c1519, 0x351a1f, 0x3f2026, 0x4c282e],
];
export const NETHER_MORTAR = [0x120709, 0x1a0b0e, 0x0d0506];
/** red nether bricks: nether wart fired in, a deep blood red */
export const RED_NETHER_BRICKS = [
  [0x3a0507, 0x480709, 0x55090c, 0x620d10, 0x731417],
  [0x36050a, 0x44080b, 0x520a0e, 0x5e0e12, 0x6e1519],
  [0x3d0608, 0x4b080a, 0x590b0d, 0x671012, 0x781719],
];
export const RED_NETHER_MORTAR = [0x220304, 0x2c0405, 0x180203];

/** Bricks: 4 rows of 8x4 bricks set in mortar (red clay ones by default). */
export function bricks(seed = 'bricks', brickCols = CLAY_BRICKS, mortar = CLAY_MORTAR): TexImage {
  const r = rng(seed);
  const t = img();
  const nz = white(r);
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4;
    const off = row % 2 ? 4 : 0;
    for (let b = 0; b < 2; b++) {
      const pal = brickCols[r.nextInt(3)];
      for (let yy = 0; yy < 3; yy++)
        for (let xx = 0; xx < 7; xx++) {
          const x = wrap(b * 8 + off + xx), y = y0 + yy;
          const i = y * N + x;
          let k = 2;
          if (yy === 0) k = 3;
          if (yy === 2) k = 1;
          if (xx === 0 && yy < 2) k = Math.max(k, 3);
          if (xx === 6) k = Math.min(k, 1);
          if (nz[i] > 0.85) k++;
          else if (nz[i] < 0.12) k--;
          if (yy === 0 && xx > 0 && xx < 6 && nz[i] > 0.7) k = 4;
          setPx(t, x, y, pal[Math.max(0, Math.min(4, k))]);
        }
      // vertical mortar
      for (let yy = 0; yy < 3; yy++) setPx(t, wrap(b * 8 + off + 7), y0 + yy, mortar[r.chance(0.3) ? 2 : 0]);
    }
    for (let x = 0; x < N; x++) setPx(t, x, y0 + 3, mortar[r.chance(0.35) ? 1 : r.chance(0.3) ? 2 : 0]);
  }
  return t;
}

/** cracked nether bricks: the same bricks split by dark cracks, a few of them chipped paler along the break */
export function crackedNetherBricks(): TexImage {
  const t = bricks('cracked_nether_bricks', NETHER_BRICKS, NETHER_MORTAR);
  const d = 0x0b0405, e = 0x5c3238;
  const cracks: [number, number][][] = [
    [[3, 0], [3, 1], [4, 2], [4, 4], [5, 5], [5, 6]],
    [[11, 4], [10, 5], [10, 6], [11, 8], [12, 9]],
    [[6, 9], [7, 10], [7, 12], [6, 13], [6, 14]],
    [[13, 12], [14, 13], [14, 14], [15, 15]],
  ];
  for (const c of cracks)
    c.forEach(([x, y]) => {
      setPx(t, x, y, d);
      setPx(t, wrap(x + 1), y, mixC(getPx(t, wrap(x + 1), y), e, 0.45));
    });
  return t;
}

/**
 * chiseled nether bricks: a band of bricks above and below, and between them a carved block with a grim face (two
 * deep eyes over a clenched mouth), lit from the top left
 */
export function chiseledNetherBricks(): TexImage {
  const t = bricks('chiseled_nether_bricks', NETHER_BRICKS, NETHER_MORTAR);
  const pal = NETHER_BRICKS[1], hi = 0x643840, lo = 0x0f0608;
  const r = rng('chiseled_nether_bricks_face');
  for (let y = 4; y < 12; y++)
    for (let x = 0; x < N; x++) setPx(t, x, y, pal[1 + (r.chance(0.3) ? 1 : 0) + (r.chance(0.15) ? 1 : 0)]);
  for (let x = 0; x < N; x++) {
    setPx(t, x, 4, hi);
    setPx(t, x, 11, lo);
  }
  for (let y = 4; y < 12; y++) {
    setPx(t, 0, y, hi);
    setPx(t, 15, y, lo);
  }
  // the face
  for (const [x0, x1] of [[3, 6], [10, 13]]) {
    for (let x = x0; x < x1; x++) {
      setPx(t, x, 6, lo);
      setPx(t, x, 7, lo);
      setPx(t, x, 5, mixC(getPx(t, x, 5), lo, 0.4));
      setPx(t, x, 8, hi);
    }
  }
  for (let x = 5; x < 11; x++) {
    setPx(t, x, 9, lo);
    setPx(t, x, 10, x % 2 ? hi : pal[3]);
  }
  setPx(t, 7, 8, pal[4]);
  setPx(t, 8, 8, pal[4]);
  return t;
}

// ---------------------------------------------------------------------------
// Sandstone

export interface SandstonePal {
  pal: number[]; // 7 tones
  line: number;
  hi: number;
}

export const SANDSTONE: SandstonePal = { pal: [0xb9a56f, 0xc9b67f, 0xd3c28b, 0xd8c893, 0xdccd9a, 0xe2d4a5, 0xe8dcb0], line: 0xb09d67, hi: 0xece2b8 };
export const RED_SANDSTONE: SandstonePal = { pal: [0x8e4617, 0x9b4f1b, 0xa6561e, 0xae5c22, 0xb56227, 0xbd6a2e, 0xc67537], line: 0x803e13, hi: 0xcc7c3c };

export function sandstoneTop(seed: string, s: SandstonePal): TexImage {
  return speckled(seed, s.pal, { oct: [[4, 4, 0.4], [2, 2, 0.4]], white: 0.45, weights: [0, 0.6, 2, 5, 2.5, 0.8, 0], mode: 1, dark: 5, darkSize: [1, 2], light: 5, lightSize: [1, 2] });
}

export function sandstoneBottom(seed: string, s: SandstonePal): TexImage {
  const t = sandstoneTop(seed, s);
  const r = rng(seed, 2);
  // a few small cracks / pits
  for (let k = 0; k < 5; k++) {
    const x = r.nextInt(N), y = r.nextInt(N), len = 1 + r.nextInt(3);
    for (let i = 0; i < len; i++) setPx(t, x + i, y, s.pal[0]);
    setPx(t, x, y - 1, s.pal[5]);
  }
  return t;
}

/** Sandstone side: top cap band, dark line, layered body with fine horizontal strata. */
export function sandstoneSide(seed: string, s: SandstonePal): TexImage {
  const r = rng(seed);
  const f = fbm(r, [[16, 2, 0.35], [8, 1, 0.35], [4, 1, 0.3]], 0.2);
  const tones = quantize(f, [0, 0.8, 2.5, 4, 2.5, 0.8, 0]);
  const t = paint(tones, s.pal);
  for (let x = 0; x < N; x++) {
    // cap: rows 0-2 lighter, row 3 dark line
    for (let y = 0; y < 3; y++) setPx(t, x, y, mixC(getPx(t, x, y), s.hi, y === 0 ? 0.55 : 0.3));
    setPx(t, x, 3, s.line);
    setPx(t, x, 4, mixC(getPx(t, x, 4), s.pal[1], 0.4));
    // body strata lines
    if (r.chance(0.7)) setPx(t, x, 8, mixC(getPx(t, x, 8), s.pal[1], 0.5));
    if (r.chance(0.6)) setPx(t, x, 11, mixC(getPx(t, x, 11), s.pal[1], 0.5));
    // bottom band
    setPx(t, x, 13, mixC(getPx(t, x, 13), s.line, 0.55));
    for (let y = 14; y < 16; y++) setPx(t, x, y, mixC(getPx(t, x, y), s.pal[2], 0.3));
  }
  return t;
}

export function cutSandstone(seed: string, s: SandstonePal): TexImage {
  const t = speckled(seed, s.pal, { oct: [[8, 8, 0.5], [4, 4, 0.3]], white: 0.25, weights: [0, 0.3, 2, 6, 2, 0.3, 0], mode: 1, dark: 2, light: 2, darkTone: 2, lightTone: 4 });
  for (let i = 0; i < N; i++) {
    setPx(t, i, 0, s.hi);
    setPx(t, 0, i, s.hi);
    setPx(t, i, 15, s.line);
    setPx(t, 15, i, s.line);
    setPx(t, i, 7, mixC(getPx(t, i, 7), s.line, 0.7));
    setPx(t, i, 8, mixC(getPx(t, i, 8), s.hi, 0.5));
  }
  return t;
}

/** Chiseled sandstone: trim bands + creeper face. */
export function chiseledSandstone(seed: string, s: SandstonePal): TexImage {
  const t = sandstoneTop(seed, s);
  const d = s.line, dd = mulC(s.line, 0.85);
  for (let x = 0; x < N; x++) {
    setPx(t, x, 0, s.hi);
    setPx(t, x, 1, s.pal[5]);
    setPx(t, x, 2, d);
    setPx(t, x, 13, s.hi);
    setPx(t, x, 14, s.pal[5]);
    setPx(t, x, 15, d);
  }
  // creeper face (carved)
  const face = [
    '..........',
    '.##....##.',
    '.##....##.',
    '....##....',
    '...####...',
    '...####...',
    '...#..#...',
  ];
  face.forEach((row, yy) =>
    [...row].forEach((ch, xx) => {
      if (ch !== '#') return;
      const x = 3 + xx, y = 4 + yy;
      setPx(t, x, y, dd);
      // lit lower-right rim of the carving
      if (face[yy + 1]?.[xx] !== '#') setPx(t, x, y + 1, mixC(getPx(t, x, y + 1), s.hi, 0.5));
    }),
  );
  return t;
}

// ---------------------------------------------------------------------------
// Metal & mineral blocks

export function metalBlock(seed: string, pal: number[], o: { lines?: boolean; rivets?: boolean } = {}): TexImage {
  // pal: [dark edge, dark, base, light, highlight]
  const r = rng(seed);
  const f = fbm(r, [[16, 4, 0.5], [8, 2, 0.3]], 0.15);
  const tones = quantize(f, [0.8, 5, 1.2]);
  const t = paint(tones.map((k) => k + 1) as unknown as Int32Array, pal);
  const hi = pal[4], lo = pal[0];
  for (let i = 0; i < N; i++) {
    setPx(t, i, 0, hi);
    setPx(t, 0, i, hi);
    setPx(t, i, 15, lo);
    setPx(t, 15, i, lo);
  }
  for (let i = 1; i < 15; i++) {
    setPx(t, i, 1, mixC(getPx(t, i, 1), hi, 0.45));
    setPx(t, 1, i, mixC(getPx(t, 1, i), hi, 0.45));
    setPx(t, i, 14, mixC(getPx(t, i, 14), lo, 0.35));
    setPx(t, 14, i, mixC(getPx(t, 14, i), lo, 0.35));
  }
  if (o.lines !== false)
    for (const y of [5, 10]) for (let x = 2; x < 14; x++) {
      setPx(t, x, y, mixC(getPx(t, x, y), lo, 0.35));
      setPx(t, x, y + 1, mixC(getPx(t, x, y + 1), hi, 0.3));
    }
  return t;
}

export function gemBlock(seed: string, pal: number[]): TexImage {
  // faceted: diagonal facet highlights over a bevelled square
  const t = metalBlock(seed, pal, { lines: false });
  const hi = pal[4], dk = pal[1];
  for (let i = 2; i < 14; i++) {
    if (i % 4 === 2) continue;
    setPx(t, i, i, mixC(getPx(t, i, i), hi, 0.4));
    setPx(t, 15 - i, i, mixC(getPx(t, 15 - i, i), dk, 0.3));
  }
  for (const [x, y] of [[3, 3], [4, 3], [3, 4], [11, 4], [12, 5]]) setPx(t, x, y, hi);
  return t;
}

export function rawOreBlock(seed: string, pal: number[]): TexImage {
  return rockTex(seed, pal, { octaves: [[4, 4, 0.5], [2, 2, 0.35]], white: 0.15, emboss: 0.7, weights: [0.5, 1.5, 3, 4, 3, 1.5, 0.5], mode: 1 });
}

// ---------------------------------------------------------------------------
// Wool / terracotta / concrete (grayscale bases tinted per dye)

/** Knitted wool base in grayscale (mean ~0.87): staggered V stitches + soft noise. */
export const woolBase = (() => {
  const r = rng('wool');
  const t = img();
  const wn = white(r);
  const nz = fbm(r, [[8, 8, 0.5], [4, 4, 0.5]]);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // stitch cell 4 wide x 3 tall, rows staggered by 2
      const row = Math.floor(y / 3);
      const sx = (x + (row % 2) * 2) % 4;
      const sy = y % 3;
      let v = 222;
      if (sx === 0) v -= 9; // groove between stitch columns
      if ((sx === 1 && sy === 0) || (sx === 2 && sy === 1)) v += 8; // lit strand
      if (sy === 2 && sx !== 0) v -= 4;
      v += (wn[y * N + x] - 0.5) * 12 + (nz[y * N + x] - 0.5) * 10;
      setPx(t, x, y, grayOf(v));
    }
  return t;
})();

/** Apply a colour to a grayscale base using a luminance-preserving multiply around mean. */
export function tintBase(base: TexImage, col: number, mean = 222, contrast = 1): TexImage {
  const t = cloneImg(base);
  const [cr, cg, cb] = [(col >> 16) & 255, (col >> 8) & 255, col & 255];
  for (let i = 0; i < N * N; i++) {
    const g = base.data[i * 4];
    const f = 1 + ((g - mean) / mean) * contrast * 1.6;
    t.data[i * 4] = cr * f;
    t.data[i * 4 + 1] = cg * f;
    t.data[i * 4 + 2] = cb * f;
    t.data[i * 4 + 3] = 255;
  }
  return t;
}

export const terracottaBase = (() => {
  const r = rng('terracotta');
  const f = fbm(r, [[8, 8, 0.4], [4, 4, 0.3], [2, 2, 0.3]], 0.4);
  const tones = quantize(f, [0.4, 1.5, 4, 1.5, 0.4]);
  const t = paint(tones, [204, 212, 222, 230, 238].map((v) => grayOf(v)));
  return t;
})();

export const concreteBase = (() => {
  const r = rng('concrete');
  const f = fbm(r, [[4, 4, 0.5], [2, 2, 0.3]], 0.4);
  const tones = quantize(f, [0.5, 6, 0.5]);
  return paint(tones, [218, 222, 226].map((v) => grayOf(v)));
})();


// The End's block textures: end stone (pale, porous cream-yellow), its
// bricks, and the end portal frame (end stone below a band of dark sea-green
// stone, a socket on top) with the eye of ender that sits in it.

import { TexImage, img, setPx, getPx, mixC } from '../tex';
import { N, rng, idx, fbm, quantize, paint, noise } from './core';
import { brickGrid } from './terrain';

// ---------------------------------------------------------------------------
// End stone: pale cream-yellow, porous (small dark pits with a lit lower lip)

export const END_PAL = [0xa2a670, 0xb9bd82, 0xcacd92, 0xd5d99c, 0xdde0a6, 0xe5e8b0, 0xeff1bf];

export function endStone(): TexImage {
  const r = rng('end_stone');
  const H = fbm(r, [[8, 8, 0.25], [4, 4, 0.35], [2, 2, 0.4]], 0.6);
  const tones = quantize(H, [0, 0.7, 2.2, 4, 3, 1.2, 0.25]);
  const pits: string[][] = [
    ['D', 'L'],
    ['Dd', 'LL'],
    ['D', 'd', 'L'],
    ['.D', 'Dd', 'LL'],
    ['sDs', '.L.'],
  ];
  const tone: Record<string, number> = { D: 0, d: 1, s: 2, L: 6 };
  const taken = new Set<number>();
  let placed = 0, guard = 0;
  while (placed < 17 && guard++ < 400) {
    const p = pits[r.nextInt(pits.length)];
    const x0 = r.nextInt(N), y0 = r.nextInt(N);
    const cells: [number, number, number][] = [];
    p.forEach((row, yy) => [...row].forEach((ch, xx) => ch !== '.' && cells.push([x0 + xx, y0 + yy, tone[ch]])));
    // keep pits apart (periodic), so the grain stays even
    const near = cells.some(([x, y]) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (taken.has(idx(x + dx, y + dy))) return true;
      return false;
    });
    if (near) continue;
    for (const [x, y, k] of cells) {
      tones[idx(x, y)] = k === 6 ? (r.chance(0.35) ? 5 : 6) : k;
      taken.add(idx(x, y));
    }
    placed++;
  }
  return paint(tones, END_PAL);
}

// ---------------------------------------------------------------------------
// End stone bricks: small 8x4 bricks in running bond, olive mortar

export function endStoneBricks(): TexImage {
  return brickGrid('end_stone_bricks', [0xb3b67c, 0xc4c78b, 0xd0d397, 0xd9dca1, 0xe0e3aa, 0xe8eab4, 0xf1f3c2], [0x979864, 0xa3a46e], 4, 8);
}

// ---------------------------------------------------------------------------
// End portal frame

/** the frame's dark sea-green stone, dark → light */
const FRAME_PAL = [0x183029, 0x213d35, 0x2a4b41, 0x33594d, 0x3d685a, 0x4c7b6b, 0x659581];

/** Top: a bevelled green border around the socket an eye of ender sits in (the middle 8x8). */
export function endPortalFrameTop(): TexImage {
  const r = rng('end_portal_frame_top');
  const t = img();
  const h = noise(r, 4, 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      const v = h[y * N + x] + (r.next() - 0.5) * 0.35;
      let k: number;
      if (e === 0) k = x === 0 || y === 0 ? (x === 15 || y === 15 ? 3 : 5) : 1;
      else if (e <= 2) k = v > 0.72 ? 5 : v > 0.38 ? 4 : 3;
      else if (e === 3) k = x === 3 || y === 3 ? (x === 12 || y === 12 ? 2 : 1) : 5;
      else k = v > 0.6 ? 1 : 0;
      setPx(t, x, y, FRAME_PAL[k]);
    }
  // a few pale flecks on the rim, like the end stone it's carved beside
  for (let i = 0; i < 5; i++) {
    const s = r.nextInt(4), p = 1 + r.nextInt(14), d = 1 + r.nextInt(2);
    const [x, y] = s === 0 ? [p, d] : s === 1 ? [p, 15 - d] : s === 2 ? [d, p] : [15 - d, p];
    setPx(t, x, y, FRAME_PAL[6]);
  }
  return t;
}

/** Side: the frame's green band (the top 3 rows are unused: the block is 13 high) over end stone. */
export function endPortalFrameSide(stone: TexImage): TexImage {
  const r = rng('end_portal_frame_side');
  const t = img();
  for (let y = 3; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (y >= 8) {
        // end stone, in the band's shadow just below it
        const c = getPx(stone, x, y);
        setPx(t, x, y, y === 8 ? mixC(c, 0x5c6040, 0.35) : c);
        continue;
      }
      const m = x & 3;
      let k: number;
      if (y === 3) k = m === 0 ? 4 : r.chance(0.3) ? 6 : 5;
      else if (y === 7) k = r.chance(0.25) ? 1 : 0;
      else if (y === 4) k = m === 0 ? 2 : m === 1 ? 5 : 4;
      else if (y === 5) k = m === 0 ? 1 : m === 2 ? (r.chance(0.5) ? 5 : 4) : 3;
      else k = m === 0 ? 1 : 2;
      setPx(t, x, y, FRAME_PAL[k]);
    }
  return t;
}

/** The eye set in a frame: its rim (x 4-11, rows 0-2) for the sides, the eye itself (4..11 x 4..11) for the top. */
export function endPortalFrameEye(): TexImage {
  const t = img();
  const pal: Record<string, number> = {
    D: 0x0b3a26, d: 0x114d31, m: 0x1a6b44, M: 0x2a8a58, l: 0x44aa70, L: 0x7ad09a, y: 0x9ad83a, k: 0x0a1a06, h: 0xc8f0d4,
  };
  const rim = ['MllllllM', 'mMMMMMMm', 'dmmmmmmd'];
  const eye = ['DdmmmmdD', 'dmMllMmd', 'mMhyylMm', 'mlykkylm', 'mlykkylm', 'mMlyylMm', 'dmMllMmd', 'DdmmmmdD'];
  rim.forEach((row, y) => [...row].forEach((ch, x) => setPx(t, 4 + x, y, pal[ch])));
  eye.forEach((row, y) => [...row].forEach((ch, x) => setPx(t, 4 + x, 4 + y, pal[ch])));
  return t;
}

// ---------------------------------------------------------------------------
// Dragon egg: near-black, flecked with dark violet, a few brighter purple specks catching the light

export function dragonEgg(): TexImage {
  const r = rng('dragon_egg');
  const H = fbm(r, [[4, 4, 0.4], [2, 2, 0.35]], 0.5);
  const tones = quantize(H, [3, 2.2, 1, 0.35]);
  const t = paint(tones, [0x0c0910, 0x140e1a, 0x1d1426, 0x2b1d38]);
  // violet flecks, and a scatter of brighter specks
  for (let i = 0; i < 18; i++) setPx(t, r.nextInt(N), r.nextInt(N), r.chance(0.5) ? 0x3a2550 : 0x31203f);
  for (let i = 0; i < 6; i++) setPx(t, r.nextInt(N), r.nextInt(N), r.chance(0.5) ? 0x5c3478 : 0x4a2c63);
  return t;
}

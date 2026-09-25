// The tuff family's textures (1.21): polished tuff (vanilla block/polished_tuff), tuff bricks (block/tuff_bricks)
// and chiseled tuff bricks (block/chiseled_tuff_bricks and _top), in tuff's grey-green; chiseled tuff's own are the
// advancement icons' (iconblocks.ts). Original pixel art.

import { TexImage, type TexDef, setPx, mixC, getPx } from '../tex';
import { N, rng, idx, fbm, quantize, paint } from './core';

type Gen = () => TexImage;

/** tuff, darkest to lightest (as blocks.ts's tuff and iconblocks.ts's chiseled tuff) */
const TUFF = [0x4c4e46, 0x575951, 0x62645b, 0x6b6d65, 0x76786f, 0x82847a, 0x919389];

/** tuff's grain, smoothed: tones 2-4 with the odd 1 and 5 */
function grain(seed: string, smooth = false): Int32Array {
  const f = fbm(rng(seed), smooth ? [[8, 8, 0.5], [4, 4, 0.35]] : [[4, 4, 0.4], [2, 2, 0.35]], smooth ? 0.2 : 0.3);
  return quantize(f, smooth ? [0.3, 3, 6, 3, 0.3] : [0.6, 2.5, 5, 2.5, 0.6]).map((k) => k + 1);
}

/** a raised square: its top and left rows lit, its bottom and right in shadow */
function raise(t: Int32Array, x0: number, y0: number, x1: number, y1: number, hi = 6, lo = 0, soft = true): void {
  for (let i = x0; i <= x1; i++) {
    t[idx(i, y0)] = hi;
    t[idx(i, y1)] = lo;
  }
  for (let j = y0; j <= y1; j++) {
    t[idx(x0, j)] = hi;
    t[idx(x1, j)] = lo;
  }
  t[idx(x1, y0)] = 3;
  t[idx(x0, y1)] = 3;
  if (!soft) return;
  for (let i = x0 + 1; i < x1; i++) {
    t[idx(i, y0 + 1)] = Math.min(6, t[idx(i, y0 + 1)] + 1);
    t[idx(i, y1 - 1)] = Math.max(0, t[idx(i, y1 - 1)] - 1);
  }
  for (let j = y0 + 2; j < y1 - 1; j++) {
    t[idx(x0 + 1, j)] = Math.min(6, t[idx(x0 + 1, j)] + 1);
    t[idx(x1 - 1, j)] = Math.max(0, t[idx(x1 - 1, j)] - 1);
  }
}

/** vanilla block/polished_tuff: smoothed tuff, bevelled, a fine line cut round inside the bevel */
function polishedTuff(): TexImage {
  const t = grain('polished_tuff', true);
  raise(t, 0, 0, 15, 15);
  for (let i = 2; i <= 13; i++) {
    t[idx(i, 2)] = 1;
    t[idx(2, i)] = 1;
    t[idx(i, 13)] = 5;
    t[idx(13, i)] = 5;
  }
  t[idx(13, 2)] = 3;
  t[idx(2, 13)] = 3;
  return paint(t, TUFF);
}

/**
 * vanilla block/tuff_bricks: tall bricks stood on end, four across, every other column set half a brick down; each
 * lit along its top and a little down its left, the joints dark
 */
function tuffBricks(): TexImage {
  const t = grain('tuff_bricks');
  for (let c = 0; c < 4; c++) {
    const x0 = c * 4, off = c % 2 ? 4 : 0;
    for (let y = 0; y < N; y++) {
      const v = (y - off + N) % 8;
      if (v === 7) {
        for (let x = x0; x < x0 + 4; x++) t[idx(x, y)] = x === x0 + 3 ? 0 : 1;
        continue;
      }
      t[idx(x0 + 3, y)] = v === 0 ? 2 : 1;
      if (v === 0) for (let x = x0; x < x0 + 3; x++) t[idx(x, y)] = x === x0 ? 6 : 5;
      else {
        t[idx(x0, y)] = Math.min(5, Math.max(t[idx(x0, y)], 4));
        if (v === 6) for (let x = x0 + 1; x < x0 + 3; x++) t[idx(x, y)] = Math.min(t[idx(x, y)], 2);
      }
    }
  }
  return paint(t, TUFF);
}

/**
 * a carved swirl about (7.5, cy): a spiral line winding out from radius 0.8 to `r` over `turns` turns, the cut in
 * shadow and the pixel below and right of it catching the light
 */
function swirl(t: Int32Array, cy: number, r: number, turns: number): void {
  const span = turns * Math.PI * 2, b = (r - 0.8) / span;
  const cut = new Set<number>();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - 7.5, dy = y - cy, d = Math.hypot(dx, dy);
      const th = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
      for (let a = th; a <= span; a += Math.PI * 2) if (Math.abs(d - (0.8 + b * a)) < 0.5) cut.add(idx(x, y));
    }
  for (const i of cut) {
    const lit = idx((i % N) + 1, Math.floor(i / N) + 1);
    if (!cut.has(lit)) t[lit] = 5;
  }
  for (const i of cut) t[i] = 0;
}

/**
 * vanilla block/chiseled_tuff_bricks: a course of bricks along the top and the bottom, and between them a bevelled
 * panel carved with a swirl, notched either side
 */
function chiseledTuffBricks(): TexImage {
  const t = grain('chiseled_tuff_bricks');
  for (const [y0, off] of [[0, 0], [12, 4]]) {
    for (let x = 0; x < N; x++) {
      t[idx(x, y0)] = 6;
      t[idx(x, y0 + 3)] = 0;
    }
    for (const x of [off + 7, off + 15]) for (let y = y0; y < y0 + 4; y++) t[idx(x, y)] = y === y0 ? 3 : 0;
  }
  raise(t, 0, 4, 15, 11, 6, 1);
  swirl(t, 7.5, 3.3, 1);
  for (const x0 of [2, 12]) for (let x = x0; x < x0 + 2; x++) {
    t[idx(x, 7)] = 0;
    t[idx(x, 8)] = 5;
  }
  return paint(t, TUFF);
}

/** vanilla block/chiseled_tuff_bricks_top: a bevelled square, a groove round inside it and a swirl carved at its heart */
function chiseledTuffBricksTop(): TexImage {
  const t = grain('chiseled_tuff_bricks_top', true);
  raise(t, 0, 0, 15, 15);
  for (let i = 2; i <= 13; i++) {
    t[idx(i, 2)] = 0;
    t[idx(2, i)] = 0;
    t[idx(i, 13)] = 5;
    t[idx(13, i)] = 5;
  }
  swirl(t, 7.5, 4.6, 1.3);
  const img = paint(t, TUFF);
  // a little wear on the carving's rim
  const r = rng('chiseled_tuff_bricks_top_wear');
  for (let k = 0; k < 6; k++) {
    const x = 3 + r.nextInt(10), y = 3 + r.nextInt(10);
    setPx(img, x, y, mixC(getPx(img, x, y), TUFF[1], 0.4));
  }
  return img;
}

export function registerTuffTextures(T: Record<string, () => TexDef>): void {
  T['polished_tuff'] = polishedTuff;
  T['tuff_bricks'] = tuffBricks;
  T['chiseled_tuff_bricks'] = chiseledTuffBricks;
  T['chiseled_tuff_bricks_top'] = chiseledTuffBricksTop;
}


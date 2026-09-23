// Crop sprites for the '#'-shaped crop model (transparent background):
// carrots, potatoes, beetroots (stages 0-3) and pumpkin/melon stems
// (stems are grayscale and tinted at runtime).

import { TexImage, img, plot, getA } from '../tex';
import { rng } from './core';

type P = { x: number; h: number; lean: number };

/** Plant positions across the tile (four plants, like vanilla crops). */
function plants(seed: string, heights: [number, number], xs = [2, 6, 9, 13]): P[] {
  const r = rng(seed);
  return xs.map((x) => ({ x: x + (r.nextInt(3) - 1) * (x === 6 || x === 9 ? 0 : 1), h: heights[0] + r.nextInt(heights[1] - heights[0] + 1), lean: r.nextInt(3) - 1 }));
}

const GREEN = [0x234d10, 0x2f6516, 0x3d7d1d, 0x4f9626, 0x66ad33];

/** Carrot tops: fans of thin stalks with feathery leaflets; orange root shoulders at the last stage. */
export function carrots(stage: number): TexImage {
  const t = img();
  const r = rng('carrots' + stage);
  const H: [number, number][] = [[2, 3], [4, 6], [7, 9], [9, 12]];
  for (const p of plants('carrots' + stage, H[stage])) {
    // 1-3 stalks per plant fanning out
    const fan = stage === 0 ? [0] : stage === 1 ? [-1, 1] : [-1, 0, 1];
    for (const d of fan) {
      let x = p.x;
      const h = d === 0 ? p.h : p.h - 1 - r.nextInt(2);
      for (let k = 0; k < h; k++) {
        const y = 15 - k;
        if (k > 1 && k % 3 === 1) x += d;
        plot(t, x, y, GREEN[k < 2 ? 1 : 2]);
        // feathery leaflets
        if (stage > 0 && k >= 2 && k % 2 === 0) {
          plot(t, x - 1, y - 1, GREEN[3]);
          plot(t, x + 1, y - 1, GREEN[2]);
        }
      }
      plot(t, x, 15 - h, GREEN[4]);
    }
    if (stage === 3) {
      // orange carrot shoulders peeking out of the soil
      plot(t, p.x - 1, 15, 0xc2650f);
      plot(t, p.x, 15, 0xf0922a);
      plot(t, p.x + 1, 15, 0xd9781a);
      plot(t, p.x, 14, 0xf7ab45);
      plot(t, p.x - 1, 14, 0xe0861f);
    }
  }
  return t;
}

/** Potato plants: bushy rounded leaflets; small tubers at the base in the last stage. */
export function potatoes(stage: number): TexImage {
  const t = img();
  const r = rng('potatoes' + stage);
  const H: [number, number][] = [[2, 3], [4, 5], [6, 8], [8, 10]];
  const leaf = [0x2c5c18, 0x3a7420, 0x4a8a2a, 0x5fa035];
  for (const p of plants('potatoes' + stage, H[stage], [2, 6, 10, 13])) {
    let x = p.x;
    for (let k = 0; k < p.h; k++) {
      const y = 15 - k;
      if (k > 2 && k % 3 === 0) x += p.lean;
      plot(t, x, y, leaf[1]);
      // paired rounded leaflets
      if (stage > 0 && k >= 1 && k % 2 === 1) {
        const w = stage >= 2 ? 2 : 1;
        for (let s = 1; s <= w; s++) {
          plot(t, x - s, y, leaf[s === w ? 3 : 2]);
          plot(t, x + s, y, leaf[s === w ? 2 : 1]);
          if (stage >= 2) plot(t, x - s, y - 1, leaf[3]);
        }
      }
    }
    plot(t, x, 15 - p.h, leaf[3]);
    plot(t, x - 1, 16 - p.h, leaf[2]);
    plot(t, x + 1, 16 - p.h, leaf[2]);
    if (stage === 3) {
      const tuber = [0x8e6a33, 0xb58c48, 0xd2ae68];
      plot(t, p.x - 1, 15, tuber[1]);
      plot(t, p.x, 15, tuber[2]);
      plot(t, p.x + 1, 15, tuber[0]);
      if (r.chance(0.6)) plot(t, p.x, 14, tuber[1]);
    }
  }
  return t;
}

/** Beetroot plants: broad dark leaves on red stalks with red veins; red root tops at the last stage. */
export function beetroots(stage: number): TexImage {
  const t = img();
  const H: [number, number][] = [[2, 3], [4, 5], [6, 8], [8, 10]];
  const leaf = [0x244a14, 0x2f5f1a, 0x3d7622, 0x4f8e2d, 0x62a338];
  const stalk = [0x6b1a2a, 0x8e2438, 0xb03450];
  for (const p of plants('beetroots' + stage, H[stage], [2, 6, 10, 13])) {
    // two leaves per plant leaning apart
    const leaves = stage === 0 ? [0] : [-1, 1];
    for (const d of leaves) {
      let x = p.x;
      const h = p.h - (d > 0 ? 1 : 0);
      const blade0 = Math.max(1, Math.floor(h * 0.4));
      for (let k = 0; k < h; k++) {
        const y = 15 - k;
        if (k > 0 && k % 3 === 0) x += d;
        if (k < blade0) {
          plot(t, x, y, stalk[1]);
          continue;
        }
        // blade: widest in the middle, red midrib
        const f = (k - blade0) / Math.max(1, h - blade0);
        const w = stage >= 2 ? (f < 0.75 ? 1 : 0) + (f > 0.2 && f < 0.6 ? 1 : 0) : f < 0.7 ? 1 : 0;
        for (let s = -w; s <= w; s++) plot(t, x + s, y, leaf[s < 0 ? 3 : s > 0 ? 1 : 2]);
        if (stage >= 2 && f < 0.8) plot(t, x, y, stalk[2]);
      }
      plot(t, x, 15 - h, leaf[4]);
    }
    if (stage === 3) {
      const root = [0x7a1428, 0xa82240, 0xcf3f5e];
      plot(t, p.x - 1, 15, root[1]);
      plot(t, p.x, 15, root[2]);
      plot(t, p.x + 1, 15, root[0]);
      plot(t, p.x, 14, root[1]);
    }
  }
  return t;
}

// ---------------------------------------------------------------------------
// Stems (grayscale; biome/age tint applied at runtime)

const STEM = [0x6a6a6a, 0x858585, 0xa0a0a0, 0xbababa, 0xd2d2d2];

export function stem(seed: string): TexImage {
  const t = img();
  const r = rng(seed);
  let x = 7;
  for (let y = 15; y >= 0; y--) {
    plot(t, x, y, STEM[2 + (y % 3 === 0 ? 1 : 0)]);
    if (y % 5 === 2) x += r.nextBool() ? 1 : -1;
    x = Math.max(6, Math.min(9, x));
    // small leaves every 4 px, alternating sides
    if (y % 4 === 1) {
      const d = (y >> 2) % 2 ? 1 : -1;
      plot(t, x + d, y, STEM[3]);
      plot(t, x + 2 * d, y - 1, STEM[4]);
      plot(t, x + d, y - 1, STEM[2]);
    }
  }
  return t;
}

/** Attached stem: rises from the bottom then bends sideways to the right toward the fruit. */
export function attachedStem(seed: string): TexImage {
  const t = img();
  const r = rng(seed);
  let x = 6;
  for (let y = 15; y >= 9; y--) {
    plot(t, x, y, STEM[2 + (y % 3 === 0 ? 1 : 0)]);
    if (y === 12) x++;
  }
  // bend
  plot(t, x, 8, STEM[3]);
  plot(t, x + 1, 8, STEM[3]);
  let y = 8;
  for (let xx = x + 2; xx < 16; xx++) {
    if (xx % 4 === 0 && y > 6) y--;
    plot(t, xx, y, STEM[2 + (xx % 2)]);
  }
  // a leaf on the curve and one low on the stalk
  plot(t, x + 3, y + 1, STEM[4]);
  plot(t, x + 4, y + 1, STEM[3]);
  plot(t, x - 1, 13, STEM[3]);
  plot(t, x - 2, 12, STEM[4]);
  void r;
  return t;
}

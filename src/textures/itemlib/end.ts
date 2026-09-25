// Items of the End: the end crystal (a magenta crystal cube inside its pale
// glass cage, seen corner-on) and the dragon head (the advancement icon of Free
// the End). The eye of ender is in extras.ts.

import { TexImage, img, plot } from '../tex';
import type { Gen } from './common';

export const END_ITEMS: Record<string, Gen> = {};

/** which part of a pointy-topped isometric cube of radius s the offset (dx,dy) falls on: 0 outside, 1 top, 2 left, 3 right */
function cubeFace(dx: number, dy: number, s: number): number {
  const w = s * Math.cos(Math.PI / 6);
  const ax = Math.abs(dx);
  if (ax > w || Math.abs(dy) > s - (ax / w) * (s / 2)) return 0;
  if (dy < (-ax * s) / (2 * w)) return 1;
  return dx < 0 ? 2 : 3;
}

END_ITEMS['end_crystal'] = (): TexImage => {
  const t = img(16, 16);
  const glassLit = 0xf4eefa, glass = 0xd8cce4, glassDark = 0xa898b8;
  const top = 0xf2a6e6, left = 0xc65cbc, right = 0x8e2c86, edge = 0x5c1458;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - 8, dy = y + 0.5 - 8;
      const inner = cubeFace(dx, dy, 4.3);
      if (inner) {
        // the crystal: a darker rim where its faces meet the gap
        const rim = !cubeFace(dx, dy, 3.3);
        plot(t, x, y, rim && inner !== 1 ? edge : inner === 1 ? top : inner === 2 ? left : right);
        continue;
      }
      if (cubeFace(dx, dy, 7.6) && !cubeFace(dx, dy, 6.5)) plot(t, x, y, dy < 0 && dx <= 0 ? glassLit : dy > 0 && dx > 0 ? glassDark : glass);
    }
  // the glint on the crystal's top
  plot(t, 7, 5, 0xffe4fa);
  return t;
};

/**
 * vanilla DragonHeadModel's boxes (model units, y up here, the snout toward -z): the upper head, the upper lip and
 * the jaw under it, two scales on top, two nostrils on the snout
 */
const DRAGON_HEAD: [number, number, number, number, number, number][] = [
  [-8, -8, -10, 8, 8, 6],
  [-6, -4, -24, 6, 1, -8],
  [-6, -8, -24, 6, -4, -8],
  [-5, 8, -4, -3, 12, 2],
  [3, 8, -4, 5, 12, 2],
  [-5, 1, -22, -3, 3, -18],
  [3, 1, -22, 5, 3, -18],
];

/**
 * the dragon head as the inventory shows it (vanilla draws the model itself): seen from above, its snout toward the
 * lower left — the top lightest, the front mid, the side darkest, a purple eye on the side — cast at 4x4 rays a
 * pixel, each pixel the face most of them hit
 */
END_ITEMS['dragon_head'] = (): TexImage => {
  const t = img(16, 16);
  // looking down 30°, along (1, -0.816, 1): the front (-z) to the left, the side (-x) to the right
  const d = [1, -0.8165, 1];
  const dl = Math.hypot(d[0], d[1], d[2]);
  const D = d.map((v) => v / dl);
  const R = [-Math.SQRT1_2, 0, Math.SQRT1_2];
  // up = right × forward
  const U = [R[1] * D[2] - R[2] * D[1], R[2] * D[0] - R[0] * D[2], R[0] * D[1] - R[1] * D[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // fit the model's corners into the icon, a pixel's margin round it
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const b of DRAGON_HEAD)
    for (let c = 0; c < 8; c++) {
      const p = [b[c & 1 ? 3 : 0], b[c & 2 ? 4 : 1], b[c & 4 ? 5 : 2]];
      const sx = dot(p, R), sy = dot(p, U);
      x0 = Math.min(x0, sx);
      x1 = Math.max(x1, sx);
      y0 = Math.min(y0, sy);
      y1 = Math.max(y1, sy);
    }
  const scale = Math.max(x1 - x0, y1 - y0) / 14.5;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  /** what a ray through the icon at (px, py) hits first: 0 nothing, 1 top, 2 front, 3 side, 4 the eye */
  const cast = (px: number, py: number): number => {
    const sx = cx + (px - 8) * scale, sy = cy - (py - 8) * scale;
    const o = [0, 1, 2].map((i) => R[i] * sx + U[i] * sy - D[i] * 100);
    let best = Infinity, face = 0, hit: number[] = [];
    for (const b of DRAGON_HEAD) {
      let tmin = -Infinity, tmax = Infinity, axis = -1;
      for (let i = 0; i < 3; i++) {
        const a = (b[i] - o[i]) / D[i], c = (b[i + 3] - o[i]) / D[i];
        const lo = Math.min(a, c), hi = Math.max(a, c);
        if (lo > tmin) {
          tmin = lo;
          axis = i;
        }
        tmax = Math.min(tmax, hi);
      }
      if (tmin > tmax || tmin >= best) continue;
      best = tmin;
      face = axis === 1 ? 1 : axis === 2 ? 2 : 3;
      hit = o.map((v, i) => v + D[i] * tmin);
    }
    // the eye: on the side of the upper head, near its front, high up
    if (face === 3 && hit[0] < -7.9 && hit[2] < -5 && hit[1] > 2 && hit[1] < 5.5) return 4;
    return face;
  };
  const COLORS = [0, 0x5e5966, 0x37333d, 0x1f1d23, 0xb04ee0];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const n = [0, 0, 0, 0, 0];
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) n[cast(x + (i + 0.5) / 4, y + (j + 0.5) / 4)]++;
      // (an eye counts where it shows at all)
      if (n[4] >= 3) {
        plot(t, x, y, COLORS[4]);
        continue;
      }
      if (n[0] >= 8) continue;
      let k = 1;
      for (let f = 2; f <= 3; f++) if (n[f] > n[k]) k = f;
      // a little scale texture: a scattering of the pixels a shade lighter
      const c = COLORS[k];
      plot(t, x, y, (x * 7 + y * 13) % 5 === 0 ? c + 0x080808 : c);
    }
  return t;
};

/**
 * the elytra (vanilla elytra and broken_elytra): the folded wings seen from behind, joined at the shoulders and
 * narrowing down to their tips at the lower corners, pale grey-violet membrane over darker ribs. Broken (down to its
 * last point of durability): torn, the tips ragged and holes through both wings.
 */
function elytraIcon(broken: boolean): TexImage {
  const t = img(16, 16);
  // the left wing's columns (from, to) on rows 1 to 14; the right wing mirrors it
  const rows: [number, number][] = [[3, 7], [2, 7], [2, 7], [1, 7], [1, 7], [1, 6], [1, 6], [1, 5], [1, 5], [1, 4], [1, 4], [1, 3], [1, 2], [1, 1]];
  const inside = new Set<number>();
  const at = (x: number, y: number) => y * 16 + x;
  rows.forEach(([a, b], i) => {
    for (let x = a; x <= b; x++) {
      inside.add(at(x, i + 1));
      inside.add(at(15 - x, i + 1));
    }
  });
  if (broken)
    for (const [x, y] of [[1, 14], [1, 13], [2, 12], [14, 14], [14, 13], [13, 12], [1, 10], [14, 9], [3, 6], [4, 6], [4, 7], [12, 8], [11, 9], [12, 9], [6, 3], [9, 4]])
      inside.delete(at(x, y));
  const has = (x: number, y: number) => x >= 0 && x < 16 && inside.has(at(x, y));
  const OUTLINE = 0x34323e, LIGHT = 0xd6d4e0, MID = 0xb2b0c0, RIB = 0x8a8898, SHADE = 0x9c9aac;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!has(x, y)) continue;
      // (where the two wings meet down the middle, and round their edges, a dark line)
      if (!has(x - 1, y) || !has(x + 1, y) || !has(x, y - 1) || !has(x, y + 1) || x === 7 || x === 8) {
        plot(t, x, y, OUTLINE);
        continue;
      }
      // the ribs fan down and out from the shoulders; the wing lighter toward its outer edge, shaded near the middle
      const out = x < 8 ? 7 - x : x - 8;
      plot(t, x, y, (out + y) % 4 === 0 ? RIB : y <= 3 || out >= 5 ? LIGHT : out <= 1 ? SHADE : MID);
    }
  return t;
}
END_ITEMS['elytra'] = () => elytraIcon(false);
END_ITEMS['broken_elytra'] = () => elytraIcon(true);

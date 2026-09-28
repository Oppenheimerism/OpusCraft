// The bamboo plant's block textures (remaining mobs: the panda). Vanilla block/bamboo_stalk: four strips of stalk side
// by side (each three pixels across, a thin stalk showing the first two: its shaded edge and its lit middle), each with
// its joints at rows of its own, pale rings over a dark band; the cut top and bottom in the corner. block/
// bamboo_small_leaves and bamboo_large_leaves: the crossed leaves over a stalk, a few short ones rising from the middle
// or a spray of long ones fanning out and drooping. block/bamboo_stage0: the shoot, a stub of stalk with three leaves;
// block/bamboo_singleleaf: one leaf, up and out from the corner (potted bamboo's). Original pixel art.

import { TexImage, img, setPx } from '../tex';
import { rng } from './core';

type Gen = () => TexImage;

/** bamboo's greens, dark to light */
export const BAMBOO_GREENS = [0x2c5409, 0x3b6c10, 0x4e8618, 0x629e22, 0x78b52d, 0x92ca40];
const G = BAMBOO_GREENS;
/** a joint's pale ring, and the cut end's pith */
const RING = 0xb9d468, PITH = 0xc9dc86;
/** the leaves' greens, dark to light (a little bluer and deeper than the stalk) */
export const LEAF_GREENS = [0x21470d, 0x2f6114, 0x3f7a1b, 0x539524, 0x6aae2f];

/** each strip's joints (the pale ring's row; the dark band is the row under it) */
const JOINTS = [[2, 9], [5, 13], [0, 7], [4, 11]];

/** vanilla block/bamboo_stalk */
function bambooStalk(): TexImage {
  const t = img();
  const r = rng('bamboo_stalk');
  for (let v = 0; v < 4; v++) {
    const u0 = v * 3, joints = JOINTS[v];
    for (let y = 0; y < 16; y++) {
      const ring = joints.includes(y), band = joints.includes((y + 15) % 16);
      // (the shaded edge, the lit middle, the far side in shadow)
      let cols = [G[2], G[4], G[1]];
      if (ring) cols = [G[4], RING, G[3]];
      else if (band) cols = [G[1], G[2], G[0]];
      else if (r.chance(0.18)) cols = cols.map((c, i) => (i === 1 ? G[5] : c));
      cols.forEach((c, i) => setPx(t, u0 + i, y, c));
    }
  }
  // the cut top (13..15, 0..2; a thin stalk's the top-left two by two) and bottom (13..15, 4..6)
  const top = [[G[3], G[4], G[3]], [G[4], PITH, G[3]], [G[3], G[3], G[2]]];
  const bottom = [[G[2], G[3], G[2]], [G[3], RING, G[2]], [G[2], G[2], G[1]]];
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) {
      setPx(t, 13 + x, y, top[y][x]);
      setPx(t, 13 + x, 4 + y, bottom[y][x]);
    }
  return t;
}

/**
 * a leaf into `t`, from (x0, y0) out to (x1, y1) in pixels, bending towards (cx, cy) on the way (a quadratic curve),
 * `w` across at its widest (two fifths of the way along), narrowing to its stalk and to a point; lit on its upper side,
 * a paler rib down its middle
 */
export function leafInto(t: TexImage, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number, pal: readonly number[] = LEAF_GREENS): void {
  const STEPS = 48;
  // the midrib: points along the curve, each with the normal pointing up the texture (its upper side)
  const pts: [number, number, number, number, number][] = [];
  for (let i = 0; i <= STEPS; i++) {
    const s = i / STEPS, a = 1 - s;
    const px = a * a * x0 + 2 * a * s * cx + s * s * x1, py = a * a * y0 + 2 * a * s * cy + s * s * y1;
    const tx = 2 * a * (cx - x0) + 2 * s * (x1 - cx), ty = 2 * a * (cy - y0) + 2 * s * (y1 - cy);
    const l = Math.hypot(tx, ty) || 1;
    let nx = -ty / l, ny = tx / l;
    if (ny > 0 || (ny === 0 && nx < 0)) {
      nx = -nx;
      ny = -ny;
    }
    pts.push([px, py, nx, ny, s]);
  }
  for (let y = 0; y < t.h; y++)
    for (let x = 0; x < t.w; x++) {
      const qx = x + 0.5, qy = y + 0.5;
      let best = Infinity, k = 0;
      for (let i = 0; i < pts.length; i++) {
        const d2 = (qx - pts[i][0]) ** 2 + (qy - pts[i][1]) ** 2;
        if (d2 < best) {
          best = d2;
          k = i;
        }
      }
      const [px, py, nx, ny, s] = pts[k];
      // (past either end of the rib: not the leaf)
      if ((k === 0 || k === STEPS) && Math.sqrt(best) > 0.5) continue;
      const d = (qx - px) * nx + (qy - py) * ny;
      const half = Math.max(0.45, (w / 2) * Math.sin(Math.PI * Math.pow(s, 0.75)));
      if (Math.abs(d) > half) continue;
      let c: number;
      if (Math.abs(d) < 0.45 && s > 0.12 && s < 0.8) c = pal[3];
      else if (d > 0) c = s > 0.78 ? pal[2] : pal[4];
      else c = s > 0.78 ? pal[0] : pal[1];
      setPx(t, x, y, c);
    }
}

/** vanilla block/bamboo_small_leaves: a few short leaves from high on the stalk, out to either side and dipping */
function smallLeaves(): TexImage {
  const t = img();
  leafInto(t, 8, 7, 5, 3, 1.5, 4.5, 2.6);
  leafInto(t, 8, 7, 11, 3, 14.5, 4, 2.6);
  leafInto(t, 8, 9, 6, 8, 3.5, 12.5, 2.2);
  leafInto(t, 8, 10, 10.5, 9.5, 12.5, 13.5, 2.2);
  return t;
}

/** vanilla block/bamboo_large_leaves: a spray of long leaves from the top of the stalk, fanning out and drooping */
function largeLeaves(): TexImage {
  const t = img();
  // (the ones hanging lowest first, the ones rising over them last)
  leafInto(t, 8, 8, 5.5, 8.5, 3, 15.5, 2.6);
  leafInto(t, 8, 8, 10.5, 8.5, 13, 15.5, 2.6);
  leafInto(t, 8, 5, 3, 3.5, 0.5, 11, 2.8);
  leafInto(t, 8, 5, 13, 3.5, 15.5, 10.5, 2.8);
  leafInto(t, 8, 3, 4, 0, 0.5, 4, 2.6);
  leafInto(t, 8, 3, 12, 0, 15.5, 3.5, 2.6);
  leafInto(t, 8, 4, 7, 1, 5, 0.5, 2.2);
  leafInto(t, 8, 4, 9.5, 1, 11.5, 0.5, 2.2);
  return t;
}

/** vanilla block/bamboo_stage0: the shoot, a stub of stalk out of the ground with a leaf to each side and one up */
function bambooStage0(): TexImage {
  const t = img();
  for (let y = 9; y < 16; y++) {
    setPx(t, 7, y, y === 12 ? G[4] : y === 13 ? G[1] : G[2]);
    setPx(t, 8, y, y === 12 ? RING : y === 13 ? G[2] : G[4]);
  }
  leafInto(t, 8, 10, 5, 6, 2, 7, 2.8);
  leafInto(t, 8, 10, 11, 6, 14, 7.5, 2.8);
  leafInto(t, 8, 10, 8, 6, 9.5, 2.5, 2.4);
  return t;
}

/** vanilla block/bamboo_singleleaf: one leaf, from low in the middle up to the top right corner */
function singleLeaf(): TexImage {
  const t = img();
  leafInto(t, 8.5, 7.5, 12.5, 5.5, 15.5, 0.5, 3.2);
  return t;
}

export function registerBambooTextures(T: Record<string, () => TexImage | { w: number; h: number; frames: Uint8ClampedArray[] }>): void {
  const B = T as Record<string, Gen>;
  B['bamboo_stalk'] = bambooStalk;
  B['bamboo_small_leaves'] = smallLeaves;
  B['bamboo_large_leaves'] = largeLeaves;
  B['bamboo_stage0'] = bambooStage0;
  B['bamboo_singleleaf'] = singleLeaf;
}

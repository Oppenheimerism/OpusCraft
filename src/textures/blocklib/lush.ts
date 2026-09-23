// Lush caves blocks: azalea bushes and flowering azalea leaves, hanging
// roots, spore blossoms, cave vines with glow berries, big and small dripleaf.
// All drawn on transparent backgrounds (cutout), lit from the top left.

import { TexImage, img, setPx, getPx, getA, Rand } from '../tex';
import { N } from './core';
import { leafCanopy, LEAF_AZALEA } from './foliage';

const LEAF = LEAF_AZALEA;
const PINK = [0x8a3f86, 0xa8509f, 0xc163b6, 0xd77dcb, 0xe9a3e0];
const WOOD = [0x3b2c1c, 0x4f3d27, 0x654f33, 0x7b6341];
const ROOT = [0x7d5c3d, 0x9a7550, 0xb48e66, 0xc9a57c];

/** pink azalea flowers: little crosses of petals round a pale centre */
function flowers(t: TexImage, r: Rand, n: number, maxY = N): void {
  const petals: [number, number, number][] = [[0, 0, 4], [1, 0, 2], [-1, 0, 3], [0, 1, 1], [0, -1, 3]];
  for (let placed = 0, guard = 0; placed < n && guard < 200; guard++) {
    const x = r.nextInt(N), y = r.nextInt(maxY);
    if (!getA(t, x, y)) continue;
    placed++;
    for (const [dx, dy, k] of petals) {
      const px = (x + dx + N) % N, py = y + dy;
      if (py >= 0 && py < maxY && getA(t, px, py)) setPx(t, px, py, PINK[k]);
    }
  }
}

export function floweringAzaleaLeaves(): TexImage {
  const t = leafCanopy('flowering_azalea_leaves', { blobs: 16, minDist: 3.1, radius: [1.9, 2.7], noise: 0.7, light: 0.9, holes: 0.2, shadow: 0.12, pal: LEAF });
  flowers(t, new Rand(0xf10a, 3), 7);
  return t;
}

/** the bush's top: a dense leaf layer, rounded off at the corners */
export function azaleaTop(flowering: boolean): TexImage {
  const src = leafCanopy('azalea_top', { blobs: 18, minDist: 2.9, radius: [2, 2.8], noise: 0.7, light: 0.9, holes: 0.05, shadow: 0.1, pal: LEAF });
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const cx = Math.min(x, 15 - x), cy = Math.min(y, 15 - y);
      if (cx + cy < 2) continue;
      if (getA(src, x, y)) setPx(t, x, y, getPx(src, x, y));
    }
  if (flowering) flowers(t, new Rand(0xf10b, 3), 7);
  return t;
}

/** the bush's sides: leaves over the top half with a ragged lower edge, open below */
export function azaleaSide(flowering: boolean): TexImage {
  const src = leafCanopy('azalea_side', { blobs: 18, minDist: 2.9, radius: [2, 2.8], noise: 0.7, light: 0.9, holes: 0.07, shadow: 0.12, pal: LEAF });
  const t = img();
  const r = new Rand(0xa2a0, 3);
  let bottom = 9;
  for (let x = 0; x < N; x++) {
    bottom = Math.max(8, Math.min(11, bottom + r.nextInt(3) - 1));
    for (let y = 0; y < bottom; y++) if (getA(src, x, y)) setPx(t, x, y, y === bottom - 1 ? LEAF[1] : getPx(src, x, y));
  }
  if (flowering) flowers(t, new Rand(0xf10c, 3), 4, 8);
  return t;
}

/** the plant inside the bush: a woody stem forking into branches under the leaves */
export function azaleaPlant(): TexImage {
  const t = img();
  const line = (x0: number, y0: number, x1: number, y1: number, w: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      for (let k = 0; k < w; k++) setPx(t, x + k, y, WOOD[w === 1 ? 2 : k === 0 ? 3 : 1]);
    }
  };
  line(7, 15, 7, 10, 2);
  line(7, 10, 4, 6, 2);
  line(8, 10, 11, 5, 2);
  line(8, 9, 8, 4, 1);
  line(4, 6, 3, 3, 1);
  line(12, 5, 13, 3, 1);
  // shade the lower trunk
  for (let y = 13; y < N; y++) setPx(t, 8, y, WOOD[0]);
  return t;
}

export function hangingRoots(): TexImage {
  const t = img();
  const r = new Rand(0x4007, 3);
  for (const x0 of [2, 5, 8, 11, 13]) {
    const len = 6 + r.nextInt(7);
    let x = x0 + r.nextInt(2);
    for (let y = 0; y < len; y++) {
      if (y > 2 && r.nextFloat() < 0.2) x += r.nextBool() ? 1 : -1;
      x = Math.max(0, Math.min(15, x));
      const k = y < 2 ? 3 : y >= len - 2 ? 0 : y % 3 === 1 ? 2 : 1;
      setPx(t, x, y, ROOT[k]);
      // a few fine side hairs
      if (y > 3 && y < len - 2 && r.nextFloat() < 0.12) setPx(t, x + (r.nextBool() ? 1 : -1), y + 1, ROOT[0]);
    }
  }
  return t;
}

/** one spore blossom petal, its base at the top edge (the flower's centre) and its broad end at the bottom */
export function sporeBlossom(): TexImage {
  const t = img();
  for (let y = 0; y < N; y++) {
    const w = y < 2 ? 1 : Math.min(7, Math.round(1 + (y - 1) * 0.62 - Math.max(0, y - 12) * 1.4));
    for (let x = 8 - w; x < 8 + w; x++) {
      const edge = x === 8 - w || x === 8 + w - 1 || y === N - 1;
      let k = x < 8 ? 3 : 2;
      if (x === 7 || x === 8) k = y < 5 ? 0 : 1; // the dark vein down the middle
      if (edge) k = 1;
      if (y > 10 && !edge && x !== 7 && x !== 8) k = 4;
      setPx(t, x, y, PINK[k]);
    }
  }
  return t;
}

/** the green leafy base the blossom hangs from, seen from below */
export function sporeBlossomBase(): TexImage {
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx) + Math.PI / 4;
      const lobe = 4.4 + 2.2 * Math.abs(Math.cos(a * 2));
      if (d > lobe) continue;
      const k = d < 1.6 ? 1 : d > lobe - 1 ? 2 : dx + dy < 0 ? 5 : 4;
      setPx(t, x, y, LEAF[k]);
    }
  return t;
}

const VINE = [0x2c4515, 0x3a591c, 0x486d23, 0x577f2b, 0x679234, 0x78a33f];
const BERRY = [0x9c4617, 0xd2782a, 0xf1a73c, 0xffd873];

/** cave vines: a bushy leafy strand; `tip` ends a little short of the bottom, `lit` hangs glow berries on it */
export function caveVines(tip: boolean, lit: boolean): TexImage {
  const t = img();
  const r = new Rand(tip ? 0xc4e1 : 0xc4e0, 3);
  const end = tip ? 13 : N;
  let x = 7;
  for (let y = 0; y < end; y++) {
    if (y % 5 === 4) x += x > 7 ? -1 : 1;
    setPx(t, x, y, VINE[1]);
    // leaves on alternating sides, longer every other row
    const s = (y >> 1) % 2 === 0 ? 1 : -1;
    const len = y % 2 === 0 ? 2 + r.nextInt(2) : 1;
    for (let i = 1; i <= len; i++) setPx(t, x + s * i, y, VINE[Math.min(5, 2 + i + (s > 0 ? 0 : -1))]);
    if (r.nextFloat() < 0.5) setPx(t, x - s, y, VINE[2]);
  }
  if (tip) {
    setPx(t, x - 1, end, VINE[3]);
    setPx(t, x, end, VINE[2]);
    setPx(t, x + 1, end, VINE[4]);
  }
  if (lit) {
    const spots = tip ? [[5, 4], [10, 9]] : [[5, 2], [10, 7], [5, 12]];
    // round berries, lit from the top left
    const BALL = ['.21.', '2332', '2221', '.11.'];
    for (const [bx, by] of spots)
      BALL.forEach((row, dy) => {
        for (let dx = 0; dx < 4; dx++) if (row[dx] !== '.') setPx(t, bx + dx - 1, by + dy - 1, BERRY[+row[dx]]);
      });
  }
  return t;
}

const DRIP = [0x365f1a, 0x436f20, 0x508127, 0x5f932f, 0x6fa538, 0x82b845, 0x99c957];

/** big dripleaf top: a broad rounded leaf, veins fanning out from the stem at the back (bottom edge) */
export function bigDripleafTop(): TexImage {
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const cx = Math.min(x, 15 - x), cy = Math.min(y, 15 - y);
      if (cx + cy < 2 || (cx === 0 && cy < 3) || (cy === 0 && cx < 3)) continue;
      const dx = x - 7.5, dy = 16 - y;
      const ang = Math.atan2(dx, dy);
      let k = 4 - (x + y > 20 ? 1 : 0) + (x + y < 9 ? 1 : 0);
      if (Math.abs(dx) < 0.6) k = 2; // midrib
      else if (Math.abs(((ang / 0.42) % 1 + 1) % 1 - 0.5) < 0.12 && dy > 3) k = 3; // veins
      if (cx === 0 || cy === 0) k = 2;
      setPx(t, x, y, DRIP[Math.max(0, Math.min(6, k))]);
    }
  return t;
}

/** the leaf's rolled-down edges */
export function bigDripleafSide(): TexImage {
  const t = img();
  for (let x = 0; x < N; x++) {
    setPx(t, x, 0, DRIP[4]);
    setPx(t, x, 1, DRIP[3]);
    if (x > 1 && x < 14) setPx(t, x, 2, DRIP[2]);
    if (x > 3 && x < 12 && x % 3 !== 1) setPx(t, x, 3, DRIP[1]);
  }
  return t;
}

export function bigDripleafTip(): TexImage {
  const t = img();
  for (let x = 0; x < N; x++) {
    setPx(t, x, 0, DRIP[5]);
    setPx(t, x, 1, DRIP[4]);
    if (x > 0 && x < 15) setPx(t, x, 2, DRIP[3]);
    if (x > 2 && x < 13) setPx(t, x, 3, DRIP[2]);
  }
  return t;
}

/** dripleaf stems: a thin stalk up the middle (the small dripleaf's upper part stops short under its leaves) */
export function dripleafStem(small: boolean, top: boolean): TexImage {
  const t = img();
  const from = small && top ? 5 : 0;
  for (let y = from; y < N; y++) {
    setPx(t, 7, y, DRIP[3]);
    setPx(t, 8, y, DRIP[1]);
    if (!small && y % 7 === 3) setPx(t, 7, y, DRIP[4]);
  }
  return t;
}

/** small dripleaf leaves: one rounded leaf in the top left quarter, used for each of the three leaves */
export function smallDripleafTop(): TexImage {
  const t = img();
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const cx = Math.min(x, 7 - x), cy = Math.min(y, 7 - y);
      if (cx + cy < 1) continue;
      let k = x + y < 6 ? 5 : 4;
      if (x === 3 || x === 4) k = y > 4 ? 2 : 3;
      if (cx === 0 || cy === 0) k = 3;
      setPx(t, x, y, DRIP[k]);
    }
  return t;
}

export function smallDripleafSide(): TexImage {
  const t = img();
  for (let x = 0; x < 8; x++) {
    setPx(t, x, 0, DRIP[4]);
    setPx(t, x, 1, DRIP[2]);
  }
  return t;
}

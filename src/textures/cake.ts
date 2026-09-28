// (cake) The cake's faces (vanilla textures/block/cake_top, cake_side, cake_bottom, cake_inner; our own drawing, in the
// cake item's colours): white frosting dotted with red cherries on top; round the sides the frosting's edge running
// down in drips over golden sponge with a line of red jam through it; a darker baked crust underneath; and where it's
// been eaten, the inside: the frosting, crumbly sponge, the jam. The cake is 8 pixels high, so the sides and the cut
// face are drawn in the tile's lower half (the upper half repeats it, for the mipmaps' sake).

import { type TexDef, type TexImage, img, setPx, mixC } from './tex';
import { N, rng, fbm, quantize } from './blocklib/core';

/** frosting, highlight → deep shade */
const FROST = [0xfffdf8, 0xf6f1e8, 0xebe3d4, 0xd8cebc];
/** a cherry: bright, its body, its shadow */
const CHERRY = [0xf0443c, 0xc41f25, 0x7c1119];
/** sponge, light → dark */
const SPONGE = [0xe9bd72, 0xd79f53, 0xc28642, 0xa66d33, 0x87552a];
/** the jam */
const JAM = [0xcc3431, 0xa2232a];

/** `k` tones of noise over the tile, seeded by `seed`, in proportions `weights` */
function tones(seed: string, weights: number[], octaves: [number, number, number][] = [[4, 4, 0.6], [2, 2, 0.4]]): Int32Array {
  return quantize(fbm(rng(seed), octaves, 0.3), weights);
}

/** the frosted top, cherries on it, its edge (1 and 14: where the 14-wide top ends) a little shaded */
function cakeTop(): TexImage {
  const t = img();
  const k = tones('cake_top', [1, 6, 2]);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      setPx(t, x, y, e === 0 ? FROST[3] : e === 1 ? FROST[2] : FROST[k[y * N + x]]);
    }
  // the cherries: a bright pixel with its shadow below and to the right, none too near another or the edge
  const r = rng('cake_top_cherries');
  const put: [number, number][] = [];
  for (let tries = 0; put.length < 6 && tries < 200; tries++) {
    const x = 3 + r.nextInt(10), y = 3 + r.nextInt(9);
    if (put.some(([px, py]) => Math.abs(px - x) + Math.abs(py - y) < 4)) continue;
    put.push([x, y]);
    setPx(t, x, y, CHERRY[1]);
    setPx(t, x + 1, y, CHERRY[1]);
    setPx(t, x, y + 1, CHERRY[1]);
    setPx(t, x + 1, y + 1, CHERRY[2]);
    setPx(t, x, y, CHERRY[0]);
  }
  return t;
}

/** the drips' lengths along a side (0 to 2 below the frosting's 3 rows), a little uneven */
function drips(seed: string): number[] {
  const r = rng(seed);
  const d: number[] = [];
  for (let x = 0; x < N; x++) {
    const prev = d[x - 1] ?? 1;
    const v = r.next();
    d.push(v < 0.3 ? 0 : v < 0.7 ? Math.min(2, prev + (v < 0.5 ? 0 : 1)) : Math.max(0, prev - 1));
  }
  return d;
}

/** the tile's lower half drawn by `p` (row 0..7 from the cake's top), the upper half the same again */
function lowerHalf(p: (x: number, r: number) => number): TexImage {
  const t = img();
  for (let r = 0; r < 8; r++)
    for (let x = 0; x < N; x++) {
      const c = p(x, r);
      setPx(t, x, 8 + r, c);
      setPx(t, x, r, c);
    }
  return t;
}

/** a side: 3 rows of frosting and its drips, sponge with the jam through it, the crust at the foot */
function cakeSide(): TexImage {
  const d = drips('cake_side_drips');
  const k = tones('cake_side', [2, 5, 3, 1]);
  return lowerHalf((x, r) => {
    if (r === 0) return FROST[0];
    if (r < 3) return (x + r) % 7 === 0 ? FROST[2] : FROST[1];
    if (r < 3 + d[x]) return r === 2 + d[x] ? FROST[2] : FROST[1];
    const sponge = SPONGE[k[(8 + r) * N + x]];
    if (r === 5) return (x * 5 + 3) % 11 === 0 ? JAM[1] : JAM[0];
    if (r === 7) return mixC(sponge, SPONGE[4], 0.55);
    // (the drips' shadow on the sponge just under them)
    if (r === 3 + d[x]) return mixC(sponge, SPONGE[3], 0.45);
    return sponge;
  });
}

/** the underside: the baked crust */
function cakeBottom(): TexImage {
  const t = img();
  const k = tones('cake_bottom', [1, 3, 4, 2]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) setPx(t, x, y, SPONGE[1 + k[y * N + x]]);
  return t;
}

/** the cut face: frosting over light, crumbly sponge, the jam, the crust */
function cakeInner(): TexImage {
  const k = tones('cake_inner', [3, 4, 1], [[2, 2, 0.7], [4, 4, 0.3]]);
  return lowerHalf((x, r) => {
    if (r === 0) return FROST[1];
    if (r === 1) return FROST[2];
    if (r === 4) return JAM[(x + 1) % 5 === 0 ? 1 : 0];
    if (r === 7) return SPONGE[3];
    // (crumbs: the sponge's air holes a shade darker)
    return SPONGE[k[(8 + r) * N + x]];
  });
}

/** the cake's four faces for the block atlas */
export function registerCakeTextures(T: Record<string, () => TexDef>): void {
  T['cake_top'] = cakeTop;
  T['cake_side'] = cakeSide;
  T['cake_bottom'] = cakeBottom;
  T['cake_inner'] = cakeInner;
}

// The bone block (vanilla block/bone_block_side, bone_block_top): four long bones bundled lengthwise, their shafts
// side by side up the sides, lit on their left and in shadow where they meet, with fine grain and the odd knuckle;
// on the top, their ends cut across, a hard pale rim round the pitted marrow.

import { TexImage, img, setPx } from '../tex';
import { N, rng, idx, fbm } from './core';

type Gen = () => TexImage;

/** bone, deepest shadow to highlight */
const BONE = [0x857c61, 0xa39b7f, 0xbcb597, 0xcfc9ab, 0xdcd7be, 0xe7e3cf, 0xf1eee1];
const tone = (k: number) => BONE[Math.max(0, Math.min(BONE.length - 1, k))];

/** across a shaft 8 wide: the rounded bone lit from the left, dark where it meets the next */
const SHAFT = [2, 4, 5, 5, 5, 4, 3, 1];

/** the side: two shafts on each face, grained lengthwise, a knuckle or two across them */
function boneSide(): TexImage {
  const r = rng('bone_block_side', 3);
  // (the grain: noise drawn out up the shaft)
  const grain = fbm(r, [[2, 8, 0.5], [1, 4, 0.3]], 0.2);
  const k = new Int32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const g = grain[idx(x, y)];
      k[idx(x, y)] = SHAFT[x & 7] + (g > 0.78 ? 1 : g < 0.2 ? -1 : 0);
    }
  // each shaft's knuckle: a shaded ridge across it with the light catching its lower lip
  for (const x0 of [0, 8]) {
    const y = 3 + r.nextInt(10);
    for (let x = x0 + 1; x < x0 + 7; x++) {
      k[idx(x, y)] = Math.min(k[idx(x, y)], SHAFT[x & 7] - 2);
      k[idx(x, y + 1)] = Math.max(k[idx(x, y + 1)], SHAFT[x & 7] + 1);
    }
  }
  // pits in the bone
  for (let i = 0; i < 5; i++) {
    const x = r.nextInt(N), y = r.nextInt(N);
    if ((x & 7) === 0 || (x & 7) === 7) continue;
    k[idx(x, y)] = Math.min(k[idx(x, y)], 1);
    k[idx(x + 1, y + 1)] = Math.max(k[idx(x + 1, y + 1)], SHAFT[(x + 1) & 7] + 1);
  }
  const t = img();
  for (let i = 0; i < N * N; i++) setPx(t, i % N, Math.floor(i / N), tone(k[i]));
  return t;
}

/** the top: the four bones' ends, a pale rim lit on its top left round a darker pitted marrow, shade between */
function boneTop(): TexImage {
  const r = rng('bone_block_top', 3);
  const pits = fbm(r, [[2, 2, 0.6], [1, 1, 0.4]]);
  const t = img();
  const ends = [[3.5, 3.5], [11.5, 3.5], [3.5, 11.5], [11.5, 11.5]].map(([cx, cy]) => [cx + (r.next() - 0.5) * 0.6, cy + (r.next() - 0.5) * 0.6, 3.6 + r.next() * 0.35]);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let k = pits[idx(x, y)] < 0.5 ? 1 : 2;
      for (const [cx, cy, rad] of ends) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
        if (d > rad + 0.4) continue;
        // (-1 on the lit top left of the round, +1 on its far side)
        const side = (dx + dy) / (Math.SQRT2 * Math.max(d, 0.001));
        if (d > rad - 1.3) k = side < -0.2 ? 6 : side > 0.45 ? 4 : 5;
        else if (d > rad - 2) k = side > 0.2 ? 5 : 4;
        else k = pits[idx(x, y)] < 0.35 ? 2 : 3;
      }
      setPx(t, x, y, tone(k));
    }
  return t;
}

/** add the bone block's textures to a registry (textures/blocks.ts) */
export function registerFossilTextures(T: Record<string, () => TexImage | { w: number; h: number; frames: Uint8ClampedArray[] }>): void {
  const G = T as Record<string, Gen>;
  G['bone_block_side'] = boneSide;
  G['bone_block_top'] = boneTop;
}

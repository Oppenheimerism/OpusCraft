// The campfire's smoke (vanilla particle/big_smoke_0-11, which campfire_cosy_smoke and campfire_signal_smoke pick
// from at random): soft grey billows, each a little smaller and thinner than the one before.

import { TexImage, img, setPx, gray } from './tex';
import { rng, fbm, sample } from './blocklib/core';

export function bigSmoke(i: number): TexImage {
  const r = rng('big_smoke', i);
  const t = img();
  const lumps = fbm(r, [[8, 8, 0.5], [4, 4, 0.35], [2, 2, 0.15]]);
  const tone = fbm(r, [[4, 4, 0.6], [2, 2, 0.4]]);
  const cx = 7.5 + (r.nextFloat() - 0.5) * 1.5, cy = 7.5 + (r.nextFloat() - 0.5) * 1.5;
  const radius = 6.8 - i * 0.26;
  const thin = i * 0.018;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - cx, y - cy) / radius + (sample(lumps, x, y) - 0.5) * 0.55;
      if (d >= 1 || r.nextFloat() < thin * (0.4 + d)) continue;
      // lighter in the middle of the billow, greyer at its edge
      const v = 0.86 - d * 0.16 + (sample(tone, x, y) - 0.5) * 0.12;
      setPx(t, x, y, gray(Math.round(Math.max(0.55, Math.min(0.92, v)) * 255)));
    }
  return t;
}

export function campfireSmokeTextures(): Record<string, () => TexImage> {
  const out: Record<string, () => TexImage> = {};
  for (let i = 0; i < 12; i++) out[`big_smoke_${i}`] = () => bigSmoke(i);
  return out;
}

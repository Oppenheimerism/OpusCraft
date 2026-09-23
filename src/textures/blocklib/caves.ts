// Cave blocks: glow lichen (vanilla block/glow_lichen: a crust of small rounded
// pale sea-green lobes, darker at the rims, with bright glowing specks, on a
// transparent background; the lobes wrap round the edges so sheets tile).

import { TexImage, img, setPx, whiteNoise, Rand } from '../tex';
import { N } from './core';

const LICHEN = [0x3e5f55, 0x537a6b, 0x6b9483, 0x86ad9a, 0xa4c8b4, 0xd2ecdc];

export function glowLichen(): TexImage {
  const t = img();
  const r = new Rand(0x5eed01, 3);
  const lobes: [number, number, number][] = [];
  for (let i = 0; i < 24; i++) lobes.push([r.nextFloat() * N, r.nextFloat() * N, 1.5 + r.nextFloat() * 1.3]);
  const speck = whiteNoise(r, N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // distance to the nearest lobe centre, as a fraction of its radius
      let d = Infinity;
      for (const [cx, cy, rad] of lobes) {
        let dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy);
        dx = Math.min(dx, N - dx);
        dy = Math.min(dy, N - dy);
        d = Math.min(d, Math.hypot(dx, dy) / rad);
      }
      if (d > 1) continue;
      const n = speck[y * N + x];
      let k = d > 0.78 ? 1 : d > 0.5 ? 2 : d > 0.25 ? 3 : 4;
      if (n > 0.8) k++;
      else if (n < 0.15) k--;
      setPx(t, x, y, LICHEN[Math.max(0, Math.min(5, k))]);
    }
  return t;
}

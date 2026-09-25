// The trial chambers' own blocks' textures (1.21): the heavy core (vanilla block/heavy_core: its top, bottom and side
// in three quarters of the sheet, as models/block/heavy_core.json maps them). Original pixel art.

import { TexImage, type TexDef, img, setPx } from '../tex';
import { rng, fbm, quantize } from './core';

type Gen = () => TexImage;

/** the heavy core's dense dark metal, darkest to its steely sheen */
const HEAVY = [0x17191d, 0x22252a, 0x2e3137, 0x3b3f46, 0x4d525a, 0x676e77, 0x8e969f];

/**
 * vanilla block/heavy_core: an 8x8 face in each of three quarters, the top (u 0-8, v 0-8) and the sides (u 0-8,
 * v 8-16) cast metal lit from the upper left with a sheen off its top edge, the bottom (u 8-16, v 0-8) darker
 */
function heavyCore(): TexImage {
  const t = img();
  const grain = quantize(fbm(rng('heavy_core'), [[4, 4, 0.5], [2, 2, 0.4]], 0.3, 16, 16), [1, 3, 5, 3, 1]);
  const face = (ox: number, oy: number, base: number, sheen: boolean) => {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        let k = base + grain[(oy + y) * 16 + ox + x] - 2;
        if (x === 0 || y === 0) k += 2;
        else if (x === 7 || y === 7) k -= 2;
        else if (x === 1 || y === 1) k += 1;
        if (sheen && y >= 1 && y <= 2 && x >= 2 && x <= 4) k += 2;
        setPx(t, ox + x, oy + y, HEAVY[Math.max(0, Math.min(6, k))]);
      }
  };
  face(0, 0, 3, true);
  face(8, 0, 1, false);
  face(0, 8, 2, true);
  // the sides' band where the core was cast in two halves
  for (let x = 0; x < 8; x++) {
    setPx(t, x, 12, HEAVY[x === 0 ? 2 : 1]);
    setPx(t, x, 13, HEAVY[x === 7 ? 3 : 4]);
  }
  return t;
}

export function registerTrialChamberTextures(T: Record<string, () => TexDef>): void {
  T['heavy_core'] = heavyCore;
}

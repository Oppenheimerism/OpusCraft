// The blocks of villages (vanilla block/*.png for the job sites and village furniture): the bell's particle face,
// barrel, composter, smoker, blast furnace, cauldron, lectern, the cartography / fletching / smithing tables,
// loom, stonecutter, brewing stand, flower pot and campfire.

import { TexImage, TexDef, img, setPx, getPx, mixC, mulC, Rand } from '../tex';
import { N, rng, fbm, quantize, paint, noise, white, mix, normalize } from './core';
import { BELL_GOLD } from '../bellBody';

type Reg = Record<string, () => TexDef>;

void getPx;
void mulC;
void noise;
void white;
void mix;
void normalize;
void fbm;
void quantize;
void paint;

// ---------------------------------------------------------------------------
// Bell (the body is the block entity's; this is only its particle face, vanilla block/bell_bottom)

export function bellBottom(): TexImage {
  const r: Rand = rng('bell_bottom');
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      let k = d > 6.5 ? 3 : d > 5.5 ? 5 : d > 4.5 ? 2 : 1;
      if (r.chance(0.15)) k += r.chance(0.5) ? 1 : -1;
      setPx(t, x, y, d < 1 ? BELL_GOLD[3] : BELL_GOLD[Math.max(0, Math.min(7, k))]);
    }
  return t;
}

export function registerVillageTextures(T: Reg): void {
  T['bell_bottom'] = bellBottom;
  void mixC;
}

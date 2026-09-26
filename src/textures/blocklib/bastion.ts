// (bastions) Textures of the blocks that came with the bastion remnants: polished basalt (vanilla
// block/polished_basalt_side and _top: basalt's columns planed smooth, long vertical flutes on the sides and square
// rings on the cut end), the block of netherite (vanilla block/netherite_block: dark brownish metal cast in heavy
// courses, each a little proud of the next) and the lodestone (vanilla block/lodestone_side and _top: chiselled
// stone brick round a band of netherite, and on top the band's ring round a dark magnetic core). Original pixel art.

import { TexImage, type TexDef, img, setPx } from '../tex';
import { rng, fbm, quantize, N } from './core';

/** basalt's greys, a little lighter where it's been smoothed */
const POLISHED_BASALT = [0x2c2c30, 0x38383d, 0x444449, 0x505055, 0x5d5d62, 0x6b6b70, 0x7c7c81];

const clamp6 = (k: number) => Math.max(0, Math.min(6, k));

/** polished basalt's side: flutes running the height of the block, a ridge of light down each and a groove between */
function polishedBasaltSide(): TexImage {
  const r = rng('polished_basalt_side', 1);
  const grain = quantize(fbm(r, [[2, 16, 0.4], [1, 8, 0.25], [4, 8, 0.2]], 0.15), [1, 3, 4, 3, 1]);
  // the flutes' profile across the face: groove, rising flank, ridge, falling flank (5, 5 and 6 wide)
  const PROFILE = [0, 2, 4, 5, 3, 1, 2, 4, 5, 4, 2, 0, 2, 4, 5, 3];
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let k = PROFILE[x] + grain[y * N + x] - 2;
      // the block's top and bottom edges catch the light and fall into shadow
      if (y === 0) k += 1;
      if (y === N - 1) k -= 1;
      setPx(t, x, y, POLISHED_BASALT[clamp6(k)]);
    }
  return t;
}

/** polished basalt's top: square rings planed flat, the outermost lit on its upper left */
function polishedBasaltTop(): TexImage {
  const r = rng('polished_basalt_top', 1);
  const grain = quantize(fbm(r, [[4, 4, 0.5], [2, 2, 0.4]], 0.2), [1, 3, 4, 3, 1]);
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const ring = Math.min(x, y, 15 - x, 15 - y);
      let k = [4, 2, 3, 4, 3, 2, 1, 1][ring] + grain[y * N + x] - 2;
      if (ring === 0) k = x === 0 || y === 0 ? 5 : 1;
      setPx(t, x, y, POLISHED_BASALT[clamp6(k)]);
    }
  return t;
}

/** netherite's dark metal, shadow to sheen (vanilla's has a faint warm cast) */
const NETHERITE = [0x1a1617, 0x241f20, 0x2e2829, 0x393233, 0x453d3e, 0x544b4b, 0x675d5c];

/** the block of netherite: courses of cast metal four pixels deep, joined in staggered seams, lit from the top */
function netheriteBlock(): TexImage {
  const r = rng('netherite_block', 2);
  const grain = quantize(fbm(r, [[8, 2, 0.45], [4, 1, 0.3], [2, 2, 0.15]], 0.2), [1, 3, 5, 3, 1]);
  const t = img();
  for (let y = 0; y < N; y++) {
    const course = y >> 2, row = y & 3;
    // each course's vertical seam, offset from the one below
    const seam = [3, 11, 6, 14][course];
    for (let x = 0; x < N; x++) {
      let k = 3 + grain[y * N + x] - 2;
      if (row === 0) k += 2;
      else if (row === 3) k -= 2;
      if (x === seam) k = 0;
      else if (x === (seam + 1) % N) k += 1;
      setPx(t, x, y, NETHERITE[clamp6(k)]);
    }
  }
  return t;
}

/** the lodestone's stone, a pale chiselled grey */
const STONE = [0x5b5a5c, 0x6c6b6d, 0x7c7b7d, 0x8b8a8c, 0x9a999b, 0xa9a8aa, 0xbab9bb];

/** the lodestone's side: chiselled stone above and below, the band of netherite round its middle */
function lodestoneSide(): TexImage {
  const r = rng('lodestone_side', 3);
  const grain = quantize(fbm(r, [[4, 4, 0.5], [2, 2, 0.3]], 0.25), [1, 3, 4, 3, 1]);
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const g = grain[y * N + x] - 2;
      if (y >= 6 && y <= 9) {
        // the band: netherite, a lit top edge, a rivet at each quarter
        let k = 3 + g;
        if (y === 6) k = 5;
        if (y === 9) k = 1;
        if ((x === 2 || x === 7 || x === 12) && (y === 7 || y === 8)) k = y === 7 ? 6 : 2;
        setPx(t, x, y, NETHERITE[clamp6(k)]);
        continue;
      }
      // the stone: a bevelled frame round each half, the edges of the block dark
      const top = y < 6, y0 = top ? 0 : 10, y1 = top ? 5 : 15;
      let k = 3 + g;
      if (y === y0 || x === 0) k = 5;
      if (y === y1 || x === N - 1) k = 1;
      if ((y === y0 + 1 || x === 1) && y !== y1 && x !== N - 1) k = Math.max(k, 4);
      // a chiselled groove across each half
      if (y === (top ? 3 : 12) && x > 2 && x < 13) k = 1;
      setPx(t, x, y, STONE[clamp6(k)]);
    }
  return t;
}

/** the lodestone's top: the stone round the band's ring, and inside it the dark core with the needle's cross */
function lodestoneTop(): TexImage {
  const r = rng('lodestone_top', 3);
  const grain = quantize(fbm(r, [[4, 4, 0.5], [2, 2, 0.3]], 0.25), [1, 3, 4, 3, 1]);
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const g = grain[y * N + x] - 2;
      const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
      if (d < 3.2) {
        // the core: dark, with a lighter cross where the needle's arms point
        const cross = Math.abs(dx) < 1 || Math.abs(dy) < 1;
        setPx(t, x, y, NETHERITE[clamp6((cross ? 3 : 1) + (g > 0 ? 1 : 0))]);
      } else if (d < 5.6) {
        setPx(t, x, y, NETHERITE[clamp6(3 + g + (dx + dy < 0 ? 1 : -1))]);
      } else {
        let k = 3 + g;
        if (x === 0 || y === 0) k = 5;
        if (x === N - 1 || y === N - 1) k = 1;
        setPx(t, x, y, STONE[clamp6(k)]);
      }
    }
  return t;
}

export function registerBastionTextures(T: Record<string, () => TexDef>): void {
  T['polished_basalt_side'] = polishedBasaltSide;
  T['polished_basalt_top'] = polishedBasaltTop;
  T['netherite_block'] = netheriteBlock;
  T['lodestone_side'] = lodestoneSide;
  T['lodestone_top'] = lodestoneTop;
}

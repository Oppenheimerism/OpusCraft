// The ocean's block textures (Stage 5: ocean; vanilla block/prismarine.png, prismarine_bricks.png,
// dark_prismarine.png, wet_sponge.png): prismarine's mottled cyan-green, its hue drifting between green and blue
// (animated, 15 seconds a frame, blended like vanilla's); the bricks in staggered rows; the dark prismarine's four
// bevelled panels; and the wet sponge, darker and soggier than the dry one.

import { TexImage, TexDef, setPx, getPx, mixC, anim } from '../tex';
import { N, rng, fbm, quantize, paint } from './core';
import { speckled } from './terrain';

type Reg = Record<string, () => TexDef>;

const PRISMARINE_GREEN = [0x2c5a52, 0x3a7066, 0x4a8679, 0x5a998a, 0x6dac9b, 0x87c2b0];
const PRISMARINE_BLUE = [0x2c4f5e, 0x3a6676, 0x4a7c8b, 0x5a909c, 0x6da3ad, 0x87b9c2];

/** one frame of prismarine: the same mottle each time, its colours `t` of the way from green to blue */
function prismarineFrame(t: number): TexImage {
  const r = rng('prismarine');
  const tones = quantize(fbm(r, [[4, 4, 0.45], [2, 2, 0.35], [1, 1, 0.2]], 0.25), [0.6, 1.6, 4, 5, 3, 1.2]);
  const pal = PRISMARINE_GREEN.map((c, i) => mixC(c, PRISMARINE_BLUE[i], t));
  const out = paint(tones, pal);
  // a few dark cracks wandering across, as the tiles of vanilla's have
  const cr = rng('prismarine_cracks');
  for (let k = 0; k < 5; k++) {
    let x = cr.nextInt(N), y = cr.nextInt(N);
    for (let s = 0; s < 4 + cr.nextInt(4); s++) {
      setPx(out, x, y, pal[0]);
      if (cr.chance(0.5)) x = (x + (cr.chance(0.5) ? 1 : N - 1)) % N;
      else y = (y + (cr.chance(0.5) ? 1 : N - 1)) % N;
    }
  }
  return out;
}

/** vanilla prismarine.png.mcmeta: frametime 300, interpolate (here four hues, green to blue and back) */
function prismarine(): TexDef {
  const a = anim(N, N, 4, 300, (i) => prismarineFrame(i / 3), true);
  a.order = [0, 1, 2, 3, 2, 1];
  return a;
}

/** staggered rows of bricks four high, dark seams, each brick lit along its top and left */
function prismarineBricks(): TexImage {
  const r = rng('prismarine_bricks');
  const pal = [0x2f5f55, 0x4f9483, 0x5ea694, 0x6bb3a1, 0x7cc2b0, 0x98d5c5];
  const tones = quantize(fbm(r, [[2, 2, 0.5], [1, 1, 0.5]], 0.3), [1, 3, 4, 2, 0.6]);
  const t = paint(tones.map((k) => k + 1), pal);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const row = y >> 2, ly = y & 3;
      const lx = (x + (row & 1 ? 4 : 0)) & 7;
      if (ly === 3 || lx === 7) setPx(t, x, y, pal[0]);
      else if (ly === 0 || lx === 0) setPx(t, x, y, mixC(getPx(t, x, y), pal[5], 0.45));
      else if (ly === 2 && lx === 6) setPx(t, x, y, mixC(getPx(t, x, y), pal[0], 0.5));
    }
  return t;
}

/** four panels, each framed dark with a lit inner bevel and a darker heart */
function darkPrismarine(): TexImage {
  const r = rng('dark_prismarine');
  const pal = [0x14281f, 0x1f3a30, 0x2a4c40, 0x345c4e, 0x41705f, 0x5a8b79];
  const tones = quantize(fbm(r, [[2, 2, 0.5], [1, 1, 0.5]], 0.35), [1, 3, 4, 1.5]);
  const t = paint(tones.map((k) => k + 1), pal);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const lx = x & 7, ly = y & 7;
      if (lx === 0 || ly === 0) setPx(t, x, y, pal[0]);
      else if (lx === 1 || ly === 1) setPx(t, x, y, mixC(getPx(t, x, y), pal[5], 0.5));
      else if (lx === 7 || ly === 7) setPx(t, x, y, mixC(getPx(t, x, y), pal[0], 0.55));
      else if (lx >= 3 && lx <= 5 && ly >= 3 && ly <= 5) setPx(t, x, y, mixC(getPx(t, x, y), pal[1], 0.35));
    }
  return t;
}

/** the sponge soaked: darker, olive, the holes deep and wet */
function wetSponge(): TexImage {
  const r = rng('wet_sponge');
  const t = speckled('wet_sponge', [0x5f5a17, 0x736d1e, 0x847e25, 0x948d2c, 0xa29b35, 0xaea741, 0xbab250], {
    oct: [[4, 4, 0.4], [2, 2, 0.4]], white: 0.4, weights: [0, 0.6, 2, 4, 2, 0.7, 0.2], mode: 1, dark: 0, light: 5, lightSize: [1, 2],
  });
  for (let k = 0; k < 16; k++) {
    const x = r.nextInt(N), y = r.nextInt(N);
    const big = r.chance(0.5);
    setPx(t, x, y, 0x3f3b0c);
    if (big) {
      setPx(t, x + 1, y, 0x514c12);
      setPx(t, x, y + 1, 0x514c12);
    }
    // a bead of water on the lower rim
    setPx(t, x, y + (big ? 2 : 1), r.chance(0.35) ? 0x9fb8a8 : 0xc2b85a);
  }
  return t;
}

export function registerOceanTextures(T: Reg): void {
  T['prismarine'] = prismarine;
  T['prismarine_bricks'] = prismarineBricks;
  T['dark_prismarine'] = darkPrismarine;
  T['wet_sponge'] = wetSponge;
}

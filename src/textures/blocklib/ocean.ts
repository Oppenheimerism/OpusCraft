// The ocean's block textures (Stage 5: ocean; vanilla block/prismarine.png, prismarine_bricks.png,
// dark_prismarine.png, wet_sponge.png, conduit.png): prismarine's mottled cyan-green, its hue drifting between green
// and blue (animated, 15 seconds a frame, blended like vanilla's); the bricks in staggered rows; the dark prismarine's
// four bevelled panels; the wet sponge, darker and soggier than the dry one; and the conduit's heart in its shell.
// And (M6) the turtle egg's shell (vanilla turtle_egg.png, turtle_egg_slightly_cracked.png, turtle_egg_very_cracked.png).

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

/**
 * vanilla block/conduit.png (its item's and its breaking specks'; the conduit itself is drawn by its renderer): the
 * heart of the sea in its cage of nautilus shell, seen side on
 */
function conduit(): TexImage {
  const t: TexImage = { w: N, h: N, data: new Uint8ClampedArray(N * N * 4) };
  const HEART = [0x061634, 0x103c7a, 0x18549a, 0x2470bc, 0x3a92d8, 0x7ac4f0];
  for (let j = 0; j < 10; j++)
    for (let i = 0; i < 10; i++) {
      const ring = Math.min(i, j, 9 - i, 9 - j);
      let c: number;
      if (ring === 0) c = (i + j) % 3 === 0 ? 0xb07a5a : 0x6a4a3a;
      else if (ring === 1) c = (i * 2 + j) % 4 === 0 ? 0xb07a5a : (i + j) % 2 ? 0xf0e0d0 : 0xfaf0e6;
      else {
        const d = Math.hypot(i - 4.5, j - 4.5);
        const k = Math.round(4 - d * 1.1 + (i + j < 9 ? 0.6 : -0.3));
        c = d > 3.1 ? HEART[0] : HEART[Math.max(1, Math.min(5, k))];
      }
      setPx(t, 3 + i, 3 + j, c);
    }
  return t;
}

/** the parts of the egg texture the eggs' sides and tops show (world/blocksOcean.ts EGG_PLACES): where the cracks go */
const EGG_FACES: [number, number, number, number][] = [
  [1, 4, 4, 7], [10, 1, 3, 5], [11, 8, 3, 4], [1, 11, 3, 5], [0, 0, 4, 4], [6, 7, 3, 3], [6, 12, 3, 3], [12, 13, 3, 3],
];

/**
 * a turtle egg's shell: a warm off-white, faintly mottled, with small sea-green flecks; cracked (`stage` 1, 2), dark
 * lines run down each egg's sides from the top, longer and forking the second time, the gaps darker still
 */
function turtleEgg(stage: number): TexImage {
  const r = rng('turtle_egg');
  const SHELL = [0xd5cfb6, 0xe1dcc6, 0xebe7d6, 0xf4f1e6];
  const FLECK = [0x6fa98c, 0x86bda1, 0x9dcdb4];
  const t = paint(quantize(fbm(r, [[4, 4, 0.5], [2, 2, 0.5]], 0.35), [1, 3, 5, 3]), SHELL);
  for (let k = 0; k < 26; k++) {
    const x = r.nextInt(N), y = r.nextInt(N);
    setPx(t, x, y, FLECK[r.nextInt(FLECK.length)]);
    if (r.chance(0.25)) setPx(t, x + 1, y, FLECK[1]);
  }
  if (stage === 0) return t;
  const cr = rng('turtle_egg_cracks');
  const CRACK = 0x5d5746, GAP = 0x39352a;
  for (const [x0, y0, w, h] of EGG_FACES) {
    const lines = stage === 1 ? 1 : 2;
    for (let n = 0; n < lines; n++) {
      let x = x0 + cr.nextInt(w);
      const len = stage === 1 ? Math.max(2, Math.ceil(h * 0.6)) : h;
      for (let y = y0; y < y0 + len; y++) {
        setPx(t, x, y, stage === 2 && n === 0 && y > y0 && cr.chance(0.3) ? GAP : CRACK);
        // (the line wanders a pixel to one side now and then, staying on its egg's face)
        if (cr.chance(0.45)) x = Math.max(x0, Math.min(x0 + w - 1, x + (cr.chance(0.5) ? 1 : -1)));
      }
    }
  }
  return t;
}

export function registerOceanTextures(T: Reg): void {
  T['prismarine'] = prismarine;
  T['prismarine_bricks'] = prismarineBricks;
  T['dark_prismarine'] = darkPrismarine;
  T['wet_sponge'] = wetSponge;
  T['conduit'] = conduit;
  T['turtle_egg'] = () => turtleEgg(0);
  T['turtle_egg_slightly_cracked'] = () => turtleEgg(1);
  T['turtle_egg_very_cracked'] = () => turtleEgg(2);
}

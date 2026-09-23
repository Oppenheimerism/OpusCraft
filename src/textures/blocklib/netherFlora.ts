// Nether forests: the crimson and warped stems (their glowing streaks pulse),
// stripped stems, planks, fungi, roots, nether sprouts, weeping and twisting
// vines, and shroomlight.

import { TexImage, img, setPx, getPx, plot, mixC, anim, AnimTex } from '../tex';
import { N, rng, idx, fbm, quantize, paint } from './core';
import { barkRidged, logTop, planks, strippedSide, WoodDef } from './wood';
import { sprite, blades } from './plants';

export type NetherWood = 'crimson' | 'warped';

export const NETHER_WOOD: Record<NetherWood, WoodDef & { glow: number[] }> = {
  crimson: {
    bark: [0x2e0e18, 0x3f1421, 0x4f1a2a, 0x5e2133, 0x6d283b, 0x7c3044],
    wood: [0x3f1628, 0x5a2640, 0x672c49, 0x733353, 0x7e3a5c, 0x8a4266],
    ring: [0x8c3d5e, 0x7a3150, 0x5c2037],
    glow: [0x9b2b2b, 0xc23a33, 0xe0543f],
  },
  warped: {
    bark: [0x1a1426, 0x241c33, 0x2f2440, 0x3a2c4c, 0x453557, 0x503e61],
    wood: [0x173d3a, 0x215a55, 0x28665f, 0x2e716a, 0x357d75, 0x3c8980],
    ring: [0x3a8a80, 0x2b6d65, 0x1d4c48],
    glow: [0x138a74, 0x1fb394, 0x3fdcb6],
  },
};

const STRIPPED: Record<NetherWood, WoodDef> = {
  crimson: { ...NETHER_WOOD.crimson, wood: [0x5c1e3a, 0x7a2b4e, 0x873257, 0x93395f, 0x9f4168, 0xab4a72] },
  warped: { ...NETHER_WOOD.warped, wood: [0x1f5550, 0x2c7a72, 0x33867e, 0x3a9189, 0x429d94, 0x4ba89f] },
};

/**
 * A stem's side: ridged dark bark with streaks of glowing flesh showing through the cracks; the streaks
 * brighten and fade over five frames.
 */
export function stemSide(kind: NetherWood): AnimTex {
  const w = NETHER_WOOD[kind];
  const base = barkRidged(kind + '_stem', w.bark, { crevices: 5, breakP: 0.45, amp: 0.55, partial: 0.4 });
  const r = rng(kind + '_stem_glow');
  // streak pixels: short vertical runs in the darker (crevice) parts
  const streak = new Float32Array(N * N);
  for (let k = 0; k < 7; k++) {
    const x = r.nextInt(N), y0 = r.nextInt(N), len = 2 + r.nextInt(4);
    const phase = r.next();
    for (let i = 0; i < len; i++) {
      const j = idx(x, y0 + i);
      streak[j] = Math.max(streak[j], 0.35 + phase * 0.65 - (i === 0 || i === len - 1 ? 0.25 : 0));
    }
  }
  const pulse = [0.55, 0.8, 1, 0.8, 0.6];
  return anim(N, N, pulse.length, 10, (f) => {
    const t = img();
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const j = idx(x, y);
        const s = streak[j] * pulse[f];
        const c = getPx(base, x, y);
        setPx(t, x, y, s <= 0 ? c : mixC(c, w.glow[s > 0.8 ? 2 : s > 0.5 ? 1 : 0], Math.min(1, 0.45 + s * 0.55)));
      }
    return t;
  }, true);
}

export const stemTop = (kind: NetherWood): TexImage => logTop(kind + '_stem_top', NETHER_WOOD[kind]);
export const strippedStemSide = (kind: NetherWood): TexImage => strippedSide('stripped_' + kind + '_stem', STRIPPED[kind]);
export const strippedStemTop = (kind: NetherWood): TexImage => logTop(kind + '_stem_top', STRIPPED[kind], true);
export const netherPlanks = (kind: NetherWood): TexImage => planks(kind + '_planks', NETHER_WOOD[kind]);

// ---------------------------------------------------------------------------
// Fungi

/** a fungus: a lumpy cap flecked with orange-yellow over a pale, crooked stalk */
export function fungus(kind: NetherWood): TexImage {
  const cap = kind === 'crimson' ? { C: 0xa1201f, c: 0x75131c, H: 0xc8352c } : { C: 0x14a283, c: 0x0b6d5e, H: 0x2fcaa0 };
  return sprite(
    [
      '................',
      '................',
      '................',
      '.....cCCCc......',
      '....cCHoCHc.....',
      '...cCoCCCoCc....',
      '...CCCCoCCCCc...',
      '..cCHCCCCHoCc...',
      '..ccCCoCCCCcc...',
      '....cccsccc.....',
      '.......sS.......',
      '.......sS.......',
      '......ssS.......',
      '.......sS.......',
      '......sSs.......',
      '.....s..Ss......',
    ],
    { ...cap, o: kind === 'crimson' ? 0xf5a33d : 0xf38b2c, s: 0xd9c6ad, S: 0xa89379 },
  );
}

// ---------------------------------------------------------------------------
// Roots, sprouts, vines

const ROOT_PAL: Record<NetherWood, number[]> = {
  crimson: [0x5e0f15, 0x7a141c, 0x951c22, 0xad272a, 0xc23633, 0xd44b3f, 0xe36a50],
  warped: [0x0b4d45, 0x0f6358, 0x14786a, 0x1a8c7b, 0x22a08d, 0x2eb39f, 0x45c7b2],
};

/** a tuft of spindly roots, curling as they rise */
export function roots(kind: NetherWood): TexImage {
  const t = blades(kind + '_roots', { count: 9, hmin: 7, hmax: 13, pal: ROOT_PAL[kind], curl: 0.45, x0: 2, x1: 13 });
  // little bulbs on a few tips
  const r = rng(kind + '_roots_bulbs');
  for (let k = 0; k < 3; k++) {
    const x = 3 + r.nextInt(10);
    for (let y = 0; y < N; y++) {
      if ((getPx(t, x, y) >>> 24) === 0) continue;
      plot(t, x, y, ROOT_PAL[kind][6]);
      if (x + 1 < N) plot(t, x + 1, y, ROOT_PAL[kind][5]);
      break;
    }
  }
  return t;
}

/** nether sprouts: a low carpet of little teal shoots */
export function netherSprouts(): TexImage {
  return blades('nether_sprouts', { count: 12, hmin: 2, hmax: 5, pal: [0x0f5a4d, 0x14705f, 0x1a8672, 0x23998a, 0x31ab9b, 0x46bfae, 0x62d2c0], x0: 0, x1: 15, curl: 0.3 });
}

/** a hanging (or climbing) vine: two or three wandering strands with buds */
function vine(seed: string, pal: number[], full: boolean, up: boolean): TexImage {
  const t = img();
  const r = rng(seed);
  const strands = 3;
  for (let s = 0; s < strands; s++) {
    let x = 3 + s * 4 + r.nextInt(2);
    const len = full ? N : 9 + r.nextInt(5);
    for (let i = 0; i < len; i++) {
      const y = up ? N - 1 - i : i;
      plot(t, x, y, pal[1 + r.nextInt(3)]);
      if (r.chance(0.25)) plot(t, x + (r.nextBool() ? 1 : -1), y, pal[3 + r.nextInt(2)]);
      if (r.chance(0.3)) x += r.nextBool() ? 1 : -1;
      x = Math.max(1, Math.min(14, x));
    }
    if (!full) {
      // the growing tip: a small bud
      const y = up ? N - len : len - 1;
      plot(t, x, y, pal[5]);
      plot(t, x + 1, y, pal[4]);
    }
  }
  return t;
}

export const weepingVines = (): TexImage => vine('weeping_vines', ROOT_PAL.crimson, false, false);
export const weepingVinesPlant = (): TexImage => vine('weeping_vines_plant', ROOT_PAL.crimson, true, false);
export const twistingVines = (): TexImage => vine('twisting_vines', ROOT_PAL.warped, false, true);
export const twistingVinesPlant = (): TexImage => vine('twisting_vines_plant', ROOT_PAL.warped, true, true);

// ---------------------------------------------------------------------------
// Shroomlight

/** shroomlight: glowing orange flesh with pale, bright blotches */
export function shroomlight(): TexImage {
  const r = rng('shroomlight', 3);
  const f = fbm(r, [[4, 4, 0.5], [2, 2, 0.3]], 0.25);
  const tones = quantize(f, [0.4, 1.2, 2.6, 3.4, 2.2, 1, 0.4]);
  return paint(tones, [0xa9471b, 0xcb6121, 0xe57c2b, 0xf29a3d, 0xf8b456, 0xfccd78, 0xfee5a6]);
}

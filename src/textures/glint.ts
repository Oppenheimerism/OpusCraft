// Enchantment glint: a soft violet streak texture that vanilla scrolls over
// enchanted items with additive blending (RenderStateShard glint texturing:
// texture matrix translate(-f, f1) · rotateZ(10°) · scale(8), where f and f1
// cycle every 27.5 s and 7.5 s at the default glint speed 0.5).

import { TexImage, img, valueNoise, Rand } from './tex';

export const GLINT_SIZE = 64;
/** vanilla default "Glint Strength" accessibility option */
const GLINT_STRENGTH = 0.75;
/** the violet of the vanilla glint streaks */
const GLINT_COLOR = [0.66, 0.38, 1.0];

/**
 * Colours are pre-squared (vanilla blends the glint with GL_SRC_COLOR, GL_ONE)
 * and pre-multiplied by the glint strength, so drawing it additively matches.
 */
export function glintTexture(): TexImage {
  const N = GLINT_SIZE;
  const t = img(N, N);
  const r = new Rand(0x9117, 5);
  const warp = valueNoise(r, N, N, 16);
  const fine = valueNoise(r, N, N, 4, 16);
  const broad = valueNoise(r, N, N, 32);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      // a violet haze with brighter streaks along the diagonal, wobbling with low-frequency noise
      const u = ((x + y) / N) * 5 + warp[i] * 1.6;
      const band = Math.pow(0.5 + 0.5 * Math.sin(u * Math.PI * 2), 2);
      const s = band * (0.6 + 0.4 * fine[i]) * (0.5 + 0.7 * broad[i]);
      const v = Math.min(1, 0.3 + 0.7 * s);
      const k = v * v * GLINT_STRENGTH * 255;
      const o = i * 4;
      t.data[o] = Math.round(GLINT_COLOR[0] ** 2 * k);
      t.data[o + 1] = Math.round(GLINT_COLOR[1] ** 2 * k);
      t.data[o + 2] = Math.round(GLINT_COLOR[2] ** 2 * k);
      t.data[o + 3] = 255;
    }
  return t;
}

/** vanilla setupGlintTexturing offsets in glint-texture units, from wall-clock milliseconds */
export function glintOffset(ms: number): [number, number] {
  const i = Math.floor(ms * 0.5 * 8);
  return [(i % 110000) / 110000, (i % 30000) / 30000];
}

const COS = Math.cos(Math.PI / 18), SIN = Math.sin(Math.PI / 18);
/**
 * Glint UV for a point on an item sprite (lu, lv in 0..1 across the sprite).
 * Vanilla scales atlas UVs by 8; a 16 px sprite in a 1024 px atlas spans 1/64
 * of it, so one sprite covers 1/8 of the glint texture.
 */
export function glintUV(lu: number, lv: number, off: [number, number]): [number, number] {
  const su = lu * 0.125, sv = lv * 0.125;
  return [COS * su - SIN * sv - off[0], SIN * su + COS * sv + off[1]];
}

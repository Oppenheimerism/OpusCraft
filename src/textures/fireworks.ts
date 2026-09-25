// Firework textures: the firework star's two item layers (vanilla item/firework_star, a lumpy grey ball of powder,
// and item/firework_star_overlay, its middle, drawn light so the explosion's colours tint it) and the explosion's
// flash (vanilla particle/flash: a soft white glow, the one particle sprite here with graded alpha, drawn blended).
// The rocket's own sprite is itemlib/extras.ts's.

import { TexImage, img, plot } from './tex';
import { autoShade, maskFn, type Gen } from './itemlib/common';

/** the star's outline: a ball of powder, its edge lumpy */
const lumpy = (r0: number) => (x: number, y: number): boolean => {
  const dx = x - 8, dy = y - 8.5;
  const a = Math.atan2(dy, dx);
  const r = r0 + 0.45 * Math.sin(3 * a + 1.1) + 0.3 * Math.sin(5 * a + 2.3);
  return dx * dx + dy * dy <= r * r;
};

export const FIREWORK_ITEMS: Record<string, Gen> = {
  // (a grey ball: the overlay's colour sits in its middle)
  firework_star: (): TexImage => {
    const t = autoShade(maskFn(lumpy(4.9)), [0x2e2e2e, 0x3e3e3e, 0x505050, 0x646464, 0x7a7a7a, 0x929292], 0x161616, { seed: 'firework_star', edge: 1.1, relief: 4 });
    for (const [x, y] of [[5, 6], [11, 7], [10, 12], [5, 11]] as [number, number][]) plot(t, x, y, 0x242424);
    return t;
  },
  // (its middle in light greys, multiplied by the explosion's colour: vanilla ItemColors tints layer1)
  firework_star_overlay: (): TexImage => {
    const t = autoShade(maskFn(lumpy(3.1)), [0xa0a0a0, 0xb8b8b8, 0xcccccc, 0xdedede, 0xf0f0f0, 0xffffff], null, { seed: 'firework_star_overlay', edge: 1.05, relief: 3 });
    for (const [x, y] of [[7, 7], [9, 9]] as [number, number][]) plot(t, x, y, 0xffffff);
    return t;
  },
};

/** the particle sprites: vanilla particle/flash */
export function fireworkParticleTextures(): Record<string, () => TexImage> {
  return {
    flash: (): TexImage => {
      const N = 16;
      const t = img(N, N);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const d = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (N / 2);
          if (d >= 1) continue;
          plot(t, x, y, 0xffffff, Math.round(255 * Math.pow(1 - d, 1.6)));
        }
      return t;
    },
  };
}

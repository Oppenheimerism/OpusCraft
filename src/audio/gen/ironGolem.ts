// Iron golem foley (vanilla entity.iron_golem.*): a body of iron blocks, so everything it does rings. Its heavy
// clanking steps, the hollow clang of being hit, the whoosh of its double-armed swing, a crack of iron giving way
// as it breaks up, the clatter of it falling to pieces, and the clink of an ingot hammered in to mend it.

import type { SoundGen } from '../synth';
import { alloc, envBump, layer } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, impact, sweep, thump, ticks } from './texture';

/** the partials of a thick iron plate struck, over a fundamental (inharmonic, the higher ones die faster) */
function ironModes(f: number, ring: number, bright = 1): number[] {
  return [f, 1, ring, f * 2.32, 0.62 * bright, ring * 0.7, f * 4.05, 0.38 * bright, ring * 0.45, f * 6.21, 0.2 * bright, ring * 0.3, f * 8.9, 0.1 * bright, ring * 0.2];
}

/** a hit: a hollow clang with the thud of the mass behind it */
function hurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  const f = rng.range(185, 250);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: ironModes(f, 0.55), jitter: 0.03, noise: 0.5, noiseTau: 0.006, noiseBp: [1400, 0.9] }));
  layer(out, 0.55, (b) => impact(b, sr, rng, { t: 0.004, modes: ironModes(f * rng.range(1.37, 1.52), 0.3, 0.8), jitter: 0.03 }));
  layer(out, 0.7, (b) => thump(b, sr, { f0: 120, f1: 62, glide: 0.04, tau: 0.07, h2: 0.3 }));
  return out;
}

/** a step: a dull iron knock under all that weight, and the grit under its foot */
function step(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  layer(out, 1, (b) => thump(b, sr, { f0: 95, f1: 48, glide: 0.035, tau: 0.06, h2: 0.25 }));
  layer(out, 0.5, (b) => impact(b, sr, rng, { modes: ironModes(rng.range(150, 190), 0.16, 0.6), jitter: 0.04, noise: 0.6, noiseTau: 0.01, noiseBp: [700, 0.8] }));
  layer(out, 0.18, (b) => ticks(b, sr, rng, { dur: 0.12, rate: 140, energy: (t) => Math.exp(-t / 0.04), f: [900, 2600], t60: [0.01, 0.03] }));
  return out;
}

/** the swing: both arms coming down through the air, the joints grinding */
function attack(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: 0.45, f: (t) => 260 + 900 * Math.sin(Math.PI * Math.min(1, t / 0.4)), q: 1.4, amp: (t) => envBump(t, 0.16, 0.26), color: 'pink' }));
  layer(out, 0.35, (b) => impact(b, sr, rng, { t: 0.02, modes: ironModes(rng.range(300, 340), 0.25, 0.7), jitter: 0.03, noise: 0.3, noiseTau: 0.004, noiseBp: [2000, 1] }));
  layer(out, 0.4, (b) => thump(b, sr, { t: 0.3, f0: 110, f1: 55, glide: 0.03, tau: 0.06 }));
  return out;
}

/** breaking up: iron cracking open with a snap and a short shriek, flakes falling */
function damage(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  layer(out, 1, (b) => burst(b, sr, rng, { dur: 0.05, tau: 0.008, hp: 900 }));
  layer(out, 0.6, (b) => sweep(b, sr, rng, { t: 0.01, dur: 0.35, f: (t) => 3400 - 2200 * (t / 0.35), q: 9, amp: (t) => envBump(t, 0.01, 0.3) }));
  layer(out, 0.55, (b) => impact(b, sr, rng, { modes: ironModes(rng.range(420, 520), 0.35, 1.2), jitter: 0.04 }));
  layer(out, 0.35, (b) => ticks(b, sr, rng, { t: 0.05, dur: 0.6, rate: 45, energy: (t) => Math.exp(-t / 0.25), f: [1500, 5200], t60: [0.02, 0.08], click: 0.3 }));
  return out;
}

/** it falls to pieces: clang after clang as the blocks of it come down, a crash, the last pieces rolling */
function death(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(2.2, sr);
  const hits = [0, 0.13, 0.24, 0.41, 0.55, 0.78, 1.02];
  layer(out, 1, (b) => {
    hits.forEach((t, i) => impact(b, sr, rng, { t, modes: ironModes(rng.range(140, 300) * (1 + i * 0.05), 0.7 - i * 0.06, 0.9), jitter: 0.04, noise: 0.45, noiseTau: 0.008, noiseBp: [1100, 0.8], gain: 1 - i * 0.09 }));
  });
  layer(out, 0.8, (b) => {
    thump(b, sr, { f0: 110, f1: 45, glide: 0.05, tau: 0.12, h2: 0.3 });
    thump(b, sr, { t: 0.41, f0: 90, f1: 40, glide: 0.05, tau: 0.14, h2: 0.3 });
  });
  layer(out, 0.3, (b) => ticks(b, sr, rng, { t: 0.1, dur: 1.6, rate: 30, energy: (t) => Math.exp(-t / 0.7), f: [600, 3000], t60: [0.05, 0.2], click: 0.2 }));
  return out;
}

/** mending: an ingot knocked into place, clink clink, and a turn of something tightening */
function repair(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  layer(out, 1, (b) => {
    impact(b, sr, rng, { modes: ironModes(rng.range(900, 1000), 0.4, 1.3), jitter: 0.02, noise: 0.25, noiseTau: 0.003, noiseBp: [3500, 1] });
    impact(b, sr, rng, { t: 0.2, modes: ironModes(rng.range(1050, 1150), 0.35, 1.3), jitter: 0.02, noise: 0.25, noiseTau: 0.003, noiseBp: [3500, 1], gain: 0.8 });
  });
  layer(out, 0.3, (b) => ticks(b, sr, rng, { t: 0.36, dur: 0.3, rate: 70, energy: () => 1, f: [2400, 3600], t60: [0.01, 0.025] }));
  return out;
}

export function ironGolemSounds(): Record<string, SoundGen> {
  return {
    'entity.iron_golem.hurt': sound('entity.iron_golem.hurt', 4, hurt),
    'entity.iron_golem.step': sound('entity.iron_golem.step', 4, step),
    'entity.iron_golem.attack': sound('entity.iron_golem.attack', 1, attack),
    'entity.iron_golem.damage': sound('entity.iron_golem.damage', 2, damage),
    'entity.iron_golem.death': sound('entity.iron_golem.death', 1, death),
    'entity.iron_golem.repair': sound('entity.iron_golem.repair', 1, repair),
  };
}

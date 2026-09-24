// End portal sounds: an eye of ender set into a frame (vanilla block.end_portal_frame.fill, three takes) and a
// portal opening (block.end_portal.spawn, heard from wherever you are — vanilla global level event 1038).

import type { SoundGen } from '../synth';
import { TAU, addOsc, alloc, envBump, layer, lowpass, reverb, upsample2 } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, impact, sweep, thump } from './texture';
import { reverbHalf } from './world';
import { dragonSounds } from './dragon';

/** half-rate render -> full rate, the images above ~10 kHz filtered off */
function up2(x: Float32Array, sr: number): Float32Array {
  const y = upsample2(x);
  lowpass(y, 9500, sr);
  return lowpass(y, 9500, sr);
}

/**
 * The eye going in: a heavy, glassy chunk as it seats in the stone (a low body, a bright click), then a faint
 * two-note shimmer hanging over it, in a stony room.
 */
function frameFill(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const L = 1.6;
  const dry = alloc(L, sr);
  const f = [196, 174.6, 220][v % 3] * rng.range(0.97, 1.03);
  // the seat: a stone-and-glass body, inharmonic
  layer(dry, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.3, f * 1.58, 0.7, 0.22, f * 2.37, 0.45, 0.14, f * 3.12, 0.3, 0.09, f * 4.4, 0.18, 0.05],
      jitter: 0.01,
      noise: 1.2,
      noiseTau: 0.006,
      noiseBp: [1500, 0.8],
    }),
  );
  // the click of it catching
  layer(dry, 0.45, (b) => {
    const k = rng.range(2000, 2600);
    impact(b, sr, rng, { t: 0.004, modes: [k, 1, 0.035, k * 1.41, 0.6, 0.025, k * 2.05, 0.35, 0.018], noise: 0.8, noiseTau: 0.002, noiseBp: [4200, 1.2] });
  });
  layer(dry, 0.5, (b) => thump(b, sr, { f0: 95, f1: 58, glide: 0.04, tau: 0.09, attack: 0.002 }));
  // the shimmer: a fifth, slowly beating, swelling in and dying away
  layer(dry, 0.16, (b) => {
    const root = [739.99, 698.46, 783.99][v % 3];
    for (const [m, g] of [[1, 1], [1.5, 0.7], [2, 0.35]] as const) {
      const beat = rng.range(1.5, 3);
      const ph = rng.range(0, TAU);
      addOsc(b, sr, 0.02, L - 0.05, (t) => root * m * (1 + 0.002 * Math.sin(TAU * 5 * t)), (t) => g * envBump(t, 0.08, 1.1) * (0.7 + 0.3 * Math.sin(TAU * beat * t + ph)));
    }
  });
  return reverbHalf(dry, sr, { t60: 1.1, hf: 0.45, wet: 0.55, dry: 1, tail: 0.8, pre: 0.01 });
}

/**
 * The portal opening: a deep blast and its long rumble, a huge struck gong under it with slow beats, a roar of
 * noise closing down from bright to dark and whooshes falling through it, in a vast space. About six seconds.
 */
function portalSpawn(c: Ctx): Float32Array {
  const { rng } = c;
  const sr = c.sr / 2;
  const L = 6.5;
  const out = alloc(L, sr);
  // the blast
  layer(out, 1, (b) => {
    thump(b, sr, { f0: 78, f1: 31, glide: 0.25, tau: 1.3, attack: 0.012, dur: L, h2: 0.25 });
    burst(b, sr, rng, { dur: 1.2, attack: 0.004, tau: 0.35, lp: 900, color: 'brown', amp: 0.9 });
  });
  // the gong: inharmonic partials, pairs a hair apart so they beat as they ring
  layer(out, 0.8, (b) => {
    const f0 = rng.range(52, 58);
    const parts: [number, number, number][] = [
      [1, 1, 4.5], [1.47, 0.8, 4], [2.09, 0.65, 3.4], [2.56, 0.55, 3], [3.39, 0.4, 2.4], [4.1, 0.32, 2], [5.02, 0.22, 1.6], [6.3, 0.15, 1.2], [7.9, 0.1, 0.9],
    ];
    for (const [m, a, t60] of parts)
      for (const d of [-1, 1]) {
        const fq = f0 * m + d * rng.range(0.3, 0.9);
        const k = Math.log(1000) / t60;
        const bloom = rng.range(0.05, 0.25);
        addOsc(b, sr, 0, L, () => fq, (t) => a * Math.exp(-k * t) * Math.min(1, t / bloom + 0.25));
      }
    lowpass(b, 2400, sr);
  });
  // the roar, closing from bright to dark
  layer(out, 0.7, (b) =>
    sweep(b, sr, rng, {
      dur: L,
      f: (t) => 200 + 2600 * Math.exp(-t / 0.9),
      q: 0.7,
      mode: 'lp',
      amp: (t) => (t < 0.02 ? t / 0.02 : Math.exp(-(t - 0.02) / 1.4)),
      color: 'pink',
    }),
  );
  // whooshes falling through it, their warble slowing
  layer(out, 0.45, (b) => {
    const wph = rng.next() * TAU;
    const warble = (t: number): number => Math.sin(wph + TAU * (1 * t + 3 * 1.5 * (1 - Math.exp(-t / 1.5))));
    for (const f0 of [1700, 1100, 650]) {
      const fa = f0 * rng.range(0.9, 1.1), fb = fa * rng.range(0.15, 0.22);
      sweep(b, sr, rng, {
        t: 0.05,
        dur: L - 0.1,
        f: (t) => fa * Math.pow(fb / fa, 1 - Math.exp(-t / 1.6)) * (1 + 0.08 * warble(t)),
        q: (t) => 2.5 + 3 * (1 - Math.exp(-t / 1.6)),
        amp: (t) => envBump(t, 0.25, 4.5),
        color: 'pink',
      });
    }
  });
  const w = reverb(out, sr, { t60: 4.2, hf: 0.35, size: 2, wet: 0.6, dry: 1, tail: 2.5, pre: 0.03, highcut: 5000 });
  return up2(w, c.sr);
}

export function endSounds(): Record<string, SoundGen> {
  return {
    'block.end_portal_frame.fill': sound('block.end_portal_frame.fill', 3, frameFill, { fadeOut: 0.2 }),
    'block.end_portal.spawn': sound('block.end_portal.spawn', 1, portalSpawn, { trimDb: -60, fadeOut: 0.5 }),
    ...dragonSounds(),
  };
}

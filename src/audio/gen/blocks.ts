// Block material sounds (break / step / place / hit) for the vanilla SoundTypes.
//
// Vanilla conventions mirrored here:
//  * `place` reuses the "dig" (break) takes — placing stone sounds like breaking it.
//  * `hit` (the repeated mining tick) is the *step* take played at pitch 0.5, which is what
//    gives digging its deep "tuk tuk" feel. We bake that pitch drop in.
//  * glass steps / places / hits are the stone ones; only glass break is a shatter.

import type { SoundGen } from '../synth';
import { alloc, envAD, envBump, layer, lowpass } from './dsp';
import { type Ctx, pitched, sound } from './registry';
import { bubble, burst, creak, impact, phisem, sweep, thump, ticks, twoBump } from './texture';

// ------------------------------------------------------------------ stone / deepslate

function stoneStep(c: Ctx, deep: number): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.24, sr);
  const f = rng.range(1600, 2400) * deep;
  const body = rng.range(160, 240) * deep;
  layer(out, 1.0, (b) =>
    impact(b, sr, rng, {
      modes: [
        f, 1, 0.013,
        f * rng.range(1.36, 1.56), 0.6, 0.009,
        f * rng.range(2.05, 2.4), 0.35, 0.006,
        f * 0.5, 0.5, 0.02,
        body, 0.3 + 0.4 * (1 - deep), 0.035,
      ],
      jitter: 0.03,
      noise: 1.3,
      noiseTau: 0.0035,
      noiseBp: [3000 * deep, 0.7],
    }),
  );
  layer(out, 0.42, (b) =>
    phisem(b, sr, rng, {
      dur: 0.12,
      rate: 3000,
      energy: (t) => Math.exp(-t / 0.02),
      grain: 0.0006,
      heavy: 2.5,
      bands: [
        { f: 3200 * deep, q: 1.3, g: 1, spread: 0.35 },
        { f: 1500 * deep, q: 2, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  const t2 = rng.range(0.035, 0.07);
  layer(out, rng.range(0.28, 0.48), (b) =>
    impact(b, sr, rng, {
      t: t2,
      modes: [f * rng.range(0.85, 1.2), 1, 0.009, f * 1.45, 0.5, 0.006, f * 0.52, 0.4, 0.014],
      noise: 0.8,
      noiseTau: 0.0025,
      noiseBp: [3000 * deep, 0.8],
    }),
  );
  return out;
}

function stoneBreak(c: Ctx, deep: number, crumble = 1): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.55, sr);
  const f = rng.range(1000, 1500) * deep;
  layer(out, 1.0, (b) =>
    impact(b, sr, rng, {
      modes: [
        f, 1, 0.03,
        f * rng.range(1.45, 1.6), 0.6, 0.022,
        f * rng.range(2.2, 2.45), 0.4, 0.015,
        f * 3.1, 0.25, 0.01,
        f * 0.48, 0.55, 0.04,
      ],
      jitter: 0.03,
      noise: 1.5,
      noiseTau: 0.006,
      noiseBp: [2400 * deep, 0.6],
    }),
  );
  layer(out, 0.24 + 0.4 * (1 - deep), (b) => thump(b, sr, { f0: 230 * deep, f1: 130 * deep, glide: 0.02, tau: 0.02 + 0.03 * (1 - deep) }));
  layer(out, 0.75 * crumble, (b) =>
    phisem(b, sr, rng, {
      t: 0.004,
      dur: 0.45,
      rate: 1800,
      energy: (t) => (1 - Math.exp(-t / 0.005)) * Math.exp(-t / (0.09 + 0.04 * (1 - deep))),
      grain: 0.0014,
      heavy: 3,
      bands: [
        { f: 2100 * deep, q: 2.2, g: 1, spread: 0.45 },
        { f: 950 * deep, q: 2.5, g: 0.7, spread: 0.3 },
        { f: 4600 * deep, q: 1.8, g: 0.35, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.45 * crumble, (b) =>
    ticks(b, sr, rng, {
      t: 0.01,
      dur: 0.35,
      rate: 80,
      energy: (t) => Math.exp(-t / 0.1),
      f: [1300 * deep, 4500 * deep],
      t60: [0.008, 0.03],
      heavy: 2,
      click: 0.3,
    }),
  );
  return out;
}

// ------------------------------------------------------------------ wood / ladder

function woodStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.24, sr);
  const fb = rng.range(330, 440);
  // hollow plank knock: body modes plus a bright contact "tok"
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [
        fb, 0.8, 0.07,
        fb * rng.range(1.75, 2.0), 0.85, 0.05,
        fb * rng.range(2.8, 3.2), 0.7, 0.035,
        fb * rng.range(4.2, 4.7), 0.5, 0.025,
        fb * rng.range(6.3, 7.0), 0.3, 0.018,
      ],
      jitter: 0.02,
      noise: 1.1,
      noiseTau: 0.0025,
      noiseBp: [2200, 0.9],
    }),
  );
  layer(out, 0.22, (b) => thump(b, sr, { f0: 170, f1: 120, glide: 0.02, tau: 0.02 }));
  const t2 = rng.range(0.04, 0.07);
  layer(out, rng.range(0.28, 0.45), (b) =>
    impact(b, sr, rng, {
      t: t2,
      modes: [fb * rng.range(1.05, 1.3), 0.8, 0.05, fb * 2.2, 0.7, 0.035, fb * 3.4, 0.45, 0.022],
      noise: 0.8,
      noiseTau: 0.002,
      noiseBp: [2400, 0.9],
    }),
  );
  layer(out, 0.1, (b) =>
    phisem(b, sr, rng, {
      dur: 0.1,
      rate: 1500,
      energy: (t) => Math.exp(-t / 0.03),
      grain: 0.001,
      bands: [{ f: 2200, q: 3, g: 1, spread: 0.3 }],
    }),
  );
  return out;
}

function woodBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  const fb = rng.range(190, 280);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [
        fb, 1, 0.14,
        fb * rng.range(2.1, 2.4), 0.7, 0.09,
        fb * rng.range(3.5, 3.9), 0.45, 0.06,
        fb * rng.range(5.2, 5.9), 0.3, 0.04,
        fb * 8.3, 0.15, 0.025,
      ],
      jitter: 0.02,
      noise: 0.9,
      noiseTau: 0.004,
      noiseBp: [1400, 0.7],
    }),
  );
  layer(out, 0.6, (b) =>
    phisem(b, sr, rng, {
      t: 0.003,
      dur: 0.35,
      rate: 900,
      energy: (t) => (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.08),
      grain: 0.002,
      heavy: 3,
      bands: [
        { f: 1300, q: 4, g: 1, spread: 0.5 },
        { f: 2900, q: 3, g: 0.6, spread: 0.4 },
        { f: 600, q: 3, g: 0.5, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.4, (b) =>
    ticks(b, sr, rng, {
      t: 0.01,
      dur: 0.3,
      rate: 40,
      energy: (t) => Math.exp(-t / 0.1),
      f: [500, 2000],
      t60: [0.02, 0.06],
      ratios: [1, 2.3, 3.9],
      weights: [1, 0.5, 0.25],
      click: 0.2,
    }),
  );
  return out;
}

function ladderStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.28, sr);
  const fb = rng.range(420, 600);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [fb, 1, 0.05, fb * 2.15, 0.6, 0.035, fb * 3.6, 0.35, 0.02, fb * 5.4, 0.2, 0.015],
      noise: 0.7,
      noiseTau: 0.002,
      noiseBp: [2000, 0.9],
    }),
  );
  const cd = rng.range(0.07, 0.12);
  const r0 = rng.range(110, 180);
  const r1 = r0 * rng.range(0.6, 0.85);
  layer(out, 0.28, (b) =>
    creak(b, sr, rng, {
      t: 0.012,
      dur: cd,
      rate: (t) => r0 + ((r1 - r0) * t) / cd,
      amp: (t) => envBump(t, cd * 0.3, cd * 0.7),
      jitter: 0.35,
      bands: [
        { f: 700, q: 6, g: 1 },
        { f: 1500, q: 7, g: 0.7 },
        { f: 2600, q: 5, g: 0.4 },
      ],
    }),
  );
  return out;
}

// ------------------------------------------------------------------ granular grounds

function gravelStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  const en = twoBump(0.008, 0.035, rng.range(0.05, 0.08), rng.range(0.5, 0.8), 0.01, 0.045);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: 0.3,
      rate: 5500,
      energy: en,
      grain: 0.0011,
      heavy: 2.5,
      bands: [
        { f: 2500, q: 1.3, g: 1, spread: 0.45 },
        { f: 1100, q: 1.6, g: 0.8, spread: 0.35 },
        { f: 5200, q: 1.5, g: 0.35, spread: 0.25 },
      ],
    }),
  );
  layer(out, 0.4, (b) => ticks(b, sr, rng, { dur: 0.2, rate: 140, energy: en, f: [1300, 4200], t60: [0.005, 0.02], click: 0.4 }));
  layer(out, 0.3, (b) => thump(b, sr, { f0: 120, f1: 80, tau: 0.02 }));
  return out;
}

function gravelBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  const t2 = rng.range(0.1, 0.16);
  const en = (t: number) => Math.min(1, (1 - Math.exp(-t / 0.01)) * Math.exp(-t / 0.12) + 0.35 * envBump(t - t2, 0.03, 0.2));
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: 0.5,
      rate: 6000,
      energy: en,
      grain: 0.0013,
      heavy: 2.6,
      bands: [
        { f: 2000, q: 1.3, g: 1, spread: 0.45 },
        { f: 900, q: 1.6, g: 0.9, spread: 0.35 },
        { f: 4200, q: 1.5, g: 0.4, spread: 0.25 },
      ],
    }),
  );
  layer(out, 0.5, (b) => ticks(b, sr, rng, { dur: 0.4, rate: 160, energy: en, f: [900, 3800], t60: [0.006, 0.025], click: 0.4 }));
  layer(out, 0.45, (b) => thump(b, sr, { f0: 130, f1: 80, tau: 0.03 }));
  return out;
}

function grassStep(c: Ctx, tone = 1, lowGain = 0.25): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  const en = twoBump(0.015, 0.05, rng.range(0.06, 0.1), rng.range(0.4, 0.7), 0.015, 0.05);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: 0.3,
      rate: 9000,
      energy: en,
      grain: 0.0007,
      heavy: 2.2,
      bands: [
        { f: 3300 * tone, q: 1, g: 1, spread: 0.35 },
        { f: 1700 * tone, q: 1.3, g: 0.75, spread: 0.3 },
        { f: 5600 * tone, q: 1.3, g: 0.3, spread: 0.2 },
      ],
    }),
  );
  if (lowGain > 0) layer(out, lowGain, (b) => burst(b, sr, rng, { dur: 0.15, attack: 0.008, tau: 0.035, lp: 900 }));
  return out;
}

function grassBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  const en = (t: number) => (1 - Math.exp(-t / 0.006)) * (0.7 * Math.exp(-t / 0.07) + 0.3 * Math.exp(-t / 0.25));
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: 0.5,
      rate: 8000,
      energy: en,
      grain: 0.0009,
      heavy: 2.4,
      bands: [
        { f: 3200, q: 1.1, g: 1, spread: 0.4 },
        { f: 1500, q: 1.4, g: 0.8, spread: 0.3 },
        { f: 6000, q: 1.3, g: 0.4, spread: 0.25 },
      ],
    }),
  );
  layer(out, 0.45, (b) => burst(b, sr, rng, { dur: 0.2, attack: 0.004, tau: 0.045, lp: 500 }));
  layer(out, 0.35, (b) => ticks(b, sr, rng, { dur: 0.35, rate: 90, energy: en, f: [1800, 6000], t60: [0.004, 0.012], click: 0.5 }));
  return out;
}

function sandStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.28, sr);
  const en = twoBump(0.02, 0.04, rng.range(0.05, 0.09), rng.range(0.5, 0.8), 0.02, 0.05);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: 0.28,
      rate: 22000,
      energy: en,
      grain: 0.0025,
      heavy: 1.4,
      dry: 0.05,
      bands: [
        { f: 2700, q: 0.8, g: 1, spread: 0.15 },
        { f: 1300, q: 1, g: 0.5, spread: 0.1 },
        { f: 5500, q: 1, g: 0.25 },
      ],
    }),
  );
  layer(out, 0.2, (b) => burst(b, sr, rng, { dur: 0.12, attack: 0.01, tau: 0.03, lp: 500 }));
  return out;
}

function sandBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  const en = (t: number) => (1 - Math.exp(-t / 0.012)) * (0.75 * Math.exp(-t / 0.08) + 0.25 * Math.exp(-t / 0.22));
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: 0.5,
      rate: 20000,
      energy: en,
      grain: 0.003,
      heavy: 1.5,
      dry: 0.05,
      bands: [
        { f: 2800, q: 0.8, g: 1, spread: 0.15 },
        { f: 1200, q: 1, g: 0.55, spread: 0.1 },
        { f: 6000, q: 1, g: 0.3 },
      ],
    }),
  );
  layer(out, 0.35, (b) => burst(b, sr, rng, { dur: 0.2, attack: 0.006, tau: 0.04, lp: 450 }));
  return out;
}

function snowStep(c: Ctx, len = 0.3, tail = 0.05): Float32Array {
  const { sr, rng } = c;
  const out = alloc(len, sr);
  const en = twoBump(0.012, tail, rng.range(0.06, 0.1), rng.range(0.5, 0.8), 0.012, tail);
  // compacting-snow squeaks: sparse, narrow, randomly tuned resonances
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: len,
      rate: 1300,
      energy: en,
      grain: 0.0014,
      heavy: 2,
      bands: [
        { f: 1250, q: 11, g: 1, spread: 0.35 },
        { f: 2300, q: 9, g: 0.75, spread: 0.3 },
        { f: 3600, q: 6, g: 0.35, spread: 0.25 },
      ],
    }),
  );
  // soft powdery crunch underneath
  layer(out, 0.55, (b) =>
    phisem(b, sr, rng, {
      dur: len,
      rate: 5000,
      energy: en,
      grain: 0.0008,
      heavy: 2.4,
      bands: [
        { f: 3000, q: 1.2, g: 1, spread: 0.3 },
        { f: 6000, q: 1.2, g: 0.4, spread: 0.2 },
      ],
    }),
  );
  layer(out, 0.3, (b) => burst(b, sr, rng, { dur: 0.12, attack: 0.006, tau: 0.03, lp: 450 }));
  return out;
}

function woolStep(c: Ctx, len = 0.25): Float32Array {
  const { sr, rng } = c;
  const out = alloc(len, sr);
  const at = rng.range(0.01, 0.018);
  const tau = rng.range(0.035, 0.05) * (len / 0.25);
  const lp = rng.range(900, 1300);
  layer(out, 1, (b) => {
    burst(b, sr, rng, { dur: len, attack: at, tau, lp });
    lowpass(b, 1400, sr);
  });
  layer(out, 0.25, (b) =>
    phisem(b, sr, rng, {
      dur: len * 0.6,
      rate: 3000,
      energy: (t) => envAD(t, 0.01, 0.04),
      grain: 0.002,
      bands: [{ f: 1500, q: 1, g: 1, spread: 0.3 }],
    }),
  );
  layer(out, 0.3, (b) => thump(b, sr, { f0: 110, f1: 80, tau: 0.03, attack: 0.006 }));
  return out;
}

// ------------------------------------------------------------------ glass / metal

function glassBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  layer(out, 0.9, (b) => {
    burst(b, sr, rng, { dur: 0.06, attack: 0.0003, tau: 0.008, hp: 1500 });
    impact(b, sr, rng, {
      modes: [rng.range(2500, 3500), 1, 0.05, rng.range(4000, 5000), 0.8, 0.04, rng.range(6000, 7500), 0.6, 0.03],
    });
  });
  layer(out, 1, (b) =>
    ticks(b, sr, rng, {
      dur: 0.8,
      rate: 110,
      energy: (t) => Math.exp(-t / 0.22),
      f: [2200, 7500],
      t60: [0.04, 0.25],
      ratios: [1, 1.73, 2.61, 3.9],
      weights: [1, 0.7, 0.45, 0.25],
      heavy: 1.6,
      click: 0.3,
    }),
  );
  layer(out, 0.5, (b) =>
    phisem(b, sr, rng, {
      dur: 0.6,
      rate: 2500,
      energy: (t) => Math.exp(-t / 0.12),
      grain: 0.0005,
      heavy: 2,
      bands: [
        { f: 6500, q: 2, g: 1, spread: 0.3 },
        { f: 3500, q: 2, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  return out;
}

function metalStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.38, sr);
  const f = rng.range(900, 1300);
  layer(out, 0.8, (b) =>
    impact(b, sr, rng, { modes: [f * 2.1, 1, 0.01, f * 3.3, 0.6, 0.008], noise: 1, noiseTau: 0.003, noiseBp: [3500, 0.8] }),
  );
  layer(out, 0.55, (b) =>
    impact(b, sr, rng, {
      modes: [f, 0.6, 0.25, f * 2.32, 0.5, 0.18, f * 4.25, 0.35, 0.12, f * 6.63, 0.25, 0.08, f * 9.38, 0.15, 0.05],
      jitter: 0.01,
    }),
  );
  layer(out, 0.3, (b) =>
    impact(b, sr, rng, {
      t: rng.range(0.04, 0.07),
      modes: [f * 1.1, 0.5, 0.12, f * 2.5, 0.4, 0.08, f * 4.6, 0.25, 0.05],
      noise: 0.5,
      noiseTau: 0.002,
      noiseBp: [3500, 0.8],
    }),
  );
  return out;
}

function metalBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  const f = rng.range(520, 760);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [
        f, 0.8, 0.45,
        f * 2.32, 0.7, 0.32,
        f * 4.25, 0.5, 0.2,
        f * 6.63, 0.35, 0.12,
        f * 9.38, 0.2, 0.08,
        f * 3.1, 0.3, 0.05,
      ],
      jitter: 0.015,
      noise: 1.2,
      noiseTau: 0.004,
      noiseBp: [3000, 0.7],
    }),
  );
  layer(out, 0.45, (b) => thump(b, sr, { f0: 160, f1: 100, tau: 0.04 }));
  layer(out, 0.35, (b) =>
    phisem(b, sr, rng, {
      t: 0.005,
      dur: 0.3,
      rate: 1500,
      energy: (t) => Math.exp(-t / 0.07),
      grain: 0.0012,
      heavy: 3,
      bands: [
        { f: 2500, q: 2.5, g: 1, spread: 0.4 },
        { f: 5000, q: 2, g: 0.5, spread: 0.3 },
      ],
    }),
  );
  return out;
}

// ------------------------------------------------------------------ wet grounds

function mudStep(c: Ctx, big = false): Float32Array {
  const { sr, rng } = c;
  const out = alloc(big ? 0.55 : 0.36, sr);
  layer(out, big ? 0.8 : 0.7, (b) => thump(b, sr, { f0: 110, f1: 70, tau: big ? 0.05 : 0.035, attack: 0.004 }));
  layer(out, 0.5, (b) => burst(b, sr, rng, { dur: 0.2, attack: 0.006, tau: big ? 0.06 : 0.04, lp: 500 }));
  const t0 = rng.range(0.03, 0.08);
  const d = rng.range(0.1, 0.16) * (big ? 1.6 : 1);
  const fA = rng.range(250, 400);
  const fB = fA * rng.range(2.5, 4);
  layer(out, 1, (b) =>
    sweep(b, sr, rng, {
      t: t0,
      dur: d,
      f: (t) => fA * Math.pow(fB / fA, t / d),
      q: 5,
      amp: (t) => envBump(t, d * 0.35, d * 0.65),
    }),
  );
  layer(out, 0.45, (b) => {
    const nb = (big ? 4 : 2) + rng.int(3);
    for (let k = 0; k < nb; k++) bubble(b, sr, t0 + rng.range(0.02, d), rng.range(250, 700), rng.range(0.4, 1), undefined, rng.range(0.4, 0.9));
  });
  if (big) {
    const t1 = t0 + d + rng.range(0.02, 0.06);
    const d2 = rng.range(0.08, 0.12);
    layer(out, 0.6, (b) =>
      sweep(b, sr, rng, { t: t1, dur: d2, f: (t) => 900 * Math.pow(0.4, t / d2), q: 4, amp: (t) => envBump(t, d2 * 0.3, d2 * 0.7) }),
    );
  }
  return out;
}

function wetGrassStep(c: Ctx, big = false): Float32Array {
  const { sr, rng } = c;
  const out = alloc(big ? 0.5 : 0.32, sr);
  const en = big
    ? (t: number) => (1 - Math.exp(-t / 0.008)) * (0.7 * Math.exp(-t / 0.08) + 0.3 * Math.exp(-t / 0.2))
    : twoBump(0.012, 0.045, rng.range(0.06, 0.1), rng.range(0.4, 0.7), 0.015, 0.05);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: big ? 0.5 : 0.32,
      rate: 7000,
      energy: en,
      grain: 0.0012,
      heavy: 2.2,
      bands: [
        { f: 2400, q: 1.2, g: 1, spread: 0.35 },
        { f: 1200, q: 1.5, g: 0.8, spread: 0.3 },
        { f: 4500, q: 1.3, g: 0.3, spread: 0.2 },
      ],
    }),
  );
  const fA = rng.range(500, 800);
  const d = big ? 0.12 : 0.07;
  layer(out, 0.55, (b) =>
    sweep(b, sr, rng, { t: 0.005, dur: d, f: (t) => fA * (1 + 1.5 * (t / d)), q: 3, amp: (t) => envBump(t, d * 0.2, d * 0.8) }),
  );
  layer(out, 0.3, (b) => {
    const nb = big ? 5 : 2;
    for (let k = 0; k < nb; k++) bubble(b, sr, rng.range(0.01, big ? 0.3 : 0.15), rng.range(500, 1400), rng.range(0.4, 1), undefined, 0.5);
  });
  return out;
}

function cropBreak(c: Ctx, dirt = 0): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.35, sr);
  const en = (t: number) => (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.06);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: 0.35,
      rate: 7000,
      energy: en,
      grain: 0.0005,
      heavy: 2.5,
      bands: [
        { f: 5500, q: 1.3, g: 1, spread: 0.35 },
        { f: 3000, q: 1.5, g: 0.6, spread: 0.3 },
        { f: 8500, q: 1.5, g: 0.4 },
      ],
    }),
  );
  layer(out, 0.5, (b) => ticks(b, sr, rng, { dur: 0.25, rate: 120, energy: en, f: [2500, 7000], t60: [0.003, 0.01], click: 0.6 }));
  if (dirt > 0) layer(out, dirt, (b) => burst(b, sr, rng, { dur: 0.15, attack: 0.004, tau: 0.03, lp: 600 }));
  return out;
}

// ------------------------------------------------------------------ chain & lantern

/** Chain links: bursts of small, bright, short-ringing metal collisions. */
function chainLinks(b: Float32Array, sr: number, c: Ctx, t: number, dur: number, rate: number, energy: (t: number) => number, pitch = 1): void {
  ticks(b, sr, c.rng, {
    t,
    dur,
    rate,
    energy,
    f: [2000 * pitch, 5400 * pitch],
    t60: [0.02, 0.07],
    ratios: [1, 2.41, 4.13],
    weights: [1, 0.5, 0.25],
    heavy: 1.8,
    click: 0.5,
  });
}

function chainStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  const en = twoBump(0.004, 0.035, rng.range(0.05, 0.08), rng.range(0.5, 0.8), 0.006, 0.04);
  layer(out, 1, (b) => chainLinks(b, sr, c, 0, 0.22, 110, en));
  layer(out, 0.3, (b) => thump(b, sr, { f0: 160, f1: 110, tau: 0.02 }));
  layer(out, 0.2, (b) =>
    phisem(b, sr, rng, { dur: 0.12, rate: 3000, energy: (t) => Math.exp(-t / 0.03), grain: 0.0005, bands: [{ f: 5000, q: 2, g: 1, spread: 0.3 }] }),
  );
  return out;
}

function chainBreak(c: Ctx, place: boolean): Float32Array {
  const { sr, rng } = c;
  const d = place ? 0.4 : 0.55;
  const out = alloc(d, sr);
  const f = rng.range(900, 1300) * (place ? 1.15 : 1);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.12, f * 2.41, 0.6, 0.08, f * 4.13, 0.35, 0.05, f * 6.2, 0.2, 0.03],
      jitter: 0.02,
      noise: 1,
      noiseTau: 0.002,
      noiseBp: [3500, 0.9],
    }),
  );
  const tau = place ? 0.07 : 0.15;
  layer(out, place ? 0.7 : 0.9, (b) => chainLinks(b, sr, c, 0.008, d - 0.05, place ? 80 : 95, (t) => Math.exp(-t / tau)));
  layer(out, 0.3, (b) => thump(b, sr, { f0: 170, f1: 110, tau: 0.025 }));
  return out;
}

/** Lantern: a thin metal body clink with a glassy ring from the panes and a rattling handle. */
function lanternStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  const f = rng.range(1400, 1900);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.12, f * 1.61, 0.7, 0.09, f * 2.33, 0.5, 0.07, f * 3.42, 0.3, 0.05],
      jitter: 0.02,
      noise: 0.8,
      noiseTau: 0.0015,
      noiseBp: [4000, 0.9],
    }),
  );
  const g = rng.range(4200, 5600);
  layer(out, 0.5, (b) => impact(b, sr, rng, { modes: [g, 1, 0.05, g * 1.73, 0.6, 0.035, g * 2.61, 0.35, 0.025] }));
  layer(out, 0.3, (b) =>
    ticks(b, sr, rng, { t: 0.01, dur: 0.1, rate: 40, energy: () => 1, f: [3000, 6000], t60: [0.01, 0.03], ratios: [1, 2.2], weights: [1, 0.4], click: 0.4 }),
  );
  return out;
}

function lanternBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  const f = rng.range(1200, 1600);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.15, f * 1.61, 0.75, 0.11, f * 2.33, 0.55, 0.08, f * 3.42, 0.35, 0.06],
      jitter: 0.02,
      noise: 1.1,
      noiseTau: 0.002,
      noiseBp: [3500, 0.8],
    }),
  );
  layer(out, 0.75, (b) =>
    ticks(b, sr, rng, {
      t: 0.004,
      dur: 0.5,
      rate: 60,
      energy: (t) => Math.exp(-t / 0.15),
      f: [3000, 8000],
      t60: [0.03, 0.15],
      ratios: [1, 1.73, 2.61],
      weights: [1, 0.6, 0.35],
      heavy: 1.7,
      click: 0.3,
    }),
  );
  layer(out, 0.4, (b) =>
    ticks(b, sr, rng, { t: 0.02, dur: 0.3, rate: 45, energy: (t) => Math.exp(-t / 0.1), f: [1500, 4000], t60: [0.02, 0.06], ratios: [1, 2.4], weights: [1, 0.4], click: 0.4 }),
  );
  return out;
}

function lanternPlace(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.35, sr);
  const f = rng.range(900, 1200);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.1, f * 1.61, 0.65, 0.08, f * 2.33, 0.45, 0.06, f * 0.5, 0.4, 0.07],
      jitter: 0.02,
      noise: 0.9,
      noiseTau: 0.002,
      noiseBp: [2500, 0.8],
    }),
  );
  const g = rng.range(4000, 5200);
  layer(out, 0.45, (b) => impact(b, sr, rng, { t: 0.003, modes: [g, 1, 0.06, g * 1.73, 0.55, 0.04, g * 2.61, 0.3, 0.03] }));
  layer(out, 0.3, (b) => thump(b, sr, { f0: 180, f1: 120, tau: 0.02 }));
  return out;
}

// ------------------------------------------------------------------ amethyst

/** crystal bar partials (free-free bar modes 1 : 2.76 : 5.40 : 8.93): glassy and bell-like */
const CRYSTAL = [1, 2.76, 5.4];

/** Amethyst block steps: a couple of small glassy clinks over a soft stony contact. */
function amethystStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  layer(out, 1, (b) =>
    ticks(b, sr, rng, {
      dur: 0.08,
      rate: 55,
      energy: (t) => Math.exp(-t / 0.04),
      f: [1300, 3000],
      t60: [0.12, 0.32],
      ratios: CRYSTAL,
      weights: [1, 0.35, 0.12],
      heavy: 1.2,
      click: 0.2,
    }),
  );
  layer(out, 0.3, (b) => thump(b, sr, { f0: 280, f1: 190, tau: 0.01 }));
  return out;
}

/** Breaking / placing amethyst: a crunch of crystal with a spray of ringing chips. */
function amethystBreak(c: Ctx, place: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.8, sr);
  layer(out, 0.6, (b) => burst(b, sr, rng, { dur: 0.07, attack: 0.0005, tau: place ? 0.01 : 0.018, bp: [2800, 0.7] }));
  layer(out, 1, (b) =>
    ticks(b, sr, rng, {
      dur: place ? 0.14 : 0.32,
      rate: place ? 55 : 110,
      energy: (t) => Math.exp(-t / (place ? 0.05 : 0.1)),
      f: [1100, 4200],
      t60: [0.15, 0.5],
      ratios: CRYSTAL,
      weights: [1, 0.4, 0.15],
      heavy: 1.5,
      click: 0.25,
    }),
  );
  layer(out, 0.35, (b) => thump(b, sr, { f0: 230, f1: 150, tau: 0.02 }));
  return out;
}

/** The amethyst chime: a struck crystal ringing out, with a softer second strike. */
function amethystChime(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.8, sr);
  const f = rng.range(650, 1050);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 1.4, f * 2.76, 0.5, 0.75, f * 5.4, 0.22, 0.4, f * 8.93, 0.08, 0.2],
      jitter: 0.01,
      noise: 0.12,
      noiseTau: 0.001,
      noiseBp: [5000, 1],
    }),
  );
  const g = f * rng.range(1.2, 1.5);
  layer(out, 0.4, (b) => impact(b, sr, rng, { t: rng.range(0.03, 0.09), modes: [g, 1, 1.1, g * 2.76, 0.4, 0.55, g * 5.4, 0.15, 0.3] }));
  return out;
}

/** Clusters and buds: sharper, higher crystal tinks; size 0 (small bud) .. 3 (cluster). */
function clusterStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  layer(out, 1, (b) =>
    ticks(b, sr, rng, {
      dur: 0.06,
      rate: 70,
      energy: (t) => Math.exp(-t / 0.03),
      f: [2200, 4800],
      t60: [0.08, 0.2],
      ratios: CRYSTAL,
      weights: [1, 0.3, 0.1],
      heavy: 1.3,
      click: 0.3,
    }),
  );
  return out;
}

function clusterBreak(c: Ctx, size: number, place: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  const up = 1.35 - size * 0.12; // smaller buds ring higher
  const f = rng.range(1800, 2600) * up;
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.35 + size * 0.06, f * 2.76, 0.45, 0.2, f * 5.4, 0.2, 0.12],
      jitter: 0.02,
      noise: place ? 0.4 : 0.8,
      noiseTau: 0.002,
      noiseBp: [4500, 0.9],
    }),
  );
  layer(out, place ? 0.5 : 0.8, (b) =>
    ticks(b, sr, rng, {
      t: 0.005,
      dur: place ? 0.08 : 0.12 + size * 0.05,
      rate: 60 + size * 20,
      energy: (t) => Math.exp(-t / 0.05),
      f: [2000 * up, 5500 * up],
      t60: [0.08, 0.25],
      ratios: CRYSTAL,
      weights: [1, 0.35, 0.12],
      heavy: 1.4,
      click: 0.3,
    }),
  );
  return out;
}

// ------------------------------------------------------------------ pointed dripstone

/** A water drop from a stalactite landing: a single small rising "plink". */
function dripWater(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.25, sr);
  layer(out, 1, (b) => bubble(b, sr, 0.002, rng.range(900, 1600), 1, rng.range(0.018, 0.032), rng.range(0.4, 0.8)));
  layer(out, 0.2, (b) => burst(b, sr, rng, { dur: 0.008, attack: 0.0002, tau: 0.0015, bp: [4500, 1] }));
  return out;
}

/** A lava drop: a thicker, lower blob with a little sizzle. */
function dripLava(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  layer(out, 1, (b) => bubble(b, sr, 0.002, rng.range(320, 520), 1, rng.range(0.04, 0.06), rng.range(0.2, 0.4)));
  layer(out, 0.35, (b) => burst(b, sr, rng, { t: 0.01, dur: 0.25, attack: 0.01, tau: 0.07, hp: 3000 }));
  return out;
}

/** A fallen stalactite shattering on the ground. */
function dripstoneLand(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 1, (b) => b.set(stoneBreak(c, 0.85, 1.4).subarray(0, b.length)));
  layer(out, 0.6, (b) => thump(b, sr, { f0: 160, f1: 90, tau: 0.03 }));
  layer(out, 0.45, (b) => ticks(b, sr, rng, { t: 0.01, dur: 0.25, rate: 70, energy: (t) => Math.exp(-t / 0.08), f: [900, 3000], t60: [0.03, 0.1], heavy: 1.5, click: 0.4 }));
  return out;
}

// ------------------------------------------------------------------ registry

export function blockSounds(): Record<string, SoundGen> {
  const S: Record<string, SoundGen> = {};
  const set = (mat: string, brk: SoundGen, step: SoundGen, place: SoundGen = brk, hit: SoundGen = pitched(step, 0.5)) => {
    S[`block.${mat}.break`] = brk;
    S[`block.${mat}.step`] = step;
    S[`block.${mat}.place`] = place;
    S[`block.${mat}.hit`] = hit;
  };

  const stoneStepS = sound('block.stone.step', 6, (c) => stoneStep(c, 1));
  const stoneBreakS = sound('block.stone.break', 4, (c) => stoneBreak(c, 1));
  const stoneHitS = pitched(stoneStepS, 0.5);
  set('stone', stoneBreakS, stoneStepS, stoneBreakS, stoneHitS);

  const dsStep = sound('block.deepslate.step', 6, (c) => stoneStep(c, 0.62));
  set(
    'deepslate',
    sound('block.deepslate.break', 6, (c) => stoneBreak(c, 0.64)),
    dsStep,
    sound('block.deepslate.place', 6, (c) => stoneBreak(c, 0.7, 0.45)),
    pitched(dsStep, 0.5),
  );

  const woodBreakS = sound('block.wood.break', 4, woodBreak);
  set('wood', woodBreakS, sound('block.wood.step', 6, woodStep));

  const gravelStepS = sound('block.gravel.step', 4, gravelStep);
  set('gravel', sound('block.gravel.break', 4, gravelBreak), gravelStepS);

  const grassStepS = sound('block.grass.step', 6, (c) => grassStep(c, 1, 0.3));
  const grassHitS = pitched(grassStepS, 0.5);
  set('grass', sound('block.grass.break', 4, grassBreak), grassStepS, undefined, grassHitS);

  set('sand', sound('block.sand.break', 4, sandBreak), sound('block.sand.step', 5, sandStep));
  set('snow', sound('block.snow.break', 4, (c) => snowStep(c, 0.45, 0.09)), sound('block.snow.step', 4, (c) => snowStep(c)));
  set('wool', sound('block.wool.break', 4, (c) => woolStep(c, 0.38)), sound('block.wool.step', 4, (c) => woolStep(c)));

  // glass: shatter on break, stone for everything else (as vanilla)
  set('glass', sound('block.glass.break', 3, glassBreak), stoneStepS, stoneBreakS, stoneHitS);

  set('metal', sound('block.metal.break', 4, metalBreak), sound('block.metal.step', 6, metalStep));

  // ladder: wooden creak-tap steps, wood dig for break/place
  set('ladder', woodBreakS, sound('block.ladder.step', 5, ladderStep));

  set('mud', sound('block.mud.break', 6, (c) => mudStep(c, true)), sound('block.mud.step', 6, (c) => mudStep(c)));

  // crops: crispy rustle on break/place, grass steps and hits
  set(
    'crop',
    sound('block.crop.break', 6, (c) => cropBreak(c)),
    sound('block.crop.step', 6, (c) => grassStep(c, 1.2, 0.12)),
    sound('block.crop.place', 6, (c) => cropBreak(c, 0.45)),
    grassHitS,
  );

  set('wet_grass', sound('block.wet_grass.break', 4, (c) => wetGrassStep(c, true)), sound('block.wet_grass.step', 6, (c) => wetGrassStep(c)));

  // chain & lantern also get the landing sound: vanilla plays the step take at pitch 0.75
  const chainStepS = sound('block.chain.step', 6, chainStep);
  set('chain', sound('block.chain.break', 4, (c) => chainBreak(c, false)), chainStepS, sound('block.chain.place', 4, (c) => chainBreak(c, true)));
  S['block.chain.fall'] = pitched(chainStepS, 0.75);
  const lanternStepS = sound('block.lantern.step', 6, lanternStep);
  set('lantern', sound('block.lantern.break', 4, lanternBreak), lanternStepS, sound('block.lantern.place', 4, lanternPlace));
  S['block.lantern.fall'] = pitched(lanternStepS, 0.75);

  S['block.pointed_dripstone.drip_water'] = sound('block.pointed_dripstone.drip_water', 6, dripWater);
  S['block.pointed_dripstone.drip_lava'] = sound('block.pointed_dripstone.drip_lava', 4, dripLava);
  S['block.pointed_dripstone.land'] = sound('block.pointed_dripstone.land', 4, dripstoneLand);

  // amethyst: the block, and the cluster sounds the four growth stages share for steps and hits
  const amStepS = sound('block.amethyst_block.step', 6, amethystStep);
  set('amethyst_block', sound('block.amethyst_block.break', 4, (c) => amethystBreak(c, false)), amStepS, sound('block.amethyst_block.place', 4, (c) => amethystBreak(c, true)));
  S['block.amethyst_block.fall'] = pitched(amStepS, 0.75);
  S['block.amethyst_block.chime'] = sound('block.amethyst_block.chime', 6, amethystChime);
  const clStepS = sound('block.amethyst_cluster.step', 6, clusterStep);
  ['small_amethyst_bud', 'medium_amethyst_bud', 'large_amethyst_bud', 'amethyst_cluster'].forEach((n, size) => {
    set(n, sound(`block.${n}.break`, 4, (c) => clusterBreak(c, size, false)), clStepS, sound(`block.${n}.place`, 4, (c) => clusterBreak(c, size, true)), pitched(clStepS, 0.5));
    S[`block.${n}.fall`] = pitched(clStepS, 0.75);
  });
  return S;
}

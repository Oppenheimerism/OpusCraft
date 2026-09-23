// UI, player, combat and item sounds.

import type { SoundGen } from '../synth';
import {
  TAU,
  addMode,
  addOsc,
  alloc,
  brown,
  envAD,
  envAHD,
  envBump,
  layer,
  lowpass,
  softClip,
  SVF,
  sinCyc,
} from './dsp';
import { type Ctx, pitched, sound } from './registry';
import { bubble, burst, fireCrackles, impact, phisem, sweep, thump, ticks } from './texture';
import { voice, vowelGlide } from './voice';

// ------------------------------------------------------------------ UI

/** The classic short crisp click (also used, pitched down, by buttons and levers). */
export function click(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.12, sr);
  layer(out, 1, (b) => {
    impact(b, sr, rng, {
      modes: [1150, 1, 0.022, 2350, 0.55, 0.014, 3650, 0.35, 0.009, 5400, 0.2, 0.006, 430, 0.3, 0.03],
      noise: 0.9,
      noiseTau: 0.0012,
      noiseBp: [4000, 0.7],
    });
    impact(b, sr, rng, {
      t: 0.009,
      modes: [1250, 0.35, 0.015, 2500, 0.2, 0.01, 3900, 0.12, 0.007],
      noise: 0.35,
      noiseTau: 0.001,
      noiseBp: [4200, 0.8],
    });
  });
  return out;
}

/** Toast sliding in/out: a soft paper-like swish that rises (in) or falls (out). */
function toastSwish(c: Ctx, rising: boolean): Float32Array {
  const { sr, rng } = c;
  const d = 0.32;
  const out = alloc(d + 0.05, sr);
  const f0 = rising ? 900 : 2600, f1 = rising ? 2600 : 900;
  layer(out, 1, (b) =>
    sweep(b, sr, rng, {
      dur: d,
      f: (t) => f0 * Math.pow(f1 / f0, t / d),
      q: 1.4,
      amp: (t) => envBump(t / d, 0.45, 0.55),
      color: 'pink',
    }),
  );
  layer(out, 0.25, (b) => sweep(b, sr, rng, { dur: d, f: (t) => (f0 + (f1 - f0) * (t / d)) * 2.2, q: 2.5, amp: (t) => envBump(t / d, 0.5, 0.5) }));
  return out;
}

/** Challenge complete: a bright little fanfare arpeggio ending on a held chord. */
function challengeFanfare(c: Ctx): Float32Array {
  const { sr } = c;
  const out = alloc(2.2, sr);
  const note = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
  // C major: G4 C5 E5 G5 then a C major chord
  const seq: [number, number, number][] = [[67, 0, 0.14], [72, 0.12, 0.14], [76, 0.24, 0.14], [79, 0.36, 0.14]];
  for (const [m, t0, dur] of seq) {
    layer(out, 0.55, (b) => addOsc(b, sr, t0, dur + 0.2, () => note(m), (t) => envAD(t, 0.006, 0.12)));
    layer(out, 0.18, (b) => addOsc(b, sr, t0, dur + 0.2, () => note(m) * 2, (t) => envAD(t, 0.004, 0.08)));
  }
  for (const m of [72, 76, 79, 84]) {
    layer(out, 0.32, (b) => addOsc(b, sr, 0.5, 1.6, (t) => note(m) * (1 + 0.003 * Math.sin(TAU * 5 * t)), (t) => envAHD(t, 0.02, 0.35, 0.45)));
    layer(out, 0.08, (b) => addOsc(b, sr, 0.5, 1.4, () => note(m) * 3, (t) => envAHD(t, 0.02, 0.2, 0.3)));
  }
  return softClip(out, 1.2);
}

/** Item pickup: short bright "plip" with a rising pitch. */
function pop(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.12, sr);
  const f0 = 620;
  const f1 = 1650;
  const T = 0.035;
  const fr = (t: number) => f0 * Math.pow(f1 / f0, Math.min(1, t / T));
  layer(out, 1, (b) => addOsc(b, sr, 0, 0.12, fr, (t) => envAD(t, 0.0015, 0.022)));
  layer(out, 0.22, (b) => addOsc(b, sr, 0, 0.1, (t) => 2 * fr(t), (t) => envAD(t, 0.001, 0.012)));
  layer(out, 0.12, (b) => burst(b, sr, rng, { dur: 0.01, tau: 0.001, bp: [3000, 1] }));
  return out;
}

// ------------------------------------------------------------------ player voice

function grunt(c: Ctx, long: boolean): Float32Array {
  const { sr, rng } = c;
  const d = long ? rng.range(0.42, 0.52) : rng.range(0.16, 0.21);
  const out = alloc(d + 0.08, sr);
  const f0a = rng.range(165, 190);
  const f0b = f0a * (long ? rng.range(0.52, 0.6) : rng.range(0.66, 0.74));
  const vA = rng.pick(['uh', 'ae', 'a']);
  const F = vowelGlide(vA, long ? 'o' : 'er', 0.02, d, rng.range(0.97, 1.05));
  const hold = long ? d * 0.35 : 0.035;
  layer(out, 1, (b) =>
    voice(b, sr, rng, {
      dur: d + 0.05,
      f0: (t) => f0b + (f0a - f0b) * Math.exp(-t / (long ? 0.16 : 0.05)),
      amp: (t) => envAHD(t, 0.006, hold, long ? d * 0.3 : 0.045),
      formants: [
        { f: F[0], bw: 90, g: 1 },
        { f: F[1], bw: 110, g: 0.6 },
        { f: F[2], bw: 170, g: 0.3 },
        { f: F[3], bw: 250, g: 0.14 },
      ],
      jitter: 0.025,
      shimmer: 0.12,
      breath: (t) => 0.12 + (long ? 0.25 * (t / d) : 0.12 * (t / d)),
      rough: (long ? 0.14 : 0.22),
      sub: long ? 0 : 0.04,
      oq: 0.45,
    }),
  );
  // glottal attack + chest "thump" of the hit
  layer(out, 0.3, (b) => burst(b, sr, rng, { dur: 0.025, tau: 0.004, bp: [1300, 0.7] }));
  layer(out, 0.3, (b) => thump(b, sr, { f0: 150, f1: 95, tau: 0.03 }));
  return out;
}

/**
 * Damage-type hurt variants: the regular grunt plus a cue — fire crackle and sizzle, an
 * underwater gurgle (muffled, bubbling voice), or a brittle ice crack with a shiver.
 */
function hurtSpecial(c: Ctx, kind: 'fire' | 'drown' | 'freeze' | 'berry'): Float32Array {
  const { sr, rng } = c;
  const g = grunt(c, false);
  const out = new Float32Array(g.length + Math.round(0.15 * sr));
  if (kind === 'berry') {
    // the grunt with a scratch of thorny twigs
    layer(out, 1, (b) => b.set(g));
    layer(out, 0.55, (b) =>
      phisem(b, sr, rng, {
        dur: 0.2,
        rate: 3500,
        energy: (t) => envAD(t, 0.004, 0.05),
        grain: 0.0008,
        heavy: 1.4,
        dry: 0.4,
        bands: [
          { f: 3800, q: 1.4, g: 1, spread: 0.35 },
          { f: 1900, q: 1.2, g: 0.5, spread: 0.3 },
        ],
      }),
    );
    return out;
  }
  if (kind === 'drown') {
    const m = g.slice();
    lowpass(m, 1100, sr);
    lowpass(m, 1100, sr);
    const fr = rng.range(18, 26) / sr;
    for (let i = 0; i < m.length; i++) m[i] *= 0.7 + 0.3 * sinCyc(fr * i + 0.5 * sinCyc((3 * i) / sr));
    layer(out, 1, (b) => b.set(m));
    layer(out, 0.7, (b) => {
      const nb = 18 + rng.int(8);
      for (let k = 0; k < nb; k++) bubble(b, sr, rng.range(0, g.length / sr + 0.08), rng.logRange(250, 900), rng.range(0.3, 1), undefined, rng.range(0.3, 0.8));
    });
    layer(out, 0.4, (b) => addOsc(b, sr, 0.02, 0.12, (t) => 220 * (1 + (2 * t) / 0.12), (t) => envAD(t, 0.01, 0.04)));
    return out;
  }
  if (kind === 'freeze') {
    const m = g.slice();
    const fr = rng.range(12, 16) / sr;
    for (let i = 0; i < m.length; i++) m[i] *= 0.78 + 0.22 * sinCyc(fr * i);
    layer(out, 1, (b) => b.set(m));
    layer(out, 0.8, (b) => {
      burst(b, sr, rng, { dur: 0.02, attack: 0.0002, tau: 0.0025, hp: 2500 });
      impact(b, sr, rng, { modes: [rng.range(2600, 3400), 1, 0.03, rng.range(4200, 5200), 0.7, 0.02, rng.range(6500, 7500), 0.4, 0.015] });
    });
    layer(out, 0.45, (b) =>
      ticks(b, sr, rng, {
        t: 0.005,
        dur: 0.22,
        rate: 90,
        energy: (t) => Math.exp(-t / 0.08),
        f: [2500, 7000],
        t60: [0.004, 0.02],
        ratios: [1, 1.73, 2.6],
        weights: [1, 0.5, 0.3],
        click: 0.7,
      }),
    );
    return out;
  }
  layer(out, 1, (b) => b.set(g));
  layer(out, 0.6, (b) => fireCrackles(b, sr, rng, 0, 0.3, 45, 0.3));
  layer(out, 0.35, (b) =>
    phisem(b, sr, rng, {
      dur: 0.3,
      rate: 6000,
      energy: (t) => envAD(t, 0.01, 0.1),
      grain: 0.0005,
      heavy: 1.8,
      dry: 0.3,
      bands: [
        { f: 5200, q: 1.2, g: 1, spread: 0.3 },
        { f: 3000, q: 1.8, g: 0.4, spread: 0.3 },
      ],
    }),
  );
  return out;
}

function burp(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = 0.55;
  const out = alloc(0.65, sr);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => 104 - 26 * (t / d) + 6 * Math.sin(TAU * 3 * t),
    amp: (t) => envAHD(t, 0.03, 0.32, 0.07),
    formants: [
      { f: (t) => 540 - 80 * t, bw: 110, g: 1 },
      { f: 950, bw: 140, g: 0.55 },
      { f: 2250, bw: 200, g: 0.2 },
      { f: 3200, bw: 300, g: 0.08 },
    ],
    jitter: 0.09,
    shimmer: 0.3,
    rough: 0.5,
    sub: 0.12,
    breath: 0.12,
    growl: [31, 0.55],
    oq: 0.45,
  });
  return out;
}

// ------------------------------------------------------------------ eating / drinking

function eat(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.26, 0.34);
  const out = alloc(d, sr);
  const t2 = rng.range(0.09, 0.14);
  const en = (t: number) => Math.min(1, envAD(t, 0.004, 0.035) + 0.75 * envAD(t - t2, 0.006, 0.04));
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 4200,
      energy: en,
      grain: 0.0012,
      heavy: 3,
      bands: [
        { f: 1800, q: 2, g: 1, spread: 0.4 },
        { f: 3600, q: 2, g: 0.7, spread: 0.3 },
        { f: 800, q: 2, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.4, (b) => ticks(b, sr, rng, { dur: d * 0.8, rate: 90, energy: en, f: [1200, 4200], t60: [0.004, 0.015], click: 0.4 }));
  layer(out, 0.35, (b) => burst(b, sr, rng, { dur: d, attack: 0.01, tau: 0.05, lp: 600, env: (t) => en(t) }));
  return out;
}

function drink(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  const gulp = (b: Float32Array, t0: number, f0: number, a: number) => {
    addOsc(b, sr, t0, 0.09, (t) => f0 * (1 + 1.3 * Math.min(1, t / 0.05)), (t) => a * envAD(t, 0.004, 0.022));
    burst(b, sr, rng, { t: t0, dur: 0.12, attack: 0.012, tau: 0.03, lp: 700, amp: 0.5 * a });
    thump(b, sr, { t: t0 + 0.01, f0: 170, f1: 110, tau: 0.025, amp: 0.45 * a });
  };
  layer(out, 1, (b) => {
    gulp(b, 0, rng.range(240, 280), 1);
    gulp(b, rng.range(0.15, 0.19), rng.range(270, 320), 0.8);
  });
  return out;
}

// ------------------------------------------------------------------ water

/** a belly-flop: the big splash with a heavier body of water behind it */
function heavySplash(c: Ctx): Float32Array {
  const base = splash(c, true);
  const out = new Float32Array(base.length);
  layer(out, 1, (b) => b.set(base));
  layer(out, 0.8, (b) => burst(b, c.sr, c.rng, { dur: 0.7, attack: 0.002, tau: 0.22, lp: 260, color: 'brown' }));
  return out;
}

function splash(c: Ctx, big: boolean): Float32Array {
  const { sr, rng } = c;
  const d = big ? 1.4 : 1.0;
  const out = alloc(d, sr);
  layer(out, 0.8, (b) => burst(b, sr, rng, { dur: 0.45, attack: 0.003, tau: big ? 0.12 : 0.07, lp: big ? 350 : 500, color: 'brown' }));
  const mf = rng.range(7, 11);
  layer(out, 1, (b) =>
    burst(b, sr, rng, {
      dur: d * 0.85,
      attack: 0.004,
      tau: big ? 0.17 : 0.1,
      bp: [1800, 0.5],
      env: (t) => 0.75 + 0.25 * Math.sin(TAU * mf * t),
    }),
  );
  layer(out, 0.45, (b) =>
    phisem(b, sr, rng, {
      t: 0.02,
      dur: d * 0.9,
      rate: 1500,
      energy: (t) => Math.exp(-t / (big ? 0.35 : 0.25)),
      grain: 0.0008,
      heavy: 2,
      bands: [
        { f: 4000, q: 1.5, g: 1, spread: 0.4 },
        { f: 2200, q: 2, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.6, (b) => {
    const nb = big ? 140 : 80;
    for (let k = 0; k < nb; k++) {
      const t = 0.02 + Math.pow(rng.next(), 1.8) * d * 0.8;
      bubble(b, sr, t, rng.logRange(350, 2800), Math.pow(rng.next(), 2) * Math.exp(-t / 0.4), undefined, rng.range(0.1, 0.5));
    }
  });
  return out;
}

function swim(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.5, 0.7);
  const out = alloc(d + 0.1, sr);
  const f0 = rng.range(450, 750);
  const f1 = f0 * rng.range(1.5, 2.2);
  const pk = rng.range(0.35, 0.5);
  layer(out, 1, (b) =>
    sweep(b, sr, rng, {
      dur: d,
      f: (t) => f0 + (f1 - f0) * Math.sin((Math.PI * t) / d),
      q: 1.2,
      amp: (t) => envBump(t, d * pk, d * (1 - pk)),
      color: 'pink',
    }),
  );
  layer(out, 0.35, (b) => sweep(b, sr, rng, { dur: d, f: () => 2600, q: 0.8, amp: (t) => envBump(t, d * 0.45, d * 0.55) }));
  layer(out, 0.35, (b) => {
    const nb = 8 + rng.int(8);
    for (let k = 0; k < nb; k++) bubble(b, sr, rng.range(0.05, d * 0.9), rng.logRange(300, 1500), rng.range(0.2, 1), undefined, 0.3);
  });
  return out;
}

// ------------------------------------------------------------------ falls & combat

function fall(c: Ctx, big: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(big ? 0.5 : 0.3, sr);
  layer(out, 1, (b) => thump(b, sr, { f0: big ? 115 : 160, f1: big ? 50 : 85, glide: 0.04, tau: big ? 0.07 : 0.035, attack: 0.002 }));
  layer(out, big ? 0.7 : 0.5, (b) => burst(b, sr, rng, { dur: 0.2, attack: 0.001, tau: big ? 0.03 : 0.018, lp: big ? 900 : 1300 }));
  layer(out, big ? 0.35 : 0.2, (b) => impact(b, sr, rng, { modes: [140, 1, 0.08, 230, 0.7, 0.06, 390, 0.4, 0.04], jitter: 0.1 }));
  if (big) {
    layer(out, 0.35, (b) =>
      phisem(b, sr, rng, {
        dur: 0.1,
        rate: 3000,
        energy: (t) => Math.exp(-t / 0.02),
        grain: 0.001,
        heavy: 2.5,
        bands: [
          { f: 1800, q: 2, g: 1, spread: 0.4 },
          { f: 3200, q: 2, g: 0.5, spread: 0.3 },
        ],
      }),
    );
  }
  return out;
}

function swingWhoosh(b: Float32Array, sr: number, c: Ctx, t0: number, d: number, fA: number, fB: number, q: number): void {
  sweep(b, sr, c.rng, {
    t: t0,
    dur: d,
    f: (t) => fA * Math.pow(fB / fA, t / d),
    q,
    amp: (t) => envBump(t, d * 0.6, d * 0.4),
  });
}

function attackStrong(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.36, sr);
  const tw = rng.range(0.055, 0.075);
  layer(out, 0.55, (b) => swingWhoosh(b, sr, c, 0, tw + 0.02, rng.range(600, 800), rng.range(1900, 2500), 1.5));
  layer(out, 1, (b) => thump(b, sr, { t: tw, f0: rng.range(140, 165), f1: 85, glide: 0.025, tau: 0.028 }));
  layer(out, 0.75, (b) => burst(b, sr, rng, { t: tw, dur: 0.15, attack: 0.001, tau: 0.025, lp: 1600 }));
  layer(out, 0.4, (b) => burst(b, sr, rng, { t: tw, dur: 0.03, attack: 0.0003, tau: 0.005, bp: [2600, 0.8] }));
  return out;
}

function attackWeak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.26, sr);
  const tw = rng.range(0.045, 0.06);
  layer(out, 0.6, (b) => swingWhoosh(b, sr, c, 0, tw + 0.015, rng.range(1100, 1400), rng.range(2300, 2900), 1.4));
  layer(out, 0.7, (b) => thump(b, sr, { t: tw, f0: rng.range(200, 230), f1: 130, glide: 0.02, tau: 0.018 }));
  layer(out, 0.5, (b) => burst(b, sr, rng, { t: tw, dur: 0.1, attack: 0.001, tau: 0.015, lp: 2000 }));
  return out;
}

function attackSweep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.32, 0.4);
  const out = alloc(d + 0.05, sr);
  const f0 = rng.range(380, 480);
  const fm = rng.range(2200, 2800);
  const f1 = rng.range(800, 1000);
  const pk = rng.range(0.4, 0.5);
  const fr = (t: number) => (t < d * pk ? f0 * Math.pow(fm / f0, t / (d * pk)) : fm * Math.pow(f1 / fm, (t - d * pk) / (d * (1 - pk))));
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: fr, q: 3, amp: (t) => envBump(t, d * pk, d * (1 - pk)) }));
  layer(out, 0.35, (b) => sweep(b, sr, rng, { dur: d, f: (t) => fr(t) * 1.9, q: 9, amp: (t) => envBump(t, d * pk, d * (1 - pk)) }));
  return out;
}

function attackCrit(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.3, sr);
  layer(out, 1, (b) => burst(b, sr, rng, { dur: 0.05, attack: 0.0003, tau: 0.009, hp: 1000 }));
  layer(out, 0.6, (b) =>
    impact(b, sr, rng, { modes: [rng.range(1600, 2000), 1, 0.04, rng.range(2600, 2900), 0.7, 0.03, rng.range(3900, 4400), 0.4, 0.02], jitter: 0.02 }),
  );
  layer(out, 0.55, (b) =>
    phisem(b, sr, rng, {
      t: 0.002,
      dur: 0.1,
      rate: 4000,
      energy: (t) => Math.exp(-t / 0.025),
      grain: 0.0008,
      heavy: 2.5,
      bands: [
        { f: 2000, q: 2, g: 1, spread: 0.4 },
        { f: 4000, q: 2, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.6, (b) => thump(b, sr, { f0: 180, f1: 100, glide: 0.02, tau: 0.02 }));
  return out;
}

function attackNoDamage(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.16, 0.22);
  const out = alloc(d + 0.03, sr);
  layer(out, 1, (b) => swingWhoosh(b, sr, c, 0, d, rng.range(1300, 1700), rng.range(3000, 3800), 1.2));
  layer(out, 0.25, (b) => burst(b, sr, rng, { t: d * 0.7, dur: 0.05, attack: 0.002, tau: 0.01, lp: 900 }));
  return out;
}

/** Knockback (sprint) hit: a longer, heavier swing, a deep thud and a shove of air. */
function attackKnockback(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  const tw = rng.range(0.07, 0.09);
  layer(out, 0.6, (b) => swingWhoosh(b, sr, c, 0, tw + 0.025, rng.range(450, 600), rng.range(1600, 2100), 1.3));
  layer(out, 1, (b) => thump(b, sr, { t: tw, f0: rng.range(120, 140), f1: 62, glide: 0.035, tau: 0.045 }));
  layer(out, 0.85, (b) => burst(b, sr, rng, { t: tw, dur: 0.2, attack: 0.001, tau: 0.035, lp: 1200 }));
  layer(out, 0.45, (b) => burst(b, sr, rng, { t: tw, dur: 0.03, attack: 0.0003, tau: 0.006, bp: [2200, 0.8] }));
  const pd = rng.range(0.1, 0.14);
  layer(out, 0.35, (b) =>
    sweep(b, sr, rng, { t: tw + 0.01, dur: pd, f: (t) => 900 * Math.pow(0.45, t / pd), q: 1, amp: (t) => envBump(t, pd * 0.2, pd * 0.8) }),
  );
  return out;
}

// ------------------------------------------------------------------ chimes

function orb(c: Ctx): Float32Array {
  const { sr } = c;
  const out = alloc(0.4, sr);
  const f = 1480;
  layer(out, 1, (b) => {
    addMode(b, 0, sr, f, 1, 0.32);
    addMode(b, 0, sr, f * 2.0, 0.18, 0.16);
    addMode(b, 0, sr, f * 3.01, 0.07, 0.08);
    addMode(b, 0, sr, f * 4.12, 0.04, 0.05);
  });
  return out;
}

function levelUp(c: Ctx): Float32Array {
  const { sr } = c;
  const out = alloc(1.7, sr);
  const base = 523.25; // C5
  const steps = [0, 4, 7, 12, 16, 19, 24];
  const dt = 0.045;
  layer(out, 1, (b) => {
    steps.forEach((s, k) => {
      const f = base * Math.pow(2, s / 12);
      const st = Math.round(k * dt * sr);
      const a = 0.55 + 0.45 * (k / (steps.length - 1));
      addMode(b, st, sr, f, a, 1.1);
      addMode(b, st, sr, f * 2, a * 0.28, 0.5);
      addMode(b, st, sr, f * 3, a * 0.1, 0.25);
    });
    // shimmering sustained top
    const t0 = steps.length * dt;
    for (const s of [12, 16, 19, 24]) {
      const f = base * Math.pow(2, s / 12);
      addOsc(b, sr, t0, 1.4, () => f * 1.002, (t) => 0.22 * envAD(t, 0.05, 0.45) * (1 + 0.3 * Math.sin(TAU * 6 * t)));
    }
  });
  return out;
}

// ------------------------------------------------------------------ explosion

function explode(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(3.0, 3.8);
  const out = alloc(d, sr);
  const n = out.length;
  layer(out, 1, (b) => {
    const f = new SVF(8000, 0.8, sr);
    let e1 = 1;
    let e2 = 1;
    const k1 = Math.exp(-1 / (0.09 * sr));
    const k2 = Math.exp(-1 / (0.7 * sr));
    const att = Math.round(0.001 * sr);
    const fall = rng.range(0.15, 0.22);
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) f.set(250 + 7500 * Math.exp(-i / sr / fall), 0.8, sr);
      b[i] = f.low(rng.bi()) * (0.75 * e1 + 0.25 * e2) * (i < att ? i / att : 1);
      e1 *= k1;
      e2 *= k2;
    }
  });
  layer(out, 0.9, (b) => thump(b, sr, { f0: rng.range(68, 80), f1: 32, glide: 0.18, tau: 0.35, attack: 0.003, dur: 2 }));
  layer(out, 0.8, (b) => {
    const r = brown(n, rng, 0.998);
    lowpass(r, 200, sr);
    lowpass(r, 200, sr);
    const m1 = rng.range(1.5, 3);
    const m2 = rng.range(3, 6);
    const p1 = rng.next();
    const p2 = rng.next();
    const ka = Math.exp(-1 / (0.9 * sr));
    const att = 0.03 * sr;
    let e = 1;
    for (let i = 0; i < n; i++) {
      const a = (i < att ? i / att : 1) * e;
      e *= ka;
      b[i] = r[i] * a * (1 + 0.35 * sinCyc((m1 * i) / sr + p1) + 0.2 * sinCyc((m2 * i) / sr + p2));
    }
  });
  layer(out, 0.3, (b) =>
    ticks(b, sr, rng, { t: 0.05, dur: 1.6, rate: 45, energy: (t) => Math.exp(-t / 0.5), f: [250, 2200], t60: [0.02, 0.1], click: 0.5 }),
  );
  softClip(out, 2.2);
  lowpass(out, 7500, sr);
  return out;
}

// ------------------------------------------------------------------ bow

export function bowShoot(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.55, sr);
  const f = rng.range(118, 138);
  layer(out, 0.7, (b) => {
    for (let h = 1; h <= 9; h++) addMode(b, 0, sr, f * h * (1 + 0.0015 * h * h), 1 / h, 0.22 / Math.sqrt(h));
  });
  layer(out, 1, (b) =>
    sweep(b, sr, rng, {
      t: 0.005,
      dur: 0.3,
      f: (t) => 2600 * Math.pow(700 / 2600, t / 0.3),
      q: 1.4,
      amp: (t) => envAD(t, 0.012, 0.07),
    }),
  );
  layer(out, 0.35, (b) => burst(b, sr, rng, { dur: 0.02, tau: 0.003, bp: [2200, 1] }));
  return out;
}

function arrowHit(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  const f = rng.range(420, 620);
  layer(out, 1, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.07, f * 2.37, 0.6, 0.045, f * 4.1, 0.3, 0.03, f * 6.3, 0.15, 0.02],
      noise: 1,
      noiseTau: 0.003,
      noiseBp: [1600, 0.8],
    }),
  );
  const fv = rng.range(55, 85);
  const fc = fv * rng.range(4, 5);
  layer(out, 0.35, (b) => addOsc(b, sr, 0.005, 0.35, () => fc, (t) => envAD(t, 0.003, 0.08) * (0.5 + 0.5 * Math.sin(TAU * fv * t))));
  return out;
}

// ------------------------------------------------------------------ buckets

function bucketFill(c: Ctx, lava: boolean): Float32Array {
  const { sr, rng } = c;
  const d = lava ? 0.9 : 0.75;
  const out = alloc(d, sr);
  const fb = rng.range(480, 600);
  layer(out, 0.32, (b) =>
    impact(b, sr, rng, {
      modes: [fb, 1, 0.35, fb * 1.59, 0.7, 0.28, fb * 2.14, 0.5, 0.2, fb * 2.65, 0.35, 0.15, fb * 3.25, 0.2, 0.1],
      noise: 0.4,
      noiseTau: 0.002,
      noiseBp: [3000, 1],
    }),
  );
  layer(out, 1, (b) => {
    const nb = lava ? 14 : 32;
    for (let k = 0; k < nb; k++) {
      const t = 0.03 + rng.next() * d * 0.75;
      const f = (lava ? rng.logRange(90, 320) : rng.logRange(300, 1200)) * (1 + (0.6 * t) / d);
      bubble(b, sr, t, f, rng.range(0.3, 1), lava ? rng.range(0.025, 0.05) : undefined, lava ? 0.15 : 0.35);
    }
  });
  layer(out, 0.6, (b) =>
    sweep(b, sr, rng, {
      dur: d,
      f: (t) => (lava ? 500 : 1100) + (lava ? 300 : 900) * Math.sin((Math.PI * t) / d),
      q: 1,
      amp: (t) => envBump(t, 0.08, d - 0.1),
      color: 'pink',
    }),
  );
  if (lava) {
    layer(out, 0.22, (b) =>
      phisem(b, sr, rng, { dur: d, rate: 1500, energy: (t) => envBump(t, 0.1, d - 0.1), grain: 0.0005, bands: [{ f: 6000, q: 1.5, g: 1, spread: 0.3 }] }),
    );
  }
  return out;
}

function bucketEmpty(c: Ctx, lava: boolean): Float32Array {
  const { sr, rng } = c;
  const d = lava ? 1.0 : 0.85;
  const out = alloc(d, sr);
  const fl = rng.range(10, 15);
  layer(out, 1, (b) =>
    sweep(b, sr, rng, {
      dur: d,
      f: (t) => (lava ? 600 : 1500) * (1 - (0.3 * t) / d),
      q: 0.9,
      amp: (t) => envBump(t, 0.05, d - 0.1) * (0.75 + 0.25 * Math.sin(TAU * fl * t)),
      color: 'pink',
    }),
  );
  layer(out, 0.7, (b) => burst(b, sr, rng, { t: 0.1, dur: 0.6, attack: 0.01, tau: 0.15, bp: [lava ? 700 : 2000, 0.6] }));
  layer(out, 0.5, (b) => {
    const nb = lava ? 8 : 20;
    for (let k = 0; k < nb; k++) {
      const t = 0.1 + rng.next() * d * 0.7;
      bubble(b, sr, t, lava ? rng.logRange(100, 350) : rng.logRange(400, 1800), rng.range(0.3, 1), lava ? rng.range(0.025, 0.045) : undefined, lava ? 0.15 : 0.4);
    }
  });
  const fb = rng.range(480, 600);
  layer(out, 0.22, (b) => impact(b, sr, rng, { modes: [fb, 1, 0.3, fb * 1.59, 0.6, 0.22, fb * 2.14, 0.4, 0.15], noise: 0.3, noiseTau: 0.002 }));
  if (lava) {
    layer(out, 0.25, (b) =>
      phisem(b, sr, rng, { dur: d, rate: 1800, energy: (t) => envBump(t, 0.15, d - 0.15), grain: 0.0005, bands: [{ f: 6000, q: 1.5, g: 1, spread: 0.3 }] }),
    );
  }
  return out;
}

// ------------------------------------------------------------------ misc items

/** Flint and steel: a short ringing steel strike, a gritty scrape across the flint and a few sparks. */
function flintStrike(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.34, sr);
  const f = rng.range(2700, 3500);
  layer(out, 0.9, (b) =>
    impact(b, sr, rng, {
      modes: [f, 1, 0.1, f * rng.range(1.48, 1.56), 0.7, 0.075, f * rng.range(2.2, 2.35), 0.45, 0.05, f * 0.62, 0.35, 0.12],
      jitter: 0.02,
      noise: 1.2,
      noiseTau: 0.0012,
      noiseBp: [6000, 1],
    }),
  );
  const sd = rng.range(0.18, 0.25);
  const st = rng.range(0.004, 0.012);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      t: st,
      dur: sd,
      rate: 12000,
      energy: (t) => envBump(t, sd * 0.2, sd * 0.8),
      grain: 0.00035,
      heavy: 1.8,
      bands: [
        { f: 4200, q: 2.2, g: 1, spread: 0.3 },
        { f: 7000, q: 2, g: 0.7, spread: 0.2 },
        { f: 2600, q: 3, g: 0.35, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.35, (b) =>
    ticks(b, sr, rng, {
      t: st + sd * 0.25,
      dur: 0.26,
      rate: 60,
      energy: (t) => Math.exp(-t / 0.12),
      f: [3000, 8000],
      t60: [0.003, 0.01],
      ratios: [1, 1.7],
      weights: [1, 0.4],
      click: 0.9,
    }),
  );
  return out;
}

/** Fire charge: a short fiery "fwoosh" — a flaring low-passed roar with crackles. */
function fireChargeUse(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.5, 0.65);
  const out = alloc(d, sr);
  const fb = rng.range(2600, 3600);
  layer(out, 1, (b) =>
    sweep(b, sr, rng, {
      dur: d,
      f: (t) => 500 + (fb - 500) * envAD(t, 0.05, 0.14),
      q: 0.9,
      amp: (t) => envAD(t, 0.025, 0.15),
      mode: 'lp',
      color: 'pink',
    }),
  );
  layer(out, 0.55, (b) =>
    sweep(b, sr, rng, { dur: d, f: (t) => 900 + 1400 * envAD(t, 0.04, 0.1), q: 1.2, amp: (t) => envAD(t, 0.02, 0.12) }),
  );
  layer(out, 0.3, (b) => burst(b, sr, rng, { dur: d, attack: 0.03, tau: 0.12, lp: 380, color: 'brown' }));
  layer(out, 0.35, (b) => fireCrackles(b, sr, rng, 0.02, d * 0.7, rng.range(35, 50), 0.2));
  layer(out, 0.2, (b) => thump(b, sr, { f0: 95, f1: 60, glide: 0.06, tau: 0.08, attack: 0.02 }));
  return out;
}

/** Cow milking: milk streaming into a metal bucket, glugs rising in pitch as it fills. */
function cowMilk(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.48, 0.58);
  const out = alloc(d + 0.2, sr);
  const fb = rng.range(520, 640);
  layer(out, 0.35, (b) =>
    impact(b, sr, rng, {
      t: 0.02,
      modes: [fb, 1, 0.4, fb * 1.59, 0.7, 0.3, fb * 2.14, 0.5, 0.22, fb * 2.65, 0.35, 0.16, fb * 3.25, 0.2, 0.1],
      noise: 0.3,
      noiseTau: 0.002,
      noiseBp: [3000, 1],
    }),
  );
  const fl = rng.range(11, 17);
  layer(out, 1, (b) =>
    sweep(b, sr, rng, {
      dur: d,
      f: (t) => 1300 + (600 * t) / d,
      q: 1.1,
      amp: (t) => envBump(t, 0.03, d - 0.03) * (0.75 + 0.25 * Math.sin(TAU * fl * t)),
      color: 'pink',
    }),
  );
  layer(out, 0.7, (b) => {
    const nb = 18 + rng.int(8);
    for (let k = 0; k < nb; k++) {
      const t = 0.02 + rng.next() * d * 0.85;
      bubble(b, sr, t, rng.logRange(450, 1300) * (1 + (0.5 * t) / d), rng.range(0.3, 1), undefined, 0.35);
    }
  });
  layer(out, 0.25, (b) => sweep(b, sr, rng, { dur: d, f: () => fb, q: 12, amp: (t) => envBump(t, 0.05, d - 0.05) }));
  return out;
}

/** Dye use: a small soft squish with a tiny pop. */
function dyeUse(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.14, 0.2);
  const out = alloc(d + 0.08, sr);
  const fA = rng.range(500, 700);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: d, f: (t) => fA * Math.pow(2.6, t / d), q: 4, amp: (t) => envBump(t, d * 0.2, d * 0.8) }));
  const fp = rng.range(380, 460);
  layer(out, 0.7, (b) => addOsc(b, sr, 0.005, 0.08, (t) => fp * (1 + 1.3 * Math.min(1, t / 0.03)), (t) => envAD(t, 0.002, 0.018)));
  layer(out, 0.3, (b) => bubble(b, sr, rng.range(0.02, d * 0.6), rng.range(700, 1200), 1, undefined, 0.5));
  lowpass(out, 3500, sr);
  return out;
}

/** Hoe tilling: a blade scraping through soil — gritty earth, a dull thud and a few clods. */
function hoeTill(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.32, 0.42);
  const out = alloc(d, sr);
  const pk = rng.range(0.25, 0.35);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: d,
      rate: 5000,
      energy: (t) => envBump(t, d * pk, d * (1 - pk)),
      grain: 0.0015,
      heavy: 2.4,
      bands: [
        { f: 1100, q: 1.3, g: 1, spread: 0.4 },
        { f: 2300, q: 1.5, g: 0.6, spread: 0.3 },
        { f: 550, q: 1.5, g: 0.7, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.5, (b) => burst(b, sr, rng, { dur: 0.2, attack: 0.005, tau: 0.04, lp: 400 }));
  const f = rng.range(2500, 3200);
  layer(out, 0.2, (b) => impact(b, sr, rng, { modes: [f, 1, 0.05, f * 1.5, 0.5, 0.035], noise: 0.5, noiseTau: 0.001, noiseBp: [4000, 1] }));
  layer(out, 0.35, (b) =>
    ticks(b, sr, rng, { t: d * 0.2, dur: d * 0.7, rate: 40, energy: () => 1, f: [300, 900], t60: [0.01, 0.03], ratios: [1, 2.3], weights: [1, 0.4], click: 0.3 }),
  );
  return out;
}

/**
 * An axe stripping a log: the blade bites in with a woody knock, then the bark tears away along the grain in a
 * fibrous, crackling scrape that fades as the strip comes free.
 */
function axeStrip(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.42, 0.55);
  const out = alloc(d + 0.05, sr);
  // the bite: a short knock with the log's hollow woody ring
  const f = rng.range(420, 560);
  layer(out, 0.55, (b) => impact(b, sr, rng, { modes: [f, 1, 0.06, f * 2.3, 0.5, 0.04, f * 4.1, 0.25, 0.02], jitter: 0.03, noise: 0.8, noiseTau: 0.004, noiseBp: [2200, 0.8] }));
  // the tear: dense, grainy scraping, loudest just after the bite
  const pk = rng.range(0.12, 0.2), wob = rng.range(55, 75);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      t: 0.01,
      dur: d,
      rate: 9000,
      energy: (t) => envBump(t, d * pk, d * (1 - pk)) * (0.75 + 0.25 * Math.sin(t * wob)),
      grain: 0.0008,
      heavy: 2.2,
      bands: [
        { f: 1400, q: 1.2, g: 1, spread: 0.35 },
        { f: 3100, q: 1.6, g: 0.55, spread: 0.3 },
        { f: 700, q: 1.4, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  // fibres snapping as the bark lifts
  layer(out, 0.45, (b) =>
    ticks(b, sr, rng, { t: 0.03, dur: d * 0.8, rate: 70, energy: (t) => Math.exp(-t / (d * 0.45)), f: [450, 1500], t60: [0.008, 0.025], ratios: [1, 2.1, 3.4], weights: [1, 0.45, 0.2], click: 0.4 }),
  );
  layer(out, 0.3, (b) => burst(b, sr, rng, { dur: 0.15, attack: 0.003, tau: 0.035, lp: 450 }));
  return out;
}

/** Bone meal: a soft dusty sprinkle with a faint magical twinkle. */
function boneMeal(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.35, sr);
  layer(out, 1, (b) =>
    phisem(b, sr, rng, {
      dur: 0.3,
      rate: 15000,
      energy: (t) => envAD(t, 0.015, 0.08),
      grain: 0.0005,
      heavy: 1.5,
      bands: [
        { f: 3500, q: 1, g: 1, spread: 0.2 },
        { f: 6500, q: 1.2, g: 0.6, spread: 0.15 },
      ],
    }),
  );
  layer(out, 0.45, (b) => {
    const n = 3 + rng.int(3);
    for (let k = 0; k < n; k++) {
      const s = Math.round(rng.range(0.03, 0.22) * sr);
      const f = rng.range(5000, 9000);
      const a = rng.range(0.4, 1);
      addMode(b, s, sr, f, a, rng.range(0.08, 0.2));
      addMode(b, s, sr, f * 2.76, a * 0.25, 0.05);
    }
  });
  layer(out, 0.15, (b) => thump(b, sr, { f0: 180, f1: 120, tau: 0.02 }));
  return out;
}

function itemBreak(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  layer(out, 1, (b) => {
    burst(b, sr, rng, { dur: 0.03, attack: 0.0002, tau: 0.004, hp: 1200 });
    impact(b, sr, rng, { modes: [2100, 1, 0.035, 3150, 0.7, 0.025, 4700, 0.5, 0.02, 1300, 0.5, 0.04] });
  });
  layer(out, 0.6, (b) =>
    phisem(b, sr, rng, {
      t: 0.003,
      dur: 0.25,
      rate: 3000,
      energy: (t) => Math.exp(-t / 0.05),
      grain: 0.0008,
      heavy: 2.5,
      bands: [
        { f: 1800, q: 2, g: 1, spread: 0.4 },
        { f: 3600, q: 2, g: 0.6, spread: 0.3 },
      ],
    }),
  );
  layer(out, 0.35, (b) =>
    ticks(b, sr, rng, { t: 0.02, dur: 0.3, rate: 20, energy: (t) => Math.exp(-t / 0.1), f: [3000, 6500], t60: [0.05, 0.12], ratios: [1, 1.7, 2.6], click: 0.2 }),
  );
  return out;
}

// ------------------------------------------------------------------ registry

export function playerSounds(): Record<string, SoundGen> {
  const clickS = sound('ui.button.click', 1, click);
  const bow = sound('entity.arrow.shoot', 1, bowShoot);
  const hurt = sound('entity.player.hurt', 3, (c) => grunt(c, false));
  return {
    'ui.button.click': clickS,
    'ui.toast.in': sound('ui.toast.in', 1, (c) => toastSwish(c, true)),
    'ui.toast.out': sound('ui.toast.out', 1, (c) => toastSwish(c, false)),
    'ui.toast.challenge_complete': sound('ui.toast.challenge_complete', 1, challengeFanfare),
    'block.stone_button.click_on': pitched(clickS, 0.6),
    'block.stone_button.click_off': pitched(clickS, 0.5),
    'block.lever.click': pitched(clickS, 0.6),
    'entity.item.pickup': sound('entity.item.pickup', 1, pop),
    'entity.player.hurt': hurt,
    'entity.player.death': sound('entity.player.death', 2, (c) => grunt(c, true)),
    'entity.generic.eat': sound('entity.generic.eat', 3, eat),
    'entity.player.burp': sound('entity.player.burp', 1, burp),
    'entity.generic.drink': sound('entity.generic.drink', 1, drink),
    'entity.generic.splash': sound('entity.generic.splash', 1, (c) => splash(c, false)),
    'entity.player.splash': sound('entity.player.splash', 2, (c) => splash(c, true)),
    'entity.player.splash.high_speed': sound('entity.player.splash.high_speed', 2, heavySplash),
    'entity.hostile.splash': sound('entity.hostile.splash', 1, (c) => splash(c, false)),
    'entity.player.swim': sound('entity.player.swim', 4, swim),
    'entity.player.big_fall': sound('entity.player.big_fall', 1, (c) => fall(c, true)),
    'entity.player.small_fall': sound('entity.player.small_fall', 1, (c) => fall(c, false)),
    'entity.player.attack.strong': sound('entity.player.attack.strong', 4, attackStrong),
    'entity.player.attack.weak': sound('entity.player.attack.weak', 4, attackWeak),
    'entity.player.attack.sweep': sound('entity.player.attack.sweep', 4, attackSweep),
    'entity.player.attack.crit': sound('entity.player.attack.crit', 3, attackCrit),
    'entity.player.attack.nodamage': sound('entity.player.attack.nodamage', 4, attackNoDamage),
    'entity.experience_orb.pickup': sound('entity.experience_orb.pickup', 1, orb),
    'entity.player.levelup': sound('entity.player.levelup', 1, levelUp),
    'entity.generic.explode': sound('entity.generic.explode', 4, explode, { hp: 28 }),
    'entity.arrow.shoot': bow,
    'entity.arrow.hit': sound('entity.arrow.hit', 4, arrowHit),
    'item.bucket.fill': sound('item.bucket.fill', 3, (c) => bucketFill(c, false)),
    'item.bucket.empty': sound('item.bucket.empty', 3, (c) => bucketEmpty(c, false)),
    'item.bucket.fill_lava': sound('item.bucket.fill_lava', 3, (c) => bucketFill(c, true)),
    'item.bucket.empty_lava': sound('item.bucket.empty_lava', 3, (c) => bucketEmpty(c, true)),
    'item.flintandsteel.use': sound('item.flintandsteel.use', 3, flintStrike),
    'item.firecharge.use': sound('item.firecharge.use', 3, fireChargeUse),
    'entity.player.attack.knockback': sound('entity.player.attack.knockback', 4, attackKnockback),
    'entity.player.hurt_on_fire': sound('entity.player.hurt_on_fire', 3, (c) => hurtSpecial(c, 'fire')),
    'entity.player.hurt_drown': sound('entity.player.hurt_drown', 4, (c) => hurtSpecial(c, 'drown')),
    'entity.player.hurt_freeze': sound('entity.player.hurt_freeze', 5, (c) => hurtSpecial(c, 'freeze')),
    'entity.player.hurt_sweet_berry_bush': sound('entity.player.hurt_sweet_berry_bush', 2, (c) => hurtSpecial(c, 'berry')),
    'entity.cow.milk': sound('entity.cow.milk', 3, cowMilk),
    'item.dye.use': sound('item.dye.use', 2, dyeUse),
    'entity.item.break': sound('entity.item.break', 1, itemBreak),
    'item.hoe.till': sound('item.hoe.till', 4, hoeTill),
    'item.axe.strip': sound('item.axe.strip', 4, axeStrip),
    'item.bone_meal.use': sound('item.bone_meal.use', 5, boneMeal),
  };
}


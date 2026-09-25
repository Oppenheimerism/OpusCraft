// The outer End's sounds: a chorus flower growing (vanilla block.chorus_flower.grow, four takes) and dying
// (block.chorus_flower.death, three takes); a shulker box opening and shutting (block.shulker_box.open, .close). (Chorus fruit teleports with the enderman's portal samples, as in
// vanilla's sounds.json: soundManager's aliases.)
// The shulker (entity.shulker.*): a small, breathy, questioning voice inside a hollow shell — its mutters, its squeak
// when hurt and its wail as it dies — the shell's own knock when it's struck shut, the lid lifting and clapping to,
// and the whoosh of a bullet fired; the bullet bursting on a block (entity.shulker_bullet.hit) and breaking when it's
// struck (.hurt). Its teleport is the enderman's (soundManager's aliases, as vanilla's sounds.json has it).

import type { SoundGen } from '../synth';
import { TAU, addOsc, alloc, envAD, envBump, layer, type Rng } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, bubble, creak, impact, phisem, sweep, thump } from './texture';
import { voice, vowelGlide } from './voice';
import { reverbHalf } from './world';
import { frameSounds } from './frames';
import { elytraSounds } from './elytra';
import { fireworkSounds } from './fireworks';

/**
 * A flower growing: a soft wet pop as it swells, a hollow rising "bloop" with a woody knock under it, and a faint
 * glassy shimmer of the End over the top.
 */
function flowerGrow(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const L = 0.8;
  const out = alloc(L, sr);
  const f0 = [260, 300, 235, 280][v % 4] * rng.range(0.96, 1.04);
  // the bloop: a rounded tone gliding up an octave and a bit
  layer(out, 1, (b) => {
    for (const [m, g] of [[1, 1], [2, 0.28], [3.01, 0.08]] as const)
      addOsc(b, sr, 0.01, 0.42, (t) => f0 * m * (1 + 1.25 * (1 - Math.exp(-t / 0.07))), (t) => g * envBump(t, 0.02, 0.3));
  });
  // the pop of it swelling
  layer(out, 0.45, (b) => {
    bubble(b, sr, 0.004, f0 * 3.2, 1, 0.018, 0.5);
    bubble(b, sr, 0.03 + rng.range(0, 0.03), f0 * 4.4, 0.6, 0.012, 0.6);
  });
  layer(out, 0.35, (b) => thump(b, sr, { f0: 190, f1: 120, glide: 0.03, tau: 0.045, attack: 0.002, h2: 0.25 }));
  layer(out, 0.22, (b) => burst(b, sr, rng, { dur: 0.08, attack: 0.004, tau: 0.02, bp: [1400, 0.9] }));
  // the shimmer
  layer(out, 0.12, (b) => {
    const root = [1318.5, 1479.98, 1174.66, 1396.91][v % 4];
    const ph = rng.range(0, TAU);
    for (const [m, g] of [[1, 1], [1.5, 0.5]] as const) addOsc(b, sr, 0.05, L - 0.08, (t) => root * m * (1 + 0.004 * Math.sin(TAU * 6 * t + ph)), (t) => g * envBump(t, 0.06, 0.55));
  });
  return reverbHalf(out, sr, { t60: 0.6, hf: 0.5, wet: 0.3, dry: 1, tail: 0.35, pre: 0.01 });
}

/**
 * A flower dying: a dry, papery crackle as it withers, over a hollow tone sinking away, and a soft dull thud.
 */
function flowerDeath(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const L = 0.9;
  const out = alloc(L, sr);
  const f0 = [420, 380, 460][v % 3] * rng.range(0.96, 1.04);
  layer(out, 0.9, (b) => {
    for (const [m, g] of [[1, 1], [1.98, 0.35], [2.97, 0.12]] as const)
      addOsc(b, sr, 0.005, 0.6, (t) => f0 * m * Math.pow(0.42, Math.min(1, t / 0.5)), (t) => g * envAD(t, 0.012, 0.16));
  });
  layer(out, 0.6, (b) =>
    phisem(b, sr, rng, {
      dur: 0.55,
      rate: 900,
      energy: (t) => envAD(t, 0.01, 0.14),
      grain: 0.0012,
      heavy: 3,
      bands: [{ f: 2600, q: 1.4, g: 1, spread: 0.3 }, { f: 5200, q: 1.8, g: 0.5, spread: 0.25 }, { f: 1300, q: 1.1, g: 0.4, spread: 0.2 }],
    }),
  );
  layer(out, 0.4, (b) => thump(b, sr, { f0: 150, f1: 85, glide: 0.04, tau: 0.06, attack: 0.002 }));
  layer(out, 0.3, (b) =>
    sweep(b, sr, rng, {
      t: 0.01,
      dur: 0.5,
      f: (t) => 2200 * Math.pow(500 / 2200, Math.min(1, t / 0.45)),
      q: 1.6,
      amp: (t) => envAD(t, 0.02, 0.12),
      color: 'pink',
    }),
  );
  return reverbHalf(out, sr, { t60: 0.55, hf: 0.45, wet: 0.28, dry: 1, tail: 0.3, pre: 0.01 });
}

/** a shulker's shell: hollow, a little glassy (its body's ring, [f, amp, t60]) */
const SHELL = [230, 1, 0.16, 520, 0.7, 0.11, 890, 0.45, 0.08, 1480, 0.25, 0.05, 2350, 0.12, 0.03];

/**
 * A shulker box opening: the lid comes unstuck from the rim with a soft hollow knock, and slides up and round with a
 * breathy rising hiss over the shell's ring.
 */
function boxOpen(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: SHELL, jitter: 0.03, noise: 0.6, noiseTau: 0.004, noiseBp: [900, 0.8] }));
  layer(out, 0.45, (b) => thump(b, sr, { f0: 170, f1: 120, glide: 0.02, tau: 0.035, h2: 0.3 }));
  layer(out, 0.5, (b) =>
    sweep(b, sr, rng, {
      t: 0.03,
      dur: 0.42,
      f: (t) => 700 * Math.pow(2600 / 700, Math.min(1, t / 0.36)),
      q: 2.2,
      amp: (t) => envBump(t, 0.12, 0.28),
      color: 'pink',
    }),
  );
  layer(out, 0.3, (b) => impact(b, sr, rng, { t: 0.36, modes: SHELL.map((v, i) => (i % 3 === 0 ? v * 1.12 : v)), jitter: 0.03, noise: 0.3, noiseTau: 0.003, noiseBp: [1500, 0.8] }));
  return reverbHalf(out, sr, { t60: 0.45, hf: 0.5, wet: 0.2, dry: 1, tail: 0.25, pre: 0.008 });
}

/** A shulker box shutting: the lid sliding down and round, then seating on the rim with a firm hollow clunk. */
function boxClose(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  const hit = 0.3;
  layer(out, 0.4, (b) =>
    sweep(b, sr, rng, {
      dur: hit + 0.02,
      f: (t) => 2200 * Math.pow(600 / 2200, Math.min(1, t / hit)),
      q: 2,
      amp: (t) => envBump(t, 0.1, hit - 0.08),
      color: 'pink',
    }),
  );
  layer(out, 1, (b) => impact(b, sr, rng, { t: hit, modes: SHELL.map((v, i) => (i % 3 === 0 ? v * 0.9 : v)), jitter: 0.03, noise: 0.8, noiseTau: 0.005, noiseBp: [700, 0.8] }));
  layer(out, 0.6, (b) => thump(b, sr, { t: hit, f0: 150, f1: 95, glide: 0.025, tau: 0.05, h2: 0.3 }));
  layer(out, 0.2, (b) => burst(b, sr, rng, { t: hit, dur: 0.06, attack: 0.002, tau: 0.012, bp: [2400, 1] }));
  return reverbHalf(out, sr, { t60: 0.45, hf: 0.5, wet: 0.2, dry: 1, tail: 0.25, pre: 0.008 });
}

// ------------------------------------------------------------------ the shulker

const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** the hollow of its shell round a voice: a short, dense, dark little room */
function inShell(b: Float32Array, sr: number): Float32Array {
  return reverbHalf(b, sr, { t60: 0.22, hf: 0.35, wet: 0.35, dry: 1, tail: 0.15, pre: 0.004 });
}

/**
 * one small breathy syllable: f0 gliding from f to f·bend (a rise asks, a fall answers), the mouth moving between two
 * vowels, sized for a small creature (formants raised by `size`)
 */
function syllable(b: Float32Array, sr: number, rng: Rng, t: number, d: number, f: number, bend: number, amp: number, size: number, from: string, to: string, breath = 0.35): void {
  const F = vowelGlide(from, to, d * 0.15, d * 0.85, size);
  const turn = rng.range(0.35, 0.65) * 0.4;
  voice(b, sr, rng, {
    t,
    dur: d,
    f0: (u) => f * (1 + (bend - 1) * smooth((u / d - turn) / (1 - turn))),
    amp: (u) => amp * envBump(u, d * 0.25, d * 0.75),
    formants: [
      { f: F[0], bw: 110, g: 1 },
      { f: F[1], bw: 160, g: 0.6 },
      { f: F[2], bw: 260, g: 0.2 },
    ],
    vib: [rng.range(7, 11), 0.02],
    jitter: 0.02,
    shimmer: 0.08,
    breath,
    oq: 0.7,
  });
}

/**
 * vanilla mob/shulker/ambient1-7: a mutter from inside the shell — one or two soft, breathy, creaky little syllables,
 * now asking, now grumbling
 */
function shulkerAmbient(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(1.1, sr);
  const f = [420, 470, 380, 520, 440, 400, 490][v % 7] * rng.range(0.95, 1.05);
  const n = v % 3 === 0 ? 2 : 1;
  let t = 0.01;
  const syl: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const d = rng.range(0.22, 0.38);
    syl.push([t, d]);
    t += d + rng.range(0.04, 0.1);
  }
  layer(out, 1, (b) => {
    syl.forEach(([t0, d], k) => {
      const asks = (v + k) % 2 === 0;
      const bend = asks ? rng.range(1.18, 1.35) : rng.range(0.72, 0.85);
      syllable(b, sr, rng, t0, d, f * (k ? 1.08 : 1), bend, 1, rng.range(1.3, 1.5), rng.pick(['u', 'oo', 'm']), rng.pick(asks ? ['ih', 'e', 'i'] : ['uh', 'aw', 'o']));
    });
  });
  // the creak of it shifting in the shell
  const rate = rng.range(55, 75);
  layer(out, 0.35, (b) =>
    creak(b, sr, rng, {
      t: syl[0][0] + 0.02,
      dur: t - syl[0][0],
      rate: (u) => rate * (1 + 0.3 * Math.sin(TAU * 3 * u)),
      amp: (u) => envBump(u, 0.06, t * 0.8),
      jitter: 0.2,
      bands: [{ f: 620, q: 5, g: 1 }, { f: 1150, q: 6, g: 0.6 }, { f: 2300, q: 7, g: 0.25 }],
    }),
  );
  return inShell(out, sr);
}

/** vanilla mob/shulker/hurt1-4: a sharp little squeak, up and away */
function shulkerHurt(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.45, sr);
  const f = [760, 820, 700, 880][v % 4] * rng.range(0.96, 1.04);
  const d = rng.range(0.2, 0.28);
  layer(out, 1, (b) => {
    const F = vowelGlide('i', rng.pick(['e', 'ih']), 0, d, 1.45);
    voice(b, sr, rng, {
      dur: d,
      f0: (u) => f * (u < d * 0.3 ? 1 + 0.25 * smooth(u / (d * 0.3)) : 1.25 - 0.45 * smooth((u - d * 0.3) / (d * 0.7))),
      amp: (u) => envAD(u, 0.012, d * 0.45),
      formants: [
        { f: F[0], bw: 120, g: 0.8 },
        { f: F[1], bw: 180, g: 1 },
        { f: F[2], bw: 280, g: 0.35 },
      ],
      jitter: 0.03,
      shimmer: 0.1,
      breath: 0.25,
      rough: 0.2,
      oq: 0.55,
    });
  });
  layer(out, 0.3, (b) => impact(b, sr, rng, { modes: SHELL, jitter: 0.04, noise: 0.5, noiseTau: 0.003, noiseBp: [1200, 0.8] }));
  return inShell(out, sr);
}

/** vanilla mob/shulker/hurt_closed1-5: struck while shut — a hard, hollow knock on the shell */
function shulkerHurtClosed(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.4, sr);
  const k = [1, 1.08, 0.93, 1.15, 0.88][v % 5];
  const modes = [300, 1, 0.12, 745, 0.85, 0.09, 1260, 0.6, 0.06, 2080, 0.35, 0.04, 3150, 0.2, 0.025].map((x, i) => (i % 3 === 0 ? x * k : x));
  layer(out, 1, (b) => impact(b, sr, rng, { modes, jitter: 0.04, noise: 1, noiseTau: 0.0025, noiseBp: [2600, 0.8] }));
  layer(out, 0.55, (b) => thump(b, sr, { f0: 210 * k, f1: 150 * k, glide: 0.015, tau: 0.03, h2: 0.3 }));
  return reverbHalf(out, sr, { t60: 0.3, hf: 0.5, wet: 0.15, dry: 1, tail: 0.15, pre: 0.006 });
}

/** vanilla mob/shulker/death1-4: a thin wail sinking away inside the shell, and the shell settling */
function shulkerDeath(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(1.2, sr);
  const f = [880, 820, 940, 780][v % 4] * rng.range(0.96, 1.04);
  const d = rng.range(0.7, 0.85);
  layer(out, 1, (b) => {
    const F = vowelGlide('i', rng.pick(['u', 'oo']), d * 0.1, d * 0.9, 1.4);
    voice(b, sr, rng, {
      dur: d,
      f0: (u) => f * (u < d * 0.15 ? 1 + 0.1 * smooth(u / (d * 0.15)) : 1.1 * Math.pow(0.36, smooth((u - d * 0.15) / (d * 0.85)))),
      amp: (u) => envBump(u, 0.04, d * 0.95),
      formants: [
        { f: F[0], bw: 120, g: 0.9 },
        { f: F[1], bw: 170, g: 1 },
        { f: F[2], bw: 280, g: 0.3 },
      ],
      vib: [rng.range(6, 8), 0.035],
      jitter: 0.03,
      shimmer: 0.12,
      breath: 0.3,
      rough: 0.25,
      oq: 0.6,
    });
  });
  layer(out, 0.4, (b) => impact(b, sr, rng, { t: d * 0.9, modes: SHELL.map((x, i) => (i % 3 === 0 ? x * 0.85 : x)), jitter: 0.03, noise: 0.6, noiseTau: 0.005, noiseBp: [700, 0.8] }));
  layer(out, 0.3, (b) => thump(b, sr, { t: d * 0.9, f0: 140, f1: 90, glide: 0.03, tau: 0.06 }));
  return inShell(out, sr);
}

/** vanilla mob/shulker/open1-5: the lid lifting off — a soft wet unsticking, a breath of air, the shell's ring */
function shulkerOpen(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.55, sr);
  const k = [1, 1.06, 0.95, 1.1, 0.9][v % 5];
  layer(out, 0.7, (b) => {
    bubble(b, sr, 0.005, 900 * k, 1, 0.012, 0.6);
    bubble(b, sr, 0.03 + rng.range(0, 0.02), 1300 * k, 0.6, 0.009, 0.7);
  });
  layer(out, 0.6, (b) =>
    sweep(b, sr, rng, {
      t: 0.02,
      dur: 0.3,
      f: (t) => 600 * k * Math.pow(3.5, Math.min(1, t / 0.25)),
      q: 2,
      amp: (t) => envBump(t, 0.08, 0.2),
      color: 'pink',
    }),
  );
  layer(out, 0.55, (b) => impact(b, sr, rng, { t: 0.015, modes: SHELL.map((x, i) => (i % 3 === 0 ? x * k * 1.1 : x)), jitter: 0.04, noise: 0.4, noiseTau: 0.003, noiseBp: [1000, 0.8] }));
  return reverbHalf(out, sr, { t60: 0.3, hf: 0.5, wet: 0.18, dry: 1, tail: 0.15, pre: 0.006 });
}

/** vanilla mob/shulker/close1-5: the lid clapping shut — a quick slide and a hollow clunk */
function shulkerClose(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.5, sr);
  const k = [1, 0.94, 1.07, 0.9, 1.12][v % 5];
  const hit = rng.range(0.07, 0.1);
  layer(out, 0.35, (b) =>
    sweep(b, sr, rng, {
      dur: hit + 0.01,
      f: (t) => 2400 * k * Math.pow(0.4, Math.min(1, t / hit)),
      q: 2,
      amp: (t) => envBump(t, hit * 0.4, hit * 0.6),
      color: 'pink',
    }),
  );
  layer(out, 1, (b) => impact(b, sr, rng, { t: hit, modes: SHELL.map((x, i) => (i % 3 === 0 ? x * k : x)), jitter: 0.03, noise: 0.9, noiseTau: 0.004, noiseBp: [800, 0.8] }));
  layer(out, 0.6, (b) => thump(b, sr, { t: hit, f0: 170 * k, f1: 105 * k, glide: 0.02, tau: 0.04, h2: 0.3 }));
  layer(out, 0.25, (b) => bubble(b, sr, hit + 0.004, 700 * k, 1, 0.01, 0.4));
  return reverbHalf(out, sr, { t60: 0.3, hf: 0.5, wet: 0.18, dry: 1, tail: 0.15, pre: 0.006 });
}

/** vanilla mob/shulker/shoot1-4: a bullet flung out — a rising rush of air round a bright falling "pew" and a glitter */
function shulkerShoot(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.7, sr);
  const k = [1, 1.07, 0.94, 1.12][v % 4] * rng.range(0.97, 1.03);
  layer(out, 1, (b) =>
    sweep(b, sr, rng, {
      dur: 0.5,
      f: (t) => 500 * k * Math.pow(7, Math.min(1, t / 0.14)) * (t > 0.14 ? Math.pow(0.7, (t - 0.14) / 0.3) : 1),
      q: 1.6,
      amp: (t) => envAD(t, 0.03, 0.12),
      color: 'pink',
    }),
  );
  layer(out, 0.7, (b) => {
    for (const [m, g] of [[1, 1], [2, 0.3], [3, 0.1]] as const) addOsc(b, sr, 0.01, 0.3, (t) => m * 1500 * k * Math.pow(0.35, Math.min(1, t / 0.22)), (t) => g * envAD(t, 0.006, 0.07));
  });
  layer(out, 0.3, (b) => {
    let t0 = 0.03;
    for (let i = 0; i < 5; i++) {
      const f = rng.range(3200, 5600);
      addOsc(b, sr, t0, 0.08, () => f, (t) => envAD(t, 0.002, 0.02));
      t0 += rng.range(0.03, 0.06);
    }
  });
  layer(out, 0.35, (b) => thump(b, sr, { f0: 260 * k, f1: 140 * k, glide: 0.02, tau: 0.03 }));
  return reverbHalf(out, sr, { t60: 0.45, hf: 0.6, wet: 0.22, dry: 1, tail: 0.2, pre: 0.008 });
}

/** vanilla mob/shulker/bullet/hit1-4: the bullet bursting against a block — a soft puff and a fizz of sparks */
function bulletHit(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.6, sr);
  const k = [1, 1.1, 0.92, 1.05][v % 4];
  layer(out, 1, (b) => burst(b, sr, rng, { dur: 0.25, attack: 0.002, tau: 0.045, bp: [900 * k, 0.7] }));
  layer(out, 0.6, (b) => thump(b, sr, { f0: 200 * k, f1: 90, glide: 0.02, tau: 0.035 }));
  layer(out, 0.45, (b) =>
    phisem(b, sr, rng, {
      t: 0.01,
      dur: 0.4,
      rate: 700,
      energy: (t) => envAD(t, 0.005, 0.09),
      grain: 0.0008,
      heavy: 3,
      bands: [{ f: 4200 * k, q: 2, g: 1, spread: 0.3 }, { f: 2500 * k, q: 1.6, g: 0.5, spread: 0.3 }],
    }),
  );
  return reverbHalf(out, sr, { t60: 0.4, hf: 0.5, wet: 0.2, dry: 1, tail: 0.2, pre: 0.008 });
}

/** vanilla mob/shulker/bullet/break1-4: the bullet struck and shattering — a glassy crack and a spray of glitter */
function bulletBreak(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const out = alloc(0.5, sr);
  const k = [1, 1.09, 0.93, 1.16][v % 4];
  const modes = [2150, 1, 0.05, 3380, 0.8, 0.04, 4700, 0.6, 0.03, 6100, 0.4, 0.02].map((x, i) => (i % 3 === 0 ? x * k : x));
  layer(out, 1, (b) => impact(b, sr, rng, { modes, jitter: 0.05, noise: 0.8, noiseTau: 0.002, noiseBp: [5000, 0.9] }));
  layer(out, 0.55, (b) =>
    phisem(b, sr, rng, {
      t: 0.005,
      dur: 0.3,
      rate: 900,
      energy: (t) => envAD(t, 0.003, 0.06),
      grain: 0.0006,
      heavy: 3,
      bands: [{ f: 5500 * k, q: 2.5, g: 1, spread: 0.25 }, { f: 3500 * k, q: 2, g: 0.6, spread: 0.25 }],
    }),
  );
  return reverbHalf(out, sr, { t60: 0.35, hf: 0.6, wet: 0.18, dry: 1, tail: 0.15, pre: 0.006 });
}

export function outerEndSounds(): Record<string, SoundGen> {
  return {
    'block.chorus_flower.grow': sound('block.chorus_flower.grow', 4, flowerGrow, { fadeOut: 0.15 }),
    'block.chorus_flower.death': sound('block.chorus_flower.death', 3, flowerDeath, { fadeOut: 0.15 }),
    'block.shulker_box.open': sound('block.shulker_box.open', 1, boxOpen, { fadeOut: 0.1 }),
    'block.shulker_box.close': sound('block.shulker_box.close', 1, boxClose, { fadeOut: 0.1 }),
    // (the takes as in vanilla's sounds.json)
    'entity.shulker.ambient': sound('entity.shulker.ambient', 7, shulkerAmbient, { fadeOut: 0.12 }),
    'entity.shulker.hurt': sound('entity.shulker.hurt', 4, shulkerHurt, { fadeOut: 0.08 }),
    'entity.shulker.hurt_closed': sound('entity.shulker.hurt_closed', 5, shulkerHurtClosed, { fadeOut: 0.08 }),
    'entity.shulker.death': sound('entity.shulker.death', 4, shulkerDeath, { fadeOut: 0.15 }),
    'entity.shulker.open': sound('entity.shulker.open', 5, shulkerOpen, { fadeOut: 0.08 }),
    'entity.shulker.close': sound('entity.shulker.close', 5, shulkerClose, { fadeOut: 0.08 }),
    'entity.shulker.shoot': sound('entity.shulker.shoot', 4, shulkerShoot, { fadeOut: 0.1 }),
    'entity.shulker_bullet.hit': sound('entity.shulker_bullet.hit', 4, bulletHit, { fadeOut: 0.1 }),
    'entity.shulker_bullet.hurt': sound('entity.shulker_bullet.hurt', 4, bulletBreak, { fadeOut: 0.08 }),
    // (item frames: the end ship hangs its elytra in one)
    ...frameSounds(),
    // (the elytra: the end ship's treasure)
    ...elytraSounds(),
    // (and the rockets that boost it)
    ...fireworkSounds(),
  };
}

// The warden's voice (vanilla sounds.json entity.warden.*): something vast and blind in the dark, a slow rattling
// throat far below a man's, with bone clicking in it, heard as if down a long cave. Its answers to a shrieker's
// warnings (vanilla SculkShriekerBlockEntity.SOUND_BY_LEVEL): nearby_close from far off, nearby_closer nearer,
// nearby_closest right there, and listening_angry, the fourth warning's, when it's coming. And (M4) the warden's own:
// its breathing as it grows calm, agitated or angry, its listening, its heart, its sniffing, its roar, clawing up
// out of the ground and digging back into it, the sonic boom and its charging, its blow, its hurt and its death, its
// tread, and its tendrils' clicking.

import type { SoundGen } from '../synth';
import { TAU, alloc, addOsc, envExpPts, envPts, layer, lowpass, reverb, softClip } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, impact, phisem, sweep, thump, ticks } from './texture';
import { voice } from './voice';

/**
 * the warden's growl at `t`, `d` seconds long: a huge, rough, period-doubled throat through dark formants; `f0` its
 * pitch over the growl (0..1), `open` how far its jaw opens (brighter, hungrier)
 */
function growl(b: Float32Array, c: Ctx, t: number, d: number, f0: (u: number) => number, open: number, gain = 1): void {
  const { sr, rng } = c;
  voice(b, sr, rng, {
    t,
    dur: d,
    f0: (x) => f0(x / d),
    amp: (x) => envPts(x / d, [0, 0, 0.16, 0.85, 0.45, 1, 0.78, 0.65, 1, 0]),
    formants: [
      { f: (x) => 240 + 150 * open * Math.sin((Math.PI * x) / d), bw: 110, g: 1 },
      { f: 600 + 260 * open, bw: 160, g: 0.55 },
      { f: 1450 + 450 * open, bw: 260, g: 0.22 * (0.5 + open) },
      { f: 2700, bw: 520, g: 0.05 * open },
    ],
    jitter: 0.08,
    shimmer: 0.3,
    rough: 0.7,
    sub: 0.25,
    breath: 0.4,
    oq: 0.45,
    growl: [rng.range(13, 21), 0.55],
    gain,
  });
}

/** the bone in its throat: slow, dry clicks rattling through the growl */
function rattle(b: Float32Array, c: Ctx, t: number, d: number, rate: number): void {
  ticks(b, c.sr, c.rng, { t, dur: d, rate, energy: (x) => envPts(x / d, [0, 0.3, 0.3, 1, 0.8, 0.8, 1, 0]), f: [520, 1400], t60: [0.01, 0.035], click: 0.6, heavy: 0.5 });
}

/** a rumble under it all, felt more than heard */
function rumble(b: Float32Array, c: Ctx, t: number, d: number, f: number): void {
  addOsc(b, c.sr, t, d, (x) => f * (1 + 0.04 * Math.sin(x * 9)), (x) => envPts(x / d, [0, 0, 0.3, 1, 0.8, 0.8, 1, 0]));
}

/**
 * vanilla entity.warden.nearby_close / nearby_closer / nearby_closest: its answer to a warning, from far off (muffled,
 * mostly the cave's echo) to right there (the whole throat, and the rattle in it); `near` 0, 1 or 2
 */
function nearby(c: Ctx, near: number): Float32Array {
  const { sr, rng } = c;
  const d = [2.1, 1.9, 1.7][near] * rng.range(0.9, 1.1);
  const out = alloc(d + 0.2, sr);
  const base = rng.range(38, 50) * (1 + near * 0.08);
  const peak = rng.range(1.35, 1.7);
  // (a breath drawn in, then the long growl out, sagging at its end)
  layer(out, 0.35 + near * 0.1, (b) => sweep(b, sr, rng, { dur: 0.5, f: (x) => 500 + 900 * x, q: 1.4, amp: (x) => envPts(x, [0, 0, 0.35, 1, 0.5, 0]), color: 'pink' }));
  layer(out, 1, (b) => growl(b, c, 0.25, d - 0.25, (u) => base * envPts(u, [0, 0.85, 0.3, peak, 0.7, peak * 0.9, 1, 0.7]), 0.25 + near * 0.35));
  layer(out, 0.4 + near * 0.2, (b) => rumble(b, c, 0.2, d - 0.2, base * 0.75));
  if (near > 0) layer(out, 0.25 * near, (b) => rattle(b, c, 0.4, d - 0.6, 10 + near * 6));
  // (from further off the high end is lost to the rock between)
  const heard = lowpass(out, [700, 1400, 3200][near], sr);
  return reverb(heard, sr, { t60: [3.2, 2.6, 2.0][near], wet: [0.9, 0.65, 0.45][near], pre: 0.04, lowcut: 90, size: 1.6 });
}

/** vanilla entity.warden.listening_angry: it has heard, and it's angry: a snarling inhale, the rattle quickening */
function listeningAngry(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.3, 1.6);
  const out = alloc(d + 0.2, sr);
  const base = rng.range(52, 62);
  layer(out, 0.5, (b) => sweep(b, sr, rng, { dur: d * 0.6, f: (x) => 400 + 1600 * (x / (d * 0.6)), q: 2, amp: (x) => envPts(x / (d * 0.6), [0, 0, 0.5, 1, 1, 0.2]), color: 'pink' }));
  layer(out, 1, (b) => growl(b, c, 0.1, d - 0.1, (u) => base * envPts(u, [0, 0.9, 0.4, 1.5, 0.8, 1.9, 1, 1.4]), 0.9));
  layer(out, 0.55, (b) => rattle(b, c, 0.05, d, 26));
  layer(out, 0.45, (b) => rumble(b, c, 0, d, base * 0.7));
  return reverb(out, sr, { t60: 1.8, wet: 0.4, pre: 0.02, lowcut: 90, size: 1.4 });
}

/** a breath drawn in through something wet, `d` seconds from `t`, its hiss rising from `f0` to `f1` */
function inhale(b: Float32Array, c: Ctx, t: number, d: number, f0: number, f1: number, q = 1.4): void {
  sweep(b, c.sr, c.rng, { t, dur: d, f: (x) => f0 + (f1 - f0) * (x / d), q, amp: (x) => envPts(x / d, [0, 0, 0.4, 1, 0.9, 0.8, 1, 0]), color: 'pink' });
}

/** `b` through a low-pass whose cutoff follows `fc` (its hearing dulled as it sinks into the ground) */
function muffle(b: Float32Array, sr: number, fc: (t: number) => number): Float32Array {
  let y = 0, a = 0;
  for (let i = 0; i < b.length; i++) {
    if ((i & 31) === 0) a = 1 - Math.exp((-TAU * fc(i / sr)) / sr);
    y += a * (b[i] - y);
    b[i] = y;
  }
  return b;
}

/** soil and stone shifting and pouring away, as `energy` says (0..1) */
function crumble(b: Float32Array, c: Ctx, t: number, d: number, energy: (x: number) => number, rate = 500): void {
  phisem(b, c.sr, c.rng, {
    t,
    dur: d,
    rate,
    energy,
    grain: 0.004,
    heavy: 2.5,
    bands: [
      { f: 380, q: 1.6, g: 1, spread: 0.3 },
      { f: 900, q: 2, g: 0.7, spread: 0.35 },
      { f: 2100, q: 2.2, g: 0.3, spread: 0.3 },
    ],
  });
}

/** vanilla entity.warden.ambient: its breathing when all's quiet: a long breath in, let out as a low moan, the rattle idling */
function ambient(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(2.4, 3.4);
  const out = alloc(d + 0.3, sr);
  const base = rng.range(32, 42);
  const inT = d * rng.range(0.3, 0.4);
  layer(out, 0.4, (b) => inhale(b, c, 0, inT, 260, 780, 1.3));
  layer(out, 1, (b) => growl(b, c, inT - 0.05, d - inT, (u) => base * envPts(u, [0, 0.95, 0.35, 1.12, 1, 0.78]), 0.1));
  layer(out, 0.28, (b) => rattle(b, c, inT, d - inT, 7));
  layer(out, 0.4, (b) => rumble(b, c, inT, d - inT, base * 0.7));
  return reverb(lowpass(out, 2400, sr), sr, { t60: 2.4, wet: 0.5, pre: 0.03, lowcut: 80, size: 1.5 });
}

/** vanilla entity.warden.agitated: stirred up: a sharp breath, a growl climbing and falling twice, the rattle quicker */
function agitated(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.8, 2.5);
  const out = alloc(d + 0.3, sr);
  const base = rng.range(40, 50);
  layer(out, 0.45, (b) => inhale(b, c, 0, 0.35, 350, 1300, 1.8));
  layer(out, 1, (b) => growl(b, c, 0.3, d - 0.3, (u) => base * envPts(u, [0, 0.9, 0.25, 1.35, 0.5, 1.05, 0.75, 1.4, 1, 0.9]), 0.5));
  layer(out, 0.45, (b) => rattle(b, c, 0.3, d - 0.3, 16));
  layer(out, 0.4, (b) => rumble(b, c, 0.3, d - 0.3, base * 0.7));
  return reverb(out, sr, { t60: 2.0, wet: 0.42, pre: 0.025, lowcut: 85, size: 1.4 });
}

/** vanilla entity.warden.angry: a snarl: a quick breath, then a hard growl with its jaw wide, the rattle racing */
function angry(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(1.6, 2.2);
  const out = alloc(d + 0.3, sr);
  const base = rng.range(50, 60);
  layer(out, 0.5, (b) => inhale(b, c, 0, 0.2, 500, 1900, 2.2));
  layer(out, 1, (b) => growl(b, c, 0.15, d - 0.15, (u) => base * envPts(u, [0, 1.1, 0.2, 1.8, 0.55, 1.5, 0.8, 1.7, 1, 1.1]), 1));
  layer(out, 0.55, (b) => rattle(b, c, 0.15, d - 0.15, 30));
  layer(out, 0.45, (b) => rumble(b, c, 0.1, d - 0.1, base * 0.65));
  return reverb(softClip(out, 1.6), sr, { t60: 1.8, wet: 0.38, pre: 0.02, lowcut: 90, size: 1.4 });
}

/** vanilla entity.warden.listening: it has heard something: the rattle stirring, then a low grunt rising at its end, as if asking */
function listening(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.9, 1.2);
  const out = alloc(d + 0.3, sr);
  const base = rng.range(44, 52);
  layer(out, 0.5, (b) => rattle(b, c, 0, 0.5, 22));
  layer(out, 1, (b) => growl(b, c, 0.15, d - 0.15, (u) => base * envPts(u, [0, 0.9, 0.6, 1, 1, 1.45]), 0.35));
  layer(out, 0.35, (b) => rumble(b, c, 0.15, d - 0.15, base * 0.7));
  return reverb(out, sr, { t60: 1.6, wet: 0.4, pre: 0.02, lowcut: 85, size: 1.3 });
}

/** vanilla entity.warden.heartbeat: its heart: a deep double thud, felt as much as heard */
function heartbeat(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  const f = rng.range(46, 56);
  const dub = rng.range(0.2, 0.25);
  layer(out, 1, (b) => {
    thump(b, sr, { t: 0.01, f0: f * 1.7, f1: f, glide: 0.02, tau: 0.075, h2: 0.3 });
    thump(b, sr, { t: 0.01 + dub, f0: f * 1.5, f1: f * 0.9, glide: 0.02, tau: 0.065, h2: 0.25, amp: 0.7 });
  });
  layer(out, 0.3, (b) => {
    burst(b, sr, rng, { t: 0.01, dur: 0.2, tau: 0.045, lp: 220, color: 'brown' });
    burst(b, sr, rng, { t: 0.01 + dub, dur: 0.2, tau: 0.04, lp: 200, color: 'brown', amp: 0.7 });
  });
  return reverb(lowpass(out, 320, sr), sr, { t60: 1, wet: 0.22, pre: 0.01, lowcut: 40, size: 1.2 });
}

/** vanilla entity.warden.sniff: a run of deep, sharp sniffs through something wet, then a low breath out */
function sniff(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const n = 3 + rng.int(2);
  const gap = rng.range(0.22, 0.3);
  const d = n * gap + 0.8;
  const out = alloc(d + 0.2, sr);
  for (let i = 0; i < n; i++) {
    const t = i * gap * rng.range(0.92, 1.08);
    layer(out, 0.9 - i * 0.08, (b) => {
      sweep(b, sr, rng, { t, dur: 0.16, f: (x) => 700 + 1900 * (x / 0.16), q: 2.2, amp: (x) => envPts(x / 0.16, [0, 0, 0.2, 1, 0.7, 0.6, 1, 0]), color: 'pink' });
      burst(b, sr, rng, { t, dur: 0.12, attack: 0.02, tau: 0.04, bp: [240, 2.5], amp: 0.8 });
    });
  }
  const base = rng.range(38, 46);
  layer(out, 0.55, (b) => growl(b, c, n * gap, 0.7, (u) => base * envPts(u, [0, 1, 1, 0.8]), 0.05, 0.6));
  layer(out, 0.3, (b) => sweep(b, sr, rng, { t: n * gap, dur: 0.7, f: (x) => 900 - 500 * (x / 0.7), q: 1, amp: (x) => envPts(x / 0.7, [0, 0, 0.2, 1, 1, 0]), color: 'pink' }));
  return reverb(out, sr, { t60: 1.5, wet: 0.35, pre: 0.02, lowcut: 90, size: 1.3 });
}

/**
 * vanilla entity.warden.roar: its roar: a breath hauled in, then the whole vast throat thrown open and shaking with
 * it, a scream riding over the growl, and a long sagging end
 */
function roar(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(2.8, 3.4);
  const out = alloc(d + 0.4, sr);
  const base = rng.range(46, 56);
  const pre = 0.35;
  const contour = [0, 1, 0.12, 2.1, 0.45, 1.85, 0.7, 1.7, 1, 1];
  layer(out, 0.55, (b) => inhale(b, c, 0, pre, 400, 1800, 1.6));
  layer(out, 1, (b) => growl(b, c, pre - 0.05, d - pre, (u) => base * envPts(u, contour), 1));
  layer(out, 0.45, (b) => growl(b, c, pre, d - pre - 0.15, (u) => base * 2.9 * envPts(u, contour), 0.8));
  layer(out, 0.5, (b) => rattle(b, c, pre, d - pre, 34));
  layer(out, 0.6, (b) => rumble(b, c, pre, d - pre, base * 0.6));
  return reverb(softClip(out, 1.8), sr, { t60: 3, wet: 0.5, pre: 0.03, lowcut: 80, size: 1.8 });
}

/**
 * vanilla entity.warden.emerge: it claws its way up out of the ground: the earth groaning and cracking, soil and stone
 * pouring away, an arm slamming down and then the other as it hauls itself up (in time with its moves), grunts, and a
 * last long growl as it stands
 */
function emerge(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = 6.7;
  const out = alloc(d + 0.4, sr);
  const base = rng.range(40, 48);
  layer(out, 0.55, (b) => burst(b, sr, rng, { dur: d, attack: 0.8, tau: 60, lp: 180, color: 'brown', env: (x) => envPts(x, [0, 0.3, 1.2, 1, 3.5, 0.9, 5.5, 0.5, d, 0]) }));
  layer(out, 0.5, (b) => addOsc(b, sr, 0, d, (x) => 34 + 6 * Math.sin(x * 1.7), (x) => envPts(x, [0, 0, 1, 1, 4, 0.8, d, 0])));
  layer(out, 0.6, (b) => crumble(b, c, 0, d, (x) => envPts(x, [0, 0.15, 0.6, 0.6, 2.6, 1, 4.6, 0.55, d, 0.05])));
  // (the arm slams, in time with the emerging arms)
  for (const [t, k] of [[1.15, 0.8], [1.6, 1], [2.05, 0.9], [2.45, 1], [3.45, 0.7]] as const)
    layer(out, 0.95 * k, (b) => {
      thump(b, sr, { t, f0: 115, f1: 40, glide: 0.03, tau: 0.12, h2: 0.4 });
      burst(b, sr, rng, { t, dur: 0.4, tau: 0.1, lp: 700, color: 'brown', amp: 0.6 });
      crumble(b, c, t, 0.5, (x) => envPts(x, [0, 1, 0.5, 0]), 900);
    });
  // (grunts as it hauls itself up, and the growl as it stands)
  for (const t of [1.55, 2.4, 3.35]) layer(out, 0.55, (b) => growl(b, c, t, 0.5, (u) => base * envPts(u, [0, 1.2, 1, 0.9]), 0.5));
  layer(out, 0.9, (b) => growl(b, c, 4.4, 2.2, (u) => base * envPts(u, [0, 0.9, 0.3, 1.5, 0.7, 1.3, 1, 0.9]), 0.6));
  layer(out, 0.35, (b) => rattle(b, c, 4.4, 2.2, 18));
  return reverb(out, sr, { t60: 2.5, wet: 0.45, pre: 0.03, lowcut: 60, size: 1.6 });
}

/**
 * vanilla entity.warden.dig: it digs back down: its hands tearing at the ground stroke after stroke (in time with its
 * arms), soil and stone falling in over it, a grunt or two, the whole of it muffled as it sinks away
 */
function dig(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = 5;
  const out = alloc(d + 0.4, sr);
  const base = rng.range(40, 48);
  layer(out, 0.5, (b) => crumble(b, c, 0, d, (x) => envPts(x, [0, 0.1, 0.8, 0.6, 3, 1, 4.6, 0.6, d, 0])));
  layer(out, 0.45, (b) => burst(b, sr, rng, { dur: d, attack: 0.6, tau: 60, lp: 160, color: 'brown', env: (x) => envPts(x, [0, 0.2, 1.5, 1, 4.2, 0.8, d, 0]) }));
  // (the strokes, in time with its digging arms)
  for (const t of [0.5, 0.7, 1.3, 1.5, 2.1, 2.35, 3.2, 3.4])
    layer(out, 0.85, (b) => {
      burst(b, sr, rng, { t, dur: 0.28, attack: 0.01, tau: 0.08, bp: [650, 1.1], amp: 1 });
      thump(b, sr, { t, f0: 90, f1: 45, glide: 0.02, tau: 0.07, amp: 0.8 });
      crumble(b, c, t, 0.45, (x) => envPts(x, [0, 1, 0.45, 0]), 1100);
    });
  for (const t of [1, 2.2]) layer(out, 0.5, (b) => growl(b, c, t, 0.45, (u) => base * envPts(u, [0, 1.25, 1, 0.9]), 0.45));
  return reverb(muffle(out, sr, (x) => envExpPts(x, [0, 6000, 2.5, 3000, 4.2, 700, d, 300])), sr, { t60: 2.2, wet: 0.45, pre: 0.03, lowcut: 60, size: 1.5 });
}

/**
 * vanilla entity.warden.sonic_charge: the boom gathering in its chest over the second and a half before it goes: air
 * rushing in, a whine climbing and tightening, its chest drumming faster and faster
 */
function sonicCharge(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = 1.75;
  const out = alloc(d + 0.3, sr);
  const f = rng.range(100, 120);
  layer(out, 0.6, (b) => sweep(b, sr, rng, { dur: d, f: (x) => 200 * Math.pow(12, x / d), q: (x) => 1.5 + 5 * (x / d), amp: (x) => envPts(x / d, [0, 0, 0.3, 0.5, 0.9, 1, 1, 0.2]), color: 'pink' }));
  layer(out, 0.7, (b) => {
    const tone = (k: number, g: number) =>
      addOsc(b, sr, 0, d, (x) => k * f * Math.pow(2, 2.2 * (x / d)) * (1 + 0.03 * Math.sin(TAU * (6 + 20 * (x / d)) * x)), (x) => g * envPts(x / d, [0, 0, 0.2, 0.4, 0.95, 1, 1, 0]));
    tone(1, 1);
    tone(1.5, 0.4);
    tone(2.01, 0.2);
  });
  layer(out, 0.7, (b) => {
    let gap = 0.34;
    for (let t = 0.08; t < d - 0.08; t += gap, gap *= 0.8) thump(b, sr, { t, f0: 75, f1: 44, glide: 0.02, tau: 0.05, amp: 0.4 + 0.6 * (t / d) });
  });
  layer(out, 0.45, (b) => growl(b, c, 0, d, (u) => 40 * (1 + 0.6 * u), 0.4, 0.6));
  return reverb(out, sr, { t60: 1.4, wet: 0.3, pre: 0.02, lowcut: 60, size: 1.3 });
}

/**
 * vanilla entity.warden.sonic_boom: the shriek let go: a crack, a vast pressure-wave of a thud, and a ringing,
 * warbling tone rolling away down the caves
 */
function sonicBoom(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = 1.6;
  const out = alloc(d + 0.3, sr);
  const f = rng.range(240, 280);
  layer(out, 0.7, (b) => burst(b, sr, rng, { dur: 0.12, tau: 0.02, hp: 1200 }));
  layer(out, 1, (b) => thump(b, sr, { f0: 150, f1: 38, glide: 0.06, tau: 0.35, h2: 0.4, dur: d }));
  layer(out, 0.75, (b) => {
    const ring = (k: number, g: number) =>
      addOsc(b, sr, 0.01, d, (x) => k * f * envExpPts(x / d, [0, 1, 0.3, 0.7, 1, 0.55]) * (1 + 0.015 * Math.sin(TAU * 9 * x)), (x) => g * Math.exp(-x * 2.2) * Math.min(1, x / 0.015));
    ring(1, 1);
    ring(1.013, 0.9);
    ring(2, 0.35);
  });
  layer(out, 0.5, (b) => sweep(b, sr, rng, { t: 0.02, dur: 1.2, f: (x) => 2400 * Math.pow(0.25, x / 1.2), q: 0.8, amp: (x) => Math.exp(-x * 3), color: 'pink' }));
  return reverb(softClip(out, 1.5), sr, { t60: 3.5, wet: 0.55, pre: 0.02, lowcut: 50, size: 2 });
}

/** vanilla entity.warden.attack_impact: its blow landing: a huge, meaty thud with bone cracking in it */
function attackImpact(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  layer(out, 1, (b) => thump(b, sr, { f0: 120, f1: 42, glide: 0.025, tau: 0.09, h2: 0.5 }));
  layer(out, 0.7, (b) => burst(b, sr, rng, { dur: 0.25, tau: 0.04, lp: 900, color: 'brown' }));
  layer(out, 0.45, (b) => burst(b, sr, rng, { dur: 0.05, tau: 0.008, bp: [1800, 1.2] }));
  layer(out, 0.4, (b) => impact(b, sr, rng, { modes: [95, 0.6, 0.18, 170, 0.4, 0.12, 310, 0.2, 0.07], jitter: 0.05 }));
  return reverb(out, sr, { t60: 1.2, wet: 0.3, pre: 0.01, lowcut: 60, size: 1.2 });
}

/** vanilla entity.warden.hurt: a short, harsh bark of a growl, more affronted than pained */
function hurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.55, 0.75);
  const out = alloc(d + 0.3, sr);
  const base = rng.range(55, 65);
  layer(out, 1, (b) => growl(b, c, 0, d, (u) => base * envPts(u, [0, 1.4, 0.2, 1.9, 1, 1.1]), 0.9));
  layer(out, 0.5, (b) => rattle(b, c, 0, d * 0.7, 30));
  layer(out, 0.4, (b) => rumble(b, c, 0, d, base * 0.7));
  return reverb(softClip(out, 1.4), sr, { t60: 1.4, wet: 0.35, pre: 0.015, lowcut: 90, size: 1.3 });
}

/** vanilla entity.warden.death: a last long groan sinking away, the rattle slowing to nothing, a breath let out */
function death(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(3.2, 3.8);
  const out = alloc(d + 0.4, sr);
  const base = rng.range(50, 58);
  layer(out, 1, (b) => growl(b, c, 0, d * 0.75, (u) => base * envPts(u, [0, 1.5, 0.15, 1.7, 0.5, 1.1, 1, 0.55]), 0.7));
  layer(out, 0.4, (b) => rattle(b, c, 0.1, d * 0.7, 12));
  layer(out, 0.5, (b) => rumble(b, c, 0, d * 0.75, base * 0.6));
  layer(out, 0.35, (b) => sweep(b, sr, rng, { t: d * 0.68, dur: d * 0.32, f: (x) => 900 - 600 * (x / (d * 0.32)), q: 1, amp: (x) => envPts(x / (d * 0.32), [0, 0, 0.15, 1, 1, 0]), color: 'pink' }));
  return reverb(out, sr, { t60: 3, wet: 0.5, pre: 0.03, lowcut: 70, size: 1.7 });
}

/** vanilla entity.warden.step: its tread: the soft, heavy thud of a great weight coming down, with a wet give to it */
function step(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  const f = rng.range(0.9, 1.1);
  layer(out, 1, (b) => thump(b, sr, { f0: 85 * f, f1: 48 * f, glide: 0.02, tau: 0.07, h2: 0.3 }));
  layer(out, 0.6, (b) => burst(b, sr, rng, { dur: 0.18, attack: 0.008, tau: 0.035, bp: [320 * f, 1.5], color: 'brown' }));
  layer(out, 0.2, (b) => ticks(b, sr, rng, { dur: 0.12, rate: 60, energy: () => 1, f: [700, 2000], t60: [0.01, 0.03] }));
  return reverb(lowpass(out, 1800, sr), sr, { t60: 0.8, wet: 0.2, pre: 0.01, lowcut: 60, size: 1.1 });
}

/** vanilla entity.warden.tendril_clicks: the tendrils on its head quivering at what it has heard: a quick chatter of dry clicks */
function tendrilClicks(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.5, 0.8);
  const out = alloc(d + 0.2, sr);
  layer(out, 1, (b) =>
    ticks(b, sr, rng, { dur: d, rate: rng.range(35, 50), energy: (x) => envPts(x / d, [0, 1, 0.6, 0.8, 1, 0]), f: [900, 2600], t60: [0.008, 0.025], click: 0.8, heavy: 1.2, ratios: [1, 2.1, 3.4], weights: [1, 0.4, 0.2] }),
  );
  return reverb(out, sr, { t60: 1, wet: 0.25, pre: 0.01, lowcut: 200, size: 1.1 });
}

export function wardenSounds(): Record<string, SoundGen> {
  return {
    'entity.warden.nearby_close': sound('entity.warden.nearby_close', 4, (c) => nearby(c, 0)),
    'entity.warden.nearby_closer': sound('entity.warden.nearby_closer', 3, (c) => nearby(c, 1)),
    'entity.warden.nearby_closest': sound('entity.warden.nearby_closest', 3, (c) => nearby(c, 2)),
    'entity.warden.listening_angry': sound('entity.warden.listening_angry', 4, listeningAngry),
    // (M4: the warden)
    'entity.warden.ambient': sound('entity.warden.ambient', 5, ambient),
    'entity.warden.agitated': sound('entity.warden.agitated', 6, agitated),
    'entity.warden.angry': sound('entity.warden.angry', 6, angry),
    'entity.warden.listening': sound('entity.warden.listening', 5, listening),
    'entity.warden.heartbeat': sound('entity.warden.heartbeat', 4, heartbeat),
    'entity.warden.sniff': sound('entity.warden.sniff', 4, sniff),
    'entity.warden.roar': sound('entity.warden.roar', 6, roar),
    'entity.warden.emerge': sound('entity.warden.emerge', 1, emerge),
    'entity.warden.dig': sound('entity.warden.dig', 1, dig),
    'entity.warden.sonic_charge': sound('entity.warden.sonic_charge', 4, sonicCharge),
    'entity.warden.sonic_boom': sound('entity.warden.sonic_boom', 4, sonicBoom),
    'entity.warden.attack_impact': sound('entity.warden.attack_impact', 3, attackImpact),
    'entity.warden.hurt': sound('entity.warden.hurt', 4, hurt),
    'entity.warden.death': sound('entity.warden.death', 2, death),
    'entity.warden.step': sound('entity.warden.step', 4, step),
    'entity.warden.tendril_clicks': sound('entity.warden.tendril_clicks', 6, tendrilClicks),
  };
}

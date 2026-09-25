// The deep dark's block sounds (vanilla SoundType.SCULK, SCULK_VEIN, SCULK_CATALYST, SCULK_SENSOR, SCULK_SHRIEKER and
// CANDLE, and their own events in sounds.json): sculk is wet flesh, squelching underfoot and tearing when it's broken,
// the vein a thinner smear of it; the catalyst and the shrieker have bone in them, knocking and crunching; the sensor
// ticks as its tendrils twitch. The events: sculk spreading (a crawling squelch) and a charge popping; the sensor's
// tendrils clicking and falling still; the catalyst's bloom (a soul breathed out, rising, with a shimmer); the
// shrieker's shriek; amethyst resonating; and the candle's own: wax knocked and set down, its flame fluttering, and
// the puff of it going out.

import type { SoundGen } from '../synth';
import { alloc, envBump, envPts, layer, reverb, addOsc, TAU } from './dsp';
import { type Ctx, pitched, sound } from './registry';
import { bubble, burst, impact, sweep, thump, ticks } from './texture';

/**
 * a squelch of wet flesh at `t`: a resonance swept through noise (rising as it's pressed, falling as it tears
 * away), a few bubbles popping in it, and a soft thump; `size` scales how big and low it is
 */
function squelch(b: Float32Array, c: Ctx, t: number, size: number, bright = 1): void {
  const { sr, rng } = c;
  const d = rng.range(0.07, 0.12) * size;
  const fA = rng.range(260, 420) * bright / Math.sqrt(size), fB = fA * rng.range(2.2, 3.6);
  const up = rng.chance(0.6);
  sweep(b, sr, rng, {
    t, dur: d, q: 4.5,
    f: (x) => (up ? fA * Math.pow(fB / fA, x / d) : fB * Math.pow(fA / fB, x / d)),
    amp: (x) => envBump(x, d * 0.3, d * 0.7),
  });
  const nb = 1 + rng.int(3);
  for (let k = 0; k < nb; k++) bubble(b, sr, t + rng.range(0.01, d), rng.range(300, 800) * bright, rng.range(0.15, 0.4), undefined, rng.range(0.3, 0.8));
  thump(b, sr, { t, f0: 150 / Math.sqrt(size), f1: 90 / Math.sqrt(size), tau: 0.025 * size, amp: 0.25, attack: 0.004 });
}

/** a knock of bone at `t`: dry, hollow, quickly gone */
function boneKnock(b: Float32Array, c: Ctx, t: number, amp = 1): void {
  const { sr, rng } = c;
  const f = rng.range(1300, 1900);
  impact(b, sr, rng, {
    t, gain: amp,
    modes: [f, 1, 0.012, f * rng.range(1.9, 2.3), 0.45, 0.008, f * 0.62, 0.5, 0.018, 420, 0.3, 0.03],
    jitter: 0.04, noise: 0.9, noiseTau: 0.003, noiseBp: [2600, 0.8],
  });
}

/** vanilla block.sculk.step (and the others' steps, `bone` for the catalyst and the shrieker, `clicks` for the sensor) */
function fleshStep(c: Ctx, size: number, bright: number, bone = false, clicks = false): Float32Array {
  const out = alloc(0.3 * size, c.sr);
  layer(out, 1, (b) => squelch(b, c, 0, size, bright));
  if (bone) layer(out, 0.5, (b) => boneKnock(b, c, c.rng.range(0, 0.02)));
  if (clicks) layer(out, 0.4, (b) => ticks(b, c.sr, c.rng, { dur: 0.12, rate: 60, energy: (t) => Math.exp(-t / 0.05), f: [1800, 3600], t60: [0.004, 0.01], click: 0.5 }));
  return out;
}

/** vanilla block.sculk.break and the rest: the flesh torn away, a second squelch after the first, and gristle ticking */
function fleshBreak(c: Ctx, size: number, bright: number, bone = false, clicks = false): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.55 * size, sr);
  layer(out, 1, (b) => {
    squelch(b, c, 0, size * 1.3, bright);
    squelch(b, c, rng.range(0.06, 0.12) * size, size, bright * 1.2);
  });
  layer(out, 0.4, (b) => ticks(b, sr, rng, { dur: 0.25 * size, rate: 90, energy: (t) => Math.exp(-t / 0.08), f: [700, 2400], t60: [0.004, 0.015], click: 0.4 }));
  if (bone)
    layer(out, 0.7, (b) => {
      boneKnock(b, c, 0);
      ticks(b, sr, rng, { dur: 0.2, rate: 70, energy: (t) => Math.exp(-t / 0.06), f: [1100, 2800], t60: [0.006, 0.02], click: 0.6 });
    });
  if (clicks) layer(out, 0.45, (b) => ticks(b, sr, rng, { t: 0.05, dur: 0.25, rate: 45, energy: (t) => Math.exp(-t / 0.1), f: [1800, 3600], t60: [0.004, 0.01], click: 0.5 }));
  return out;
}

/** vanilla block.sculk.spread: sculk crawling over stone, squelch after soft squelch */
function spread(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  layer(out, 1, (b) => {
    let t = 0;
    while (t < 0.6) {
      squelch(b, c, t, rng.range(0.8, 1.4), rng.range(0.7, 1.1));
      t += rng.range(0.07, 0.16);
    }
  });
  return out;
}

/** vanilla block.sculk.charge: a charge popping, a soft wet puff with a faint note in it */
function charge(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.35, sr);
  layer(out, 1, (b) => burst(b, sr, rng, { dur: 0.25, attack: 0.004, tau: 0.04, lp: 1600 }));
  layer(out, 0.5, (b) => bubble(b, sr, 0.005, rng.range(500, 700), 1, 0.05, 0.9));
  layer(out, 0.25, (b) => addOsc(b, sr, 0, 0.3, (t) => 900 + 400 * t, (t) => envBump(t, 0.02, 0.25)));
  return out;
}

/** vanilla block.sculk_sensor.clicking: the tendrils twitching, a dry rattle of clicks that swells and dies away */
function clicking(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.1, sr);
  const en = (t: number) => envPts(t, [0, 0.2, 0.08, 1, 0.5, 0.8, 0.95, 0]);
  layer(out, 1, (b) => ticks(b, sr, rng, { dur: 1, rate: 70, energy: en, f: [1500, 3800], t60: [0.003, 0.009], ratios: [1, 1.7, 2.9], weights: [1, 0.5, 0.3], click: 0.8 }));
  layer(out, 0.35, (b) => ticks(b, sr, rng, { dur: 1, rate: 25, energy: en, f: [500, 900], t60: [0.008, 0.02], click: 0.3 }));
  return out;
}

/** vanilla block.sculk_sensor.clicking_stop: the last few clicks, slowing */
function clickingStop(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  layer(out, 1, (b) => {
    let t = 0, gap = 0.03;
    for (let k = 0; k < 4; k++) {
      ticks(b, sr, rng, { t, dur: 0.012, rate: 400, energy: () => 1, f: [1600, 3200], t60: [0.004, 0.008], click: 0.7, amp: 1 - k * 0.2 });
      t += gap;
      gap *= 1.6;
    }
  });
  return out;
}

/**
 * vanilla block.sculk_catalyst.bloom: a soul breathed out of it: a breathy rise with a wet start, and a faint glassy
 * shimmer over it, in a little room
 */
function bloom(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.4, sr);
  layer(out, 0.6, (b) => squelch(b, c, 0, 1.2, 0.9));
  layer(out, 1, (b) => sweep(b, sr, rng, { t: 0.02, dur: 1.2, f: (t) => 350 * Math.pow(5, Math.min(1, t / 0.9)), q: 2.2, amp: (t) => envBump(t, 0.35, 0.85), color: 'pink' }));
  layer(out, 0.35, (b) => {
    const base = rng.range(880, 1100);
    for (const r of [1, 1.5, 2.02, 2.99]) addOsc(b, sr, 0.15, 1.1, (t) => base * r * (1 + 0.004 * Math.sin(TAU * 6 * t)), (t) => envBump(t, 0.3, 0.8) / r);
  });
  return reverb(out, sr, { t60: 1.1, wet: 0.35, lowcut: 200 });
}

/**
 * vanilla block.sculk_shrieker.shriek: a long, hollow shriek: a rasping voice sliding up and falling away, a breathy
 * howl round it, echoing
 */
function shriek(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(2.6, sr);
  const f0 = rng.range(430, 520);
  const contour = (t: number) => f0 * envPts(t, [0, 0.9, 0.25, 1.6, 0.9, 1.9, 1.6, 1.35, 2.2, 0.8]);
  const amp = (t: number) => envPts(t, [0, 0, 0.12, 1, 1.4, 0.85, 2.0, 0.4, 2.35, 0]);
  // (the voice: odd and even partials, roughened by a fast wobble)
  layer(out, 1, (b) => {
    for (const [h, g] of [[1, 1], [2, 0.55], [3, 0.4], [4, 0.2], [5, 0.15]] as [number, number][])
      addOsc(b, sr, 0, 2.4, (t) => contour(t) * h * (1 + 0.012 * Math.sin(TAU * 7 * t)), (t) => amp(t) * g * (0.75 + 0.25 * Math.sin(TAU * 31 * t)));
  });
  // (the howl: noise through two moving formants)
  layer(out, 0.8, (b) => {
    sweep(b, sr, rng, { dur: 2.4, f: (t) => contour(t) * 2.2, q: 6, amp });
    sweep(b, sr, rng, { dur: 2.4, f: (t) => contour(t) * 4.5, q: 5, amp: (t) => amp(t) * 0.6 });
  });
  return reverb(out, sr, { t60: 1.8, wet: 0.5, pre: 0.02, lowcut: 250 });
}

/** vanilla block.amethyst_block.resonate: amethyst answering a vibration, a clear note ringing long */
function resonate(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(2.2, sr);
  const f = rng.range(1180, 1260);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: [f, 1, 1.6, f * 2.76, 0.4, 0.9, f * 5.4, 0.2, 0.5, f * 0.5, 0.25, 1.2], noise: 0.2, noiseTau: 0.002, noiseBp: [4000, 1] }));
  return reverb(out, sr, { t60: 1.2, wet: 0.3 });
}

/** vanilla block.candle.step / break / place: a stick of wax knocked, a soft dull tap */
function wax(c: Ctx, strong: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.18, sr);
  const f = rng.range(700, 1000);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: [f, 1, 0.01, f * 2.3, 0.3, 0.006, 260, 0.5, 0.02], jitter: 0.05, noise: strong ? 1.2 : 0.8, noiseTau: 0.004, noiseBp: [1800, 0.8] }));
  if (strong) layer(out, 0.4, (b) => burst(b, sr, rng, { dur: 0.1, attack: 0.002, tau: 0.02, lp: 900 }));
  return out;
}

/** vanilla block.candle.ambient: the flame fluttering, a tiny crackle */
function candleAmbient(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 1, (b) => ticks(b, sr, rng, { dur: 0.5, rate: 18, energy: () => 1, f: [2000, 5000], t60: [0.002, 0.006], click: 1 }));
  layer(out, 0.3, (b) => burst(b, sr, rng, { dur: 0.5, attack: 0.1, tau: 0.2, bp: [900, 1.2] }));
  return out;
}

/** vanilla block.candle.extinguish: the flame blown out, a soft puff */
function extinguish(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  layer(out, 1, (b) => burst(b, sr, rng, { dur: 0.35, attack: 0.012, tau: 0.07, lp: 1400 }));
  layer(out, 0.3, (b) => burst(b, sr, rng, { t: 0.02, dur: 0.2, attack: 0.01, tau: 0.05, hp: 3000 }));
  return out;
}

export function sculkSounds(): Record<string, SoundGen> {
  const S: Record<string, SoundGen> = {};
  /** a sound type's five: its break and place, its step, its hit (the step at half pitch) and its fall (at 0.75) */
  const group = (mat: string, brk: SoundGen, step: SoundGen, place: SoundGen = brk) => {
    S[`block.${mat}.break`] = brk;
    S[`block.${mat}.step`] = step;
    S[`block.${mat}.place`] = place;
    S[`block.${mat}.hit`] = pitched(step, 0.5);
    S[`block.${mat}.fall`] = pitched(step, 0.75);
  };
  group('sculk', sound('block.sculk.break', 5, (c) => fleshBreak(c, 1, 1)), sound('block.sculk.step', 6, (c) => fleshStep(c, 1, 1)), sound('block.sculk.place', 5, (c) => fleshBreak(c, 0.8, 1.1)));
  group('sculk_vein', sound('block.sculk_vein.break', 4, (c) => fleshBreak(c, 0.6, 1.5)), sound('block.sculk_vein.step', 5, (c) => fleshStep(c, 0.6, 1.5)));
  group('sculk_catalyst', sound('block.sculk_catalyst.break', 4, (c) => fleshBreak(c, 1.1, 0.9, true)), sound('block.sculk_catalyst.step', 5, (c) => fleshStep(c, 1, 0.9, true)), sound('block.sculk_catalyst.place', 4, (c) => fleshBreak(c, 0.9, 1, true)));
  group('sculk_sensor', sound('block.sculk_sensor.break', 4, (c) => fleshBreak(c, 0.9, 1.1, false, true)), sound('block.sculk_sensor.step', 5, (c) => fleshStep(c, 0.9, 1.1, false, true)), sound('block.sculk_sensor.place', 4, (c) => fleshBreak(c, 0.8, 1.2, false, true)));
  group('sculk_shrieker', sound('block.sculk_shrieker.break', 4, (c) => fleshBreak(c, 1, 1, true)), sound('block.sculk_shrieker.step', 5, (c) => fleshStep(c, 1, 1, true)), sound('block.sculk_shrieker.place', 4, (c) => fleshBreak(c, 0.85, 1.1, true)));
  group('candle', sound('block.candle.break', 4, (c) => wax(c, true)), sound('block.candle.step', 5, (c) => wax(c, false)), sound('block.candle.place', 4, (c) => wax(c, true)));
  S['block.sculk.spread'] = sound('block.sculk.spread', 4, spread);
  S['block.sculk.charge'] = sound('block.sculk.charge', 4, charge);
  S['block.sculk_sensor.clicking'] = sound('block.sculk_sensor.clicking', 4, clicking);
  S['block.sculk_sensor.clicking_stop'] = sound('block.sculk_sensor.clicking_stop', 4, clickingStop);
  S['block.sculk_catalyst.bloom'] = sound('block.sculk_catalyst.bloom', 3, bloom);
  S['block.sculk_shrieker.shriek'] = sound('block.sculk_shrieker.shriek', 3, shriek);
  S['block.amethyst_block.resonate'] = sound('block.amethyst_block.resonate', 4, resonate);
  S['block.candle.ambient'] = sound('block.candle.ambient', 4, candleAmbient);
  S['block.candle.extinguish'] = sound('block.candle.extinguish', 3, extinguish);
  return S;
}

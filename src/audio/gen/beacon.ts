// The beacon (vanilla sounds.json block.beacon.*): its light made into sound, glassy, crystalline notes over a low
// electric hum. Powering on once its pyramid is complete, a soft whoosh rises and a bright tone swells up out of it,
// climbing two octaves while the overtones of the beam sing out one after another above it and glints of crystal
// sparkle round it, and it settles into a bright, shimmering chord that rings on and fades (activate). While it
// shines it hums every four seconds: a soft, steady electric drone, slowly warbling, with faint glassy overtones
// shimmering high above it, swelling in and fading out so that one hum passes smoothly into the next (ambient).
// Powering off, the chord sinks, the shimmer going out of it, a sweep falling through it and the hum sliding down
// under it until it all dies away (deactivate). Its powers chosen: a bright chime, a quick flourish of glassy notes
// running upward to a ringing chord, and a short tail of sparkle (power_select). Every take starts at once (no
// lead-in of near silence). Takes: activate 1, ambient 1, deactivate 1, power_select 1.

import type { SoundGen } from '../synth';
import { TAU, addMode, addOsc, alloc, clamp, envPts, fadeIn, layer, lowpass, mixInto, smooth } from './dsp';
import { type Ctx, sound } from './registry';
import { sweep } from './texture';
import { reverbHalf } from './world';

/** the hum's note (G2) */
const HUM = 98;
/** the chord the beam rings in over it: G with its ninth and major seventh, open and bright */
const CHORD = [392, 587.33, 783.99, 880, 987.77, 1479.98];
/** the sparkle's notes, two and three octaves higher in the same chord, low to high */
const SPARKS = [1567.98, 1760, 1975.53, 2349.32, 2637.02, 2959.96, 3135.96, 3520, 3951.07];
/** the power-select flourish: G, B, D, running up two octaves */
const RUN = [783.99, 987.77, 1174.66, 1567.98, 1975.53, 2349.32];
/** the overtones of the hum, falling away quickly (the odd ones a little stronger: an electric buzz in it) */
const HUM_PARTIALS = [1, 0.3, 0.22, 0.08, 0.08, 0.03, 0.035, 0.012, 0.015];

/** held at 1, then fading (as a cosine) to nothing over the last `r` of `d` seconds */
function holdFade(t: number, d: number, r: number): number {
  if (t <= d - r) return 1;
  if (t >= d) return 0;
  return 0.5 + 0.5 * Math.cos((Math.PI * (t - d + r)) / r);
}

/** `fn` (over seconds) worked out every millisecond for `dur` seconds and read back along straight lines between */
function tab(fn: (t: number) => number, dur: number): (t: number) => number {
  const n = Math.ceil(dur * 1000) + 2;
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = fn(i / 1000);
  return (t) => {
    const x = t * 1000;
    if (!(x > 0)) return v[0];
    const i = x | 0;
    return i >= n - 1 ? v[n - 1] : v[i] + (v[i + 1] - v[i]) * (x - i);
  };
}

/**
 * a glassy note: a pure tone with a twin a hair sharp of it beating slowly against it (its shimmer), a faint octave
 * and twelfth, and a high glint that flickers; `f` its pitch and `amp` its level over seconds from `t0` (`amp` must
 * start at 0), `shine` (0..1 over the same seconds) how much of the shimmer and the glint it has left
 */
function glass(b: Float32Array, c: Ctx, t0: number, dur: number, f: (t: number) => number, amp: (t: number) => number, shine: (t: number) => number = () => 1): void {
  const { sr, rng } = c;
  const twin = 1 + rng.range(0.0015, 0.003);
  const fl = rng.range(3, 6), fp = rng.next() * TAU;
  const F = tab(f, dur), A = tab(amp, dur), S = tab(shine, dur);
  const G = tab((t) => S(t) * A(t) * (0.5 + 0.5 * Math.sin(TAU * fl * t + fp)), dur);
  addOsc(b, sr, t0, dur, F, A);
  addOsc(b, sr, t0, dur, (t) => twin * F(t), (t) => 0.3 * S(t) * A(t));
  addOsc(b, sr, t0, dur, (t) => 2 * F(t), (t) => 0.14 * A(t));
  addOsc(b, sr, t0, dur, (t) => 3 * F(t), (t) => 0.05 * A(t));
  addOsc(b, sr, t0, dur, (t) => 5.4 * F(t), (t) => 0.04 * G(t));
}

/** a glassy note struck softly at `t0`: up in `att` seconds, ringing away in `t60`, two inharmonic partials over it dying sooner */
function chime(b: Float32Array, sr: number, t0: number, f: number, a: number, t60: number, att = 0.006): void {
  const k = Math.log(1000) / t60;
  const dur = Math.min(b.length / sr - t0, 1.3 * t60);
  const env = (t: number, kk: number) => a * smooth(t / att) * Math.exp(-kk * t) * holdFade(t, dur, 0.05);
  addOsc(b, sr, t0, dur, () => f, (t) => env(t, k));
  addOsc(b, sr, t0, dur, () => 2.32 * f, (t) => 0.25 * env(t, 2.5 * k));
  addOsc(b, sr, t0, dur, () => 4.25 * f, (t) => 0.08 * env(t, 5 * k));
}

/** one glint of sparkle at `t`: a tiny struck crystal, its note `f` and two faint partials over it, gone in `t60` */
function ping(b: Float32Array, sr: number, t: number, f: number, a: number, t60: number): void {
  const s = Math.round(t * sr);
  const x = new Float32Array(Math.max(0, Math.min(b.length - s, Math.ceil(1.34 * t60 * sr))));
  if (!x.length) return;
  addMode(x, 0, sr, f, a, t60);
  addMode(x, 0, sr, f * 2.32, 0.3 * a, 0.35 * t60);
  addMode(x, 0, sr, f * 4.25, 0.12 * a, 0.18 * t60);
  // (struck, but not clicking: a millisecond's onset)
  fadeIn(x, Math.round(0.001 * sr));
  mixInto(b, x, s);
}

/**
 * a sparkle: glints strewn from `t0` to `t1` (s), up to `rate` a second, thinned and softened by `dens` (0..1, over
 * seconds); each takes one of SPARKS near `reg` (0 the lowest, 1 the highest, over seconds)
 */
function sparkle(b: Float32Array, c: Ctx, t0: number, t1: number, rate: number, dens: (t: number) => number, reg: (t: number) => number): void {
  const { sr, rng } = c;
  let t = t0;
  for (;;) {
    t += -Math.log(1 - rng.next()) / rate;
    if (t >= t1) break;
    const d = dens(t);
    if (rng.next() >= d) continue;
    const k = clamp(Math.round(reg(t) * (SPARKS.length - 1) + rng.range(-1.5, 1.5)), 0, SPARKS.length - 1);
    ping(b, sr, t, SPARKS[k] * rng.range(0.998, 1.002), d * rng.range(0.35, 1), rng.logRange(0.15, 0.5));
  }
}

/**
 * the beacon's electric hum: a low note `f` (over seconds from `t0`) and its overtones, the lower ones with a twin
 * `beat` Hz sharp of them warbling slowly against them; `amp` its level (it must start at 0). They all start in step,
 * which makes the hum's wave peaky: it sounds softer for the same peak level
 */
function hum(b: Float32Array, c: Ctx, t0: number, dur: number, f: (t: number) => number, amp: (t: number) => number, beat = 0.35): void {
  const { sr } = c;
  const F = tab(f, dur), A = tab(amp, dur);
  HUM_PARTIALS.forEach((g, k) => {
    const h = k + 1;
    addOsc(b, sr, t0, dur, (t) => h * F(t), (t) => g * A(t), Math.PI / 2);
    if (h <= 6) addOsc(b, sr, t0, dur, (t) => h * (F(t) + beat), (t) => 0.3 * g * A(t), Math.PI / 2);
  });
}

/**
 * the beam's whistle: a buzz on `f` (every overtone of it up to 6 kHz) through a narrow resonance at `fc`, so that its
 * overtones ring out one after another as the resonance passes them; `f`, `fc` and `amp` over seconds from `t0`
 */
function whistle(b: Float32Array, c: Ctx, t0: number, dur: number, f: (t: number) => number, fc: (t: number) => number, q: number, amp: (t: number) => number): void {
  const { sr } = c;
  const F = tab(f, dur), C = tab(fc, dur), A = tab(amp, dur);
  let fmax = 1;
  for (let t = 0; t <= dur; t += 0.01) fmax = Math.max(fmax, F(t));
  const K = Math.max(1, Math.floor(Math.min(6000, 0.45 * sr) / fmax));
  for (let k = 1; k <= K; k++) {
    const g = (t: number) => {
      const x = (k * F(t)) / C(t);
      const r = q * (x - 1 / x);
      return A(t) / Math.sqrt(k * (1 + r * r));
    };
    // (each overtone only while it can be heard: from when the resonance nears it till it has gone well by)
    let ta = -1, tb = -1;
    for (let t = 0; t <= dur; t += 0.005) {
      if (g(t) > 1e-3) {
        if (ta < 0) ta = t;
        tb = t;
      }
    }
    if (ta < 0) continue;
    const t1 = ta, d = Math.min(dur, tb + 0.005) - ta;
    addOsc(b, sr, t0 + t1, d, (t) => k * F(t + t1), (t) => g(t + t1) * holdFade(t, d, 0.005));
  }
}

/** vanilla block.beacon.activate: a whoosh rising, a bright tone swelling up out of it, sparkling, settling into a chord */
function activate(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const L = 2.15;
  const out = alloc(L, sr);
  // (the climb, over the first second, eased in and out)
  const up = (t: number) => smooth(t / 1.0);
  // the whoosh: soft, breathy noise rising and growing more resonant, until the tone takes over from it
  layer(out, 0.5, (b) =>
    sweep(b, sr, rng, {
      dur: 1.35,
      f: (t) => 300 * Math.pow(12, up(t)),
      q: (t) => 1.1 + 3.5 * up(t),
      amp: (t) => smooth(t / 0.04) * envPts(t, [0, 0.5, 0.45, 1, 0.9, 0.55, 1.35, 0]),
      color: 'pink',
    }),
  );
  // the hum, rising an octave into its note, swelling, then settling under the chord
  layer(out, 0.38, (b) => hum(b, c, 0, L, (t) => HUM * Math.pow(2, up(t) - 1), (t) => smooth(t / 0.04) * envPts(t, [0, 0.4, 0.9, 1, 1.4, 0.5, L, 0])));
  // the beam's overtones singing out one after another as a resonance climbs through them with the whoosh
  layer(out, 0.45, (b) => {
    const fc = (t: number) => 330 * Math.pow(11, up(t));
    whistle(b, c, 0, 1.5, (t) => 2 * HUM * Math.pow(2, up(t) - 1), fc, 9, (t) => smooth(t / 0.05) * envPts(t, [0, 0.25, 0.8, 1, 1.05, 0.5, 1.5, 0]));
  });
  // the bright tone swelling up out of it all: a glassy note gliding up two octaves to the chord's G
  layer(out, 0.65, (b) => glass(b, c, 0, L, (t) => CHORD[2] * Math.pow(4, up(t) - 1), (t) => smooth(t / 0.05) * envPts(t, [0, 0.15, 0.9, 1, 1.5, 0.55, L, 0])));
  // the chord it settles into, its other notes blooming one after another as the climb arrives, ringing on and fading
  layer(out, 1, (b) =>
    CHORD.forEach((f, i) => {
      if (i === 2) return;
      const t0 = 0.7 + 0.06 * i, d = L - t0;
      glass(b, c, t0, d, () => f, (t) => (smooth(t / 0.15) * Math.exp(-t / 2.5) * holdFade(t, d, 0.8)) / (1 + 0.15 * i));
    }),
  );
  // a gentle sparkle, thickening and climbing with the tone, thinning out as the chord rings
  layer(out, 0.36, (b) => sparkle(b, c, 0.12, 1.8, 45, (t) => envPts(t, [0, 0, 0.3, 0.25, 0.95, 1, 1.3, 0.55, 1.8, 0]), (t) => Math.min(1, t / 1.1)));
  return reverbHalf(out, sr, { t60: 1.8, hf: 0.6, wet: 0.5, dry: 1, tail: 0.65, pre: 0.02 });
}

/** vanilla block.beacon.ambient: a soft, low electric hum, warbling slowly, faint glassy overtones shimmering above it */
function ambient(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const L = 3.55;
  const out = alloc(L, sr);
  // (swelling in at once and fading away at the end, so that one hum passes smoothly into the next)
  const env = (t: number) => (t < 0.4 ? Math.sin((0.5 * Math.PI * t) / 0.4) : 1) * holdFade(t, L, 1);
  const wr = rng.range(0.17, 0.27), wp = rng.next() * TAU, ar = rng.range(0.38, 0.52), ap = rng.next() * TAU;
  const f = (t: number) => HUM * (1 + 0.003 * Math.sin(TAU * wr * t + wp));
  const a = (t: number) => env(t) * (1 + 0.15 * Math.sin(TAU * ar * t + ap));
  layer(out, 1, (b) => {
    hum(b, c, 0, L, f, a, 0.3);
    // (and a soft undertone an octave below)
    addOsc(b, sr, 0, L, (t) => 0.5 * f(t), (t) => 0.3 * a(t), Math.PI / 2);
    lowpass(b, 1000, sr);
  });
  // faint glassy overtones high above, the hum's own, each with a twin beating against it, swelling and fading by turns
  layer(out, 0.075, (b) => {
    for (const h of [16, 20, 24, 30]) {
      const r = rng.range(0.2, 0.45), p = rng.next() * TAU, tw = 1 + rng.range(0.0012, 0.0025);
      const g = (t: number) => (env(t) * (0.55 + 0.45 * Math.sin(TAU * r * t + p))) / Math.sqrt(h / 16);
      addOsc(b, sr, 0, L, (t) => h * f(t), g);
      addOsc(b, sr, 0, L, (t) => h * tw * f(t), (t) => 0.6 * g(t));
    }
  });
  return reverbHalf(out, sr, { t60: 1.1, hf: 0.5, wet: 0.28, dry: 1, tail: 0.4, pre: 0.015 });
}

/** vanilla block.beacon.deactivate: the chord sinking, its shimmer going out of it, a sweep falling through it and dying away */
function deactivate(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const L = 1.85;
  const out = alloc(L, sr);
  // (the sinking: slow at first, then faster and faster)
  const down = (t: number) => Math.pow(Math.min(1, t / 1.6), 1.3);
  const shine = (t: number) => Math.exp(-t / 0.3);
  // the chord, ringing at once, sinking two octaves and losing its shimmer, its top notes dying first
  layer(out, 1, (b) =>
    CHORD.forEach((f, i) => {
      const d = 1.75 - 0.12 * i;
      glass(b, c, 0, d, (t) => f * Math.pow(0.25, down(t)), (t) => (smooth(t / 0.04) * Math.exp(-t / (0.65 - 0.05 * i)) * holdFade(t, d, 0.3)) / (1 + 0.3 * i), shine);
    }),
  );
  // the overtones falling away as a resonance sinks back down through them
  layer(out, 0.4, (b) => {
    const fc = (t: number) => 3600 * Math.pow(1 / 12, Math.min(1, t / 1.2));
    whistle(b, c, 0, 1.4, (t) => 2 * HUM * Math.pow(0.5, down(t)), fc, 9, (t) => smooth(t / 0.04) * Math.exp(-t / 0.45) * holdFade(t, 1.4, 0.3));
  });
  // the sweep falling through it all, dying away
  layer(out, 0.3, (b) =>
    sweep(b, sr, rng, {
      dur: 1.6,
      f: (t) => 4500 * Math.pow(250 / 4500, Math.min(1, t / 1.4)),
      q: (t) => 7 - 4 * Math.min(1, t / 1.4),
      amp: (t) => smooth(t / 0.04) * Math.exp(-t / 0.5) * holdFade(t, 1.6, 0.4),
      color: 'pink',
    }),
  );
  // the hum sliding down under it
  layer(out, 0.55, (b) => hum(b, c, 0, L, (t) => HUM * Math.pow(0.42, down(t)), (t) => smooth(t / 0.04) * Math.exp(-t / 0.7) * holdFade(t, L, 0.4)));
  // the last glints of sparkle going out
  layer(out, 0.2, (b) => sparkle(b, c, 0.03, 0.7, 35, (t) => Math.exp(-t / 0.2), (t) => Math.max(0, 0.8 - t)));
  return reverbHalf(out, sr, { t60: 1.4, hf: 0.5, wet: 0.45, dry: 1, tail: 0.55, pre: 0.02 });
}

/** vanilla block.beacon.power_select: a bright chime, a flourish of glassy notes running up to a ringing chord, sparkle after it */
function powerSelect(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const L = 1.25;
  const out = alloc(L, sr);
  // the flourish: glassy notes running quickly upward, each struck softly and ringing
  layer(out, 1, (b) => RUN.forEach((f, i) => chime(b, sr, 0.004 + 0.04 * i, f * rng.range(0.999, 1.001), 1 - 0.07 * i, 0.5 + 0.12 * i)));
  // the swish under it: a resonance flying up through a bright buzz, and a breath of air rushing up with it
  layer(out, 0.32, (b) => whistle(b, c, 0, 0.42, () => 392, (t) => 700 * Math.pow(7, smooth(t / 0.26)), 8, (t) => smooth(t / 0.035) * holdFade(t, 0.42, 0.2)));
  layer(out, 0.18, (b) =>
    sweep(b, sr, rng, { dur: 0.38, f: (t) => 1400 * Math.pow(5, smooth(t / 0.28)), q: 1.8, amp: (t) => smooth(t / 0.035) * holdFade(t, 0.38, 0.22), color: 'pink' }),
  );
  // the chord it lands on (its G, D and G), swelling and ringing away
  layer(out, 0.55, (b) =>
    [RUN[0], RUN[2], RUN[3]].forEach((f, i) => glass(b, c, 0.2, L - 0.2, () => f, (t) => (smooth(t / 0.05) * Math.exp(-t / 0.35) * holdFade(t, L - 0.2, 0.3)) / (1 + 0.3 * i))),
  );
  // the sparkling tail
  layer(out, 0.32, (b) => sparkle(b, c, 0.18, 1.0, 40, (t) => envPts(t, [0, 0, 0.22, 1, 1.0, 0]), (t) => 0.95 - 0.4 * t));
  return reverbHalf(out, sr, { t60: 1.1, hf: 0.6, wet: 0.45, dry: 1, tail: 0.5, pre: 0.015 });
}

export function beaconSounds(): Record<string, SoundGen> {
  return {
    'block.beacon.activate': sound('block.beacon.activate', 1, activate, { fadeOut: 0.25 }),
    'block.beacon.ambient': sound('block.beacon.ambient', 1, ambient, { fadeOut: 0.25 }),
    'block.beacon.deactivate': sound('block.beacon.deactivate', 1, deactivate, { fadeOut: 0.25 }),
    'block.beacon.power_select': sound('block.beacon.power_select', 1, powerSelect, { fadeOut: 0.2 }),
  };
}

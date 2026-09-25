// The conduit's sounds (Stage 5: ocean), synthesized: it wakes with a deep swell and a chord rising up out of the
// water, and powers down with the chord sinking back into the deep; awake, it throbs with a slow low hum every few
// seconds and breathes little soft pulses in between (vanilla block.conduit.ambient and ambient.short), and it zaps
// its prey with a crackling jolt that booms off through the water.

import type { SoundGen } from '../synth';
import { addOsc, alloc, envBump, envPts, layer, lowpass } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, sweep } from './texture';
import { reverbHalf } from './world';

/** a soft, round tone: a sine with its octave and twelfth, the upper ones fainter */
function tone(b: Float32Array, sr: number, t0: number, dur: number, f: (t: number) => number, amp: (t: number) => number): void {
  addOsc(b, sr, t0, dur, f, amp);
  addOsc(b, sr, t0, dur, (t) => 2 * f(t), (t) => 0.35 * amp(t), 1.1);
  addOsc(b, sr, t0, dur, (t) => 3 * f(t), (t) => 0.12 * amp(t), 2.3);
}

/** the notes the conduit sings in (an open A chord with its sixth and ninth) */
const CHORD = [110, 164.8, 220, 277.2, 329.6];
const SHIMMER = [440, 493.9, 554.4, 659.3, 740, 880, 987.8];

/** vanilla block.conduit.activate: a deep swell, and a chord rising out of the water and ringing on */
function conduitActivate(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(3, sr);
  layer(out, 0.8, (b) => addOsc(b, sr, 0, 2.2, (t) => 38 + 30 * Math.min(1, t / 0.8), (t) => envBump(t, 0.5, 1.6)));
  layer(out, 1, (b) => {
    CHORD.forEach((f, i) => {
      const t0 = 0.15 + i * 0.12;
      tone(b, sr, t0, 2.6 - i * 0.12, (t) => f * (0.75 + 0.25 * Math.min(1, t / 0.6)), (t) => envPts(t, [0, 0, 0.35, 1, 0.9, 0.7, 2.4 - i * 0.12, 0]) / (1 + i * 0.3));
    });
  });
  layer(out, 0.4, (b) => sweep(b, sr, rng, { dur: 1.4, f: (t) => 300 + 2200 * Math.pow(t / 1.4, 1.5), q: 3, amp: (t) => envBump(t, 0.9, 0.5), color: 'pink' }));
  layer(out, 0.22, (b) => {
    for (let i = 0; i < 10; i++) bubble(b, sr, rng.range(0.2, 1.8), rng.range(500, 1500), rng.range(0.3, 1), 0.03, 0.5);
  });
  lowpass(out, 3800, sr);
  return reverbHalf(out, sr, { t60: 2.2, wet: 0.5, dry: 1 });
}

/** vanilla block.conduit.deactivate: the chord bending down and fading, a last low sigh under it */
function conduitDeactivate(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(2.6, sr);
  layer(out, 1, (b) => {
    CHORD.forEach((f, i) => {
      const d = 1.9 - i * 0.18;
      tone(b, sr, 0, d, (t) => f * (1 - 0.45 * Math.pow(Math.min(1, t / d), 1.4)), (t) => envPts(t, [0, 0, 0.04, 1, d * 0.4, 0.6, d, 0]) / (1 + i * 0.3));
    });
  });
  layer(out, 0.7, (b) => addOsc(b, sr, 0, 1.8, (t) => 70 - 30 * Math.min(1, t / 1.8), (t) => envBump(t, 0.08, 1.7)));
  layer(out, 0.3, (b) => sweep(b, sr, rng, { dur: 1.2, f: (t) => 1800 - 1400 * Math.min(1, t / 1.2), q: 2.5, amp: (t) => envBump(t, 0.05, 1.1), color: 'pink' }));
  lowpass(out, 3200, sr);
  return reverbHalf(out, sr, { t60: 1.8, wet: 0.45, dry: 1 });
}

/** vanilla block.conduit.ambient: a slow, deep throb, like something breathing in the deep water */
function conduitAmbient(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const dur = 3.6;
  const out = alloc(dur, sr);
  const throb = (t: number) => (0.55 + 0.45 * Math.sin(2 * Math.PI * 0.9 * t - Math.PI / 2)) * envPts(t, [0, 0, 0.6, 1, dur - 0.9, 1, dur, 0]);
  layer(out, 1, (b) => {
    addOsc(b, sr, 0, dur, () => 55, throb);
    addOsc(b, sr, 0, dur, () => 55.6, (t) => 0.8 * throb(t), 0.7);
    addOsc(b, sr, 0, dur, () => 82.4, (t) => 0.45 * throb(t), 1.9);
    addOsc(b, sr, 0, dur, () => 110.3, (t) => 0.25 * throb(t), 0.3);
  });
  layer(out, 0.3, (b) => sweep(b, sr, rng, { dur, f: (t) => 350 + 150 * Math.sin(2 * Math.PI * 0.45 * t), q: 4, amp: throb, color: 'pink' }));
  layer(out, 0.18, (b) => {
    for (let i = 0; i < 3; i++) {
      const t0 = rng.range(0.4, dur - 1.2);
      const f = rng.pick(SHIMMER);
      addOsc(b, sr, t0, 1.1, () => f, (t) => envBump(t, 0.25, 0.85));
    }
  });
  lowpass(out, 2500, sr);
  return reverbHalf(out, sr, { t60: 2.5, wet: 0.5, dry: 1 });
}

/** vanilla block.conduit.ambient.short: one soft pulse, a low "whum" with a faint ringing note over it */
function conduitAmbientShort(c: Ctx): Float32Array {
  const { sr, rng, v } = c;
  const d = rng.range(0.55, 0.9);
  const out = alloc(d + 0.4, sr);
  const f0 = rng.range(95, 140);
  layer(out, 1, (b) => tone(b, sr, 0, d, (t) => f0 * (1.25 - 0.3 * Math.min(1, t / d)), (t) => envBump(t, d * 0.25, d * 0.75)));
  layer(out, 0.35, (b) => {
    const f = SHIMMER[v % SHIMMER.length] * (v >= SHIMMER.length ? 2 : 1);
    addOsc(b, sr, d * 0.1, d, () => f, (t) => envBump(t, 0.03, d * 0.9));
    addOsc(b, sr, d * 0.1, d, () => f * 1.5, (t) => 0.3 * envBump(t, 0.03, d * 0.6), 0.8);
  });
  layer(out, 0.15, (b) => sweep(b, sr, rng, { dur: d, f: (t) => 600 + 500 * (t / d), q: 3, amp: (t) => envBump(t, d * 0.3, d * 0.7), color: 'pink' }));
  lowpass(out, 3000, sr);
  return reverbHalf(out, sr, { t60: 1.4, wet: 0.45, dry: 1 });
}

/** vanilla block.conduit.attack.target: a crackling jolt, a falling zap and a boom rolling away through the water */
function conduitAttack(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.2, sr);
  const fz = rng.range(1300, 1800);
  layer(out, 1, (b) => {
    // the zap: a falling tone, roughened by a fast wobble
    addOsc(b, sr, 0, 0.45, (t) => fz * Math.exp(-t / 0.12) + 180 + 90 * Math.sin(2 * Math.PI * 55 * t), (t) => envBump(t, 0.004, 0.42));
    addOsc(b, sr, 0, 0.3, (t) => 1.51 * (fz * Math.exp(-t / 0.1) + 180), (t) => 0.4 * envBump(t, 0.003, 0.28), 0.6);
  });
  layer(out, 0.6, (b) => {
    // the crackle
    sweep(b, sr, rng, { dur: 0.3, f: (t) => 4200 - 9000 * t, q: 1.2, amp: (t) => envBump(t, 0.002, 0.28) * (0.5 + 0.5 * Math.sign(Math.sin(2 * Math.PI * 38 * t))), color: 'white' });
  });
  layer(out, 0.75, (b) => addOsc(b, sr, 0.01, 0.9, (t) => 75 * Math.exp(-t / 0.5) + 35, (t) => envBump(t, 0.015, 0.85)));
  layer(out, 0.15, (b) => {
    for (let i = 0; i < 6; i++) bubble(b, sr, rng.range(0.05, 0.6), rng.range(600, 1600), rng.range(0.3, 1), 0.02, 0.6);
  });
  lowpass(out, 5000, sr);
  return reverbHalf(out, sr, { t60: 1.2, wet: 0.35, dry: 1 });
}

export function conduitSounds(): Record<string, SoundGen> {
  return {
    'block.conduit.activate': sound('block.conduit.activate', 1, conduitActivate),
    'block.conduit.deactivate': sound('block.conduit.deactivate', 1, conduitDeactivate),
    'block.conduit.ambient': sound('block.conduit.ambient', 1, conduitAmbient),
    'block.conduit.ambient.short': sound('block.conduit.ambient.short', 9, conduitAmbientShort),
    'block.conduit.attack.target': sound('block.conduit.attack.target', 3, conduitAttack),
  };
}
